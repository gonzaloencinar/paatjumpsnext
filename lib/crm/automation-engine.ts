import { mergeName, tagStoreLinks } from "@/lib/crm/campaign-engine";
import { CRM } from "@/lib/crm/config";
import { formatMoney } from "@/lib/crm/format";
import { sendCrmEmail } from "@/lib/email/send";
import { CampaignEmail } from "@/lib/email/templates/campaign";
import { unsubscribeUrl } from "@/lib/email/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

// Runner de secuencias (plan §16.4). Mismo tick del cron que las campañas:
// reclama inscripciones vencidas con lease de 15 min (RPC skip locked), envía
// el paso que toca y programa el siguiente. enrollment.step = índice del
// PRÓXIMO paso a enviar dentro de la lista de pasos efectivos.

const SEND_INTERVAL_MS = 600;
const MAX_CONSECUTIVE_FAILURES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StepLike = {
  enabled: boolean;
  subject: string | null;
  body_html: string | null;
  position: number;
};

// Un paso solo participa en la secuencia si está activo Y tiene contenido:
// así un paso a medio escribir nunca sale vacío.
export function effectiveSteps<T extends StepLike>(steps: T[]): T[] {
  return steps
    .filter(
      (step) => step.enabled && step.subject?.trim() && step.body_html?.trim(),
    )
    .sort((a, b) => a.position - b.position);
}

// line_items de checkouts tal y como los guarda el webhook (jsonb)
type CheckoutLineItem = {
  title?: string;
  variant?: string | null;
  quantity?: number;
  price?: string | null;
};

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const ROW_STYLE =
  "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1);";

// Resumen del carrito abandonado para el email de recuperación: qué dejó y
// cuánto suma. Con estilos inline (los <style> no llegan a todos los clientes).
export function cartSummaryHtml(checkout: {
  line_items: unknown;
  total_price: number | null;
  currency: string | null;
}): string {
  const items = Array.isArray(checkout.line_items)
    ? (checkout.line_items as CheckoutLineItem[])
    : [];
  if (items.length === 0) return "";
  const currency = checkout.currency ?? "EUR";

  const rows = items
    .map((item) => {
      const quantity = item.quantity ?? 1;
      const label = `${quantity > 1 ? `${quantity} × ` : ""}${escapeHtml(item.title ?? "")}${
        item.variant ? ` · ${escapeHtml(item.variant)}` : ""
      }`;
      const price =
        item.price != null && item.price !== ""
          ? formatMoney(Number(item.price) * quantity, currency)
          : "";
      return `<tr><td style="${ROW_STYLE}">${label}</td><td align="right" style="${ROW_STYLE}white-space:nowrap;">${price}</td></tr>`;
    })
    .join("");

  const total =
    checkout.total_price != null
      ? `<tr><td style="padding:12px 0 0;font-weight:700;color:#ffffff;">Total</td><td align="right" style="padding:12px 0 0;font-weight:700;color:#ffffff;white-space:nowrap;">${formatMoney(checkout.total_price, currency)}</td></tr>`
      : "";

  return `<table width="100%" role="presentation" style="border-collapse:collapse;margin:20px 0;font-size:14px;">${rows}${total}</table>`;
}

export type AutomationTickSummary = {
  sent: number;
  skipped: number; // suprimidos → inscripción cancelada
  failed: number;
  completed: number;
  canceled: number;
};

export async function processAutomations(
  budget: number,
): Promise<AutomationTickSummary> {
  const summary: AutomationTickSummary = {
    sent: 0,
    skipped: 0,
    failed: 0,
    completed: 0,
    canceled: 0,
  };
  if (budget <= 0) return summary;

  const supabase = createAdminClient();
  const { data: due, error } = await supabase.rpc("claim_due_enrollments", {
    p_limit: budget,
  });
  if (error) throw error;
  if (!due || due.length === 0) return summary;

  const automationIds = [
    ...new Set(
      due.map((e) => e.automation_id).filter((v): v is string => v !== null),
    ),
  ];
  const contactIds = [
    ...new Set(
      due.map((e) => e.contact_id).filter((v): v is string => v !== null),
    ),
  ];

  const checkoutIds = [
    ...new Set(
      due.map((e) => e.checkout_id).filter((v): v is number => v !== null),
    ),
  ];

  const [stepsRes, automationsRes, contactsRes, checkoutsRes] =
    await Promise.all([
      supabase
        .from("automation_steps")
        .select("*")
        .in("automation_id", automationIds),
      supabase.from("automations").select("id, name").in("id", automationIds),
      supabase
        .from("contacts")
        .select("id, email, first_name, status")
        .in("id", contactIds),
      checkoutIds.length > 0
        ? supabase
            .from("checkouts")
            .select(
              "id, recovery_url, status, line_items, total_price, currency",
            )
            .in("id", checkoutIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (stepsRes.error) throw stepsRes.error;
  if (automationsRes.error) throw automationsRes.error;
  if (contactsRes.error) throw contactsRes.error;
  if (checkoutsRes.error) throw checkoutsRes.error;
  const automationNameById = new Map(
    (automationsRes.data ?? []).map((automation) => [
      automation.id,
      automation.name,
    ]),
  );
  const checkoutById = new Map(
    (checkoutsRes.data ?? []).map((checkout) => [checkout.id, checkout]),
  );

  const stepsByAutomation = new Map<string, Tables<"automation_steps">[]>(
    automationIds.map((id) => [
      id,
      effectiveSteps(
        (stepsRes.data ?? []).filter((step) => step.automation_id === id),
      ),
    ]),
  );
  const contactById = new Map(
    (contactsRes.data ?? []).map((contact) => [contact.id, contact]),
  );

  let consecutiveFailures = 0;

  for (const enrollment of due) {
    const contact = enrollment.contact_id
      ? contactById.get(enrollment.contact_id)
      : undefined;
    const steps = enrollment.automation_id
      ? (stepsByAutomation.get(enrollment.automation_id) ?? [])
      : [];
    const step = steps[enrollment.step];

    // Baja/rebote/queja → fuera de la secuencia
    if (!contact || contact.status !== "subscribed") {
      await supabase
        .from("automation_enrollments")
        .update({ status: "canceled", next_run_at: null })
        .eq("id", enrollment.id);
      summary.canceled += 1;
      continue;
    }

    // Recuperación de carrito: si el checkout ya convirtió, desapareció o el
    // cliente lo vació, no hay nada que recuperar
    const checkout = enrollment.checkout_id
      ? checkoutById.get(enrollment.checkout_id)
      : null;
    const checkoutEmptied =
      Array.isArray(checkout?.line_items) && checkout.line_items.length === 0;
    if (
      enrollment.checkout_id &&
      (!checkout || checkout.status !== "abandoned" || checkoutEmptied)
    ) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "canceled", next_run_at: null })
        .eq("id", enrollment.id);
      summary.canceled += 1;
      continue;
    }

    // No queda paso que enviar (borrados/desactivados después de inscribir)
    if (!step) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", next_run_at: null })
        .eq("id", enrollment.id);
      summary.completed += 1;
      continue;
    }

    // {{url_carrito}} → recovery_url del checkout (fallback: el carrito de la
    // web) — se resuelve siempre para que el tag nunca llegue al email
    const cartUrl = checkout?.recovery_url ?? `${CRM.baseUrl}/cart`;
    const mergeAll = (text: string) =>
      mergeName(text, contact.first_name).replace(
        /\{\{\s*url_carrito\s*\}\}/gi,
        cartUrl,
      );

    // {{productos_carrito}} → resumen del carrito. Sin el tag, el resumen se
    // añade solo al final del email (los emails de carrito siempre lo llevan);
    // en asunto/preheader el tag se elimina sin más.
    const cartHtml = checkout ? cartSummaryHtml(checkout) : "";
    let bodyHtml = mergeAll(step.body_html ?? "");
    if (/\{\{\s*productos_carrito\s*\}\}/i.test(bodyHtml)) {
      bodyHtml = bodyHtml.replace(
        /\{\{\s*productos_carrito\s*\}\}/gi,
        cartHtml,
      );
    } else if (cartHtml) {
      bodyHtml += cartHtml;
    }

    // Enlaces a la tienda: mismos UTM que las campañas (utm_campaign = nombre
    // de la automatización) + ?pj= para re-identificar el navegador al volver
    bodyHtml = tagStoreLinks(
      bodyHtml,
      (enrollment.automation_id
        ? automationNameById.get(enrollment.automation_id)
        : null) ?? "automatizacion",
      contact.email,
    );

    try {
      const result = await sendCrmEmail({
        to: contact.email,
        subject: mergeAll(step.subject ?? "").replace(
          /\{\{\s*productos_carrito\s*\}\}/gi,
          "",
        ),
        react: CampaignEmail({
          bodyHtml,
          preheader: step.preheader,
          unsubscribeUrl: unsubscribeUrl(contact.email),
        }),
        template: "automation_step",
        contactId: contact.id,
        automationId: enrollment.automation_id,
        automationStepId: step.id,
        checkoutId: enrollment.checkout_id,
        // Determinista por inscripción+paso: el reintento del lease no duplica
        idempotencyKey: `automation:${enrollment.id}:step:${enrollment.step}`,
      });

      if ("skipped" in result) {
        // En supresiones → cancelar la inscripción entera
        await supabase
          .from("automation_enrollments")
          .update({ status: "canceled", next_run_at: null })
          .eq("id", enrollment.id);
        summary.skipped += 1;
      } else {
        summary.sent += 1;
        // Primer email de recuperación de este checkout → sella
        // recovery_sent_at (base de la métrica "recuperados" del webhook)
        if (enrollment.checkout_id && enrollment.step === 0) {
          await supabase
            .from("checkouts")
            .update({ recovery_sent_at: new Date().toISOString() })
            .eq("id", enrollment.checkout_id)
            .is("recovery_sent_at", null);
        }
        const next = steps[enrollment.step + 1];
        if (next) {
          await supabase
            .from("automation_enrollments")
            .update({
              step: enrollment.step + 1,
              next_run_at: new Date(
                Date.now() + next.delay_minutes * 60_000,
              ).toISOString(),
            })
            .eq("id", enrollment.id);
        } else {
          await supabase
            .from("automation_enrollments")
            .update({
              step: enrollment.step + 1,
              status: "completed",
              next_run_at: null,
            })
            .eq("id", enrollment.id);
          summary.completed += 1;
        }
      }
      consecutiveFailures = 0;
    } catch (error) {
      // El lease del claim reintenta esta inscripción en ~15 min
      console.error(
        `[automations] fallo en inscripción ${enrollment.id}`,
        error,
      );
      summary.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return summary;
    }
    await sleep(SEND_INTERVAL_MS);
  }

  return summary;
}

// Inscribe un checkout (real de Shopify o carrito sintético del storefront)
// en la secuencia de recuperación de carrito, y reinicia el reloj del paso 0
// en cada toque: mientras el cliente siga activo, aún no está "abandonado".
// Lo usan el webhook de checkouts y el tracking del carrito de la app.
export async function enrollCheckoutInCartRecovery(
  supabase: ReturnType<typeof createAdminClient>,
  contactId: string,
  checkoutId: number,
) {
  const { data: automation } = await supabase
    .from("automations")
    .select("id, enabled, automation_steps(*)")
    .eq("key", "cart_recovery")
    .maybeSingle();
  if (!automation?.enabled) return;
  const [first] = effectiveSteps(automation.automation_steps ?? []);
  if (!first) return;

  const nextRunAt = new Date(
    Date.now() + first.delay_minutes * 60_000,
  ).toISOString();

  // Nueva inscripción (ignora si ya existe para este checkout)…
  await supabase.from("automation_enrollments").upsert(
    {
      automation_id: automation.id,
      contact_id: contactId,
      checkout_id: checkoutId,
      step: 0,
      status: "active",
      next_run_at: nextRunAt,
    },
    { ignoreDuplicates: true },
  );

  // …y si sigue en el paso 0 sin enviar, cada toque reinicia el reloj
  await supabase
    .from("automation_enrollments")
    .update({ next_run_at: nextRunAt })
    .eq("automation_id", automation.id)
    .eq("checkout_id", checkoutId)
    .eq("status", "active")
    .eq("step", 0);
}

// Alta nueva (o re-suscripción) → inscribir en las secuencias de trigger
// 'signup' activas con al menos un paso efectivo. El primer envío se programa
// a alta + delay del paso 1 (el D0 con el código lo manda /api/subscribe).
export async function enrollContactInSignupAutomations(contactId: string) {
  const supabase = createAdminClient();
  const { data: automations } = await supabase
    .from("automations")
    .select("id, automation_steps(*)")
    .eq("trigger", "signup")
    .eq("enabled", true);

  for (const automation of automations ?? []) {
    const [first] = effectiveSteps(automation.automation_steps ?? []);
    if (!first) continue;
    // on conflict do nothing → respeta el índice parcial de "una inscripción
    // activa por automatización+contacto"
    const { error } = await supabase.from("automation_enrollments").upsert(
      {
        automation_id: automation.id,
        contact_id: contactId,
        step: 0,
        status: "active",
        next_run_at: new Date(
          Date.now() + first.delay_minutes * 60_000,
        ).toISOString(),
      },
      { ignoreDuplicates: true },
    );
    if (error) {
      console.error(
        `[automations] no se pudo inscribir ${contactId} en ${automation.id}`,
        error,
      );
    }
  }
}
