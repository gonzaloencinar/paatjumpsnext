import { randomBytes } from "node:crypto";
import { ES_MAINLAND_THRESHOLD } from "lib/shipping";
import { mergeName, tagStoreLinks } from "@/lib/crm/campaign-engine";
import { CRM } from "@/lib/crm/config";
import { formatMoney } from "@/lib/crm/format";
import { getActiveGeneralPromotion } from "@/lib/crm/promotions";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import { sendCrmEmail } from "@/lib/email/send";
import { CampaignEmail } from "@/lib/email/templates/campaign";
import { unsubscribeUrl } from "@/lib/email/tokens";
import { createShopifyDiscount, hasAdminToken } from "@/lib/shopify/admin";

// Runner de secuencias (plan §16.4). Mismo tick del cron que las campañas:
// reclama inscripciones vencidas con lease de 15 min (mutation transaccional
// claimDueEnrollments, el sustituto del RPC skip locked — devuelve además la
// automatización, los pasos, el contacto y el checkout de cada inscripción),
// envía el paso que toca y programa el siguiente. enrollment.step = índice
// del PRÓXIMO paso a enviar dentro de la lista de pasos efectivos.

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

  // A poco del umbral de envío gratis peninsular → decírselo: añadir algo al
  // carrito suele ser mejor incentivo (y más barato) que un descuento
  const freeShippingNudge =
    checkout.total_price != null &&
    checkout.total_price > 0 &&
    checkout.total_price < ES_MAINLAND_THRESHOLD &&
    currency === "EUR"
      ? `<p style="margin:0 0 20px;font-size:13px;color:rgba(255,255,255,0.6);">Te faltan ${formatMoney(ES_MAINLAND_THRESHOLD - checkout.total_price)} para el envío gratis (península y Baleares).</p>`
      : "";

  return `<table width="100%" role="presentation" style="border-collapse:collapse;margin:20px 0;font-size:14px;">${rows}${total}</table>${freeShippingNudge}`;
}

const DISCOUNT_PCT = 15;
const DISCOUNT_TTL_HOURS = 48;
// Sin caracteres ambiguos (0/O, 1/I/L) — el código se teclea a mano a veces
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRecoveryCode() {
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes)
    suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `VUELVE${DISCOUNT_PCT}-${suffix}`;
}

// {{codigo_descuento}} → el mejor código disponible para cerrar la compra.
// Con promo general activa (lanzamiento) se recuerda ESA — ya es pública por
// diseño y descuenta más. Sin ella, código personal creado al vuelo en
// Shopify: usageLimit 1 (un solo uso REAL, aunque se comparta) + una vez por
// cliente + caducidad de 48 h. Si el contacto ya tiene uno vigente (≥6 h de
// vida) se reusa: reintentos y carritos seguidos no acumulan códigos.
async function resolveRecoveryDiscount(
  contactId: string,
): Promise<string | null> {
  const promo = await getActiveGeneralPromotion();
  if (promo) return promo.code;

  const existing = await convexQuery(api.contacts.latestDiscountCodeForContact, {
    contactId,
    minExpiresAt: Date.now() + 6 * 3_600_000,
  });
  if (existing) return existing;

  if (!hasAdminToken()) return null;
  const code = generateRecoveryCode();
  const expiresAt = Date.now() + DISCOUNT_TTL_HOURS * 3_600_000;
  const shopifyDiscountId = await createShopifyDiscount({
    title: `Recuperación de carrito · ${code}`,
    code,
    percentage: DISCOUNT_PCT,
    startsAt: new Date().toISOString(),
    endsAt: new Date(expiresAt).toISOString(),
    oncePerCustomer: true,
    usageLimit: 1,
  });
  await convexMutation(api.contacts.insertDiscountCode, {
    code,
    contactId,
    percentage: DISCOUNT_PCT,
    expiresAt,
    shopifyDiscountId,
  });
  return code;
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

  const due = await convexMutation(api.engine.claimDueEnrollments, {
    limit: budget,
  });
  if (due.length === 0) return summary;

  let consecutiveFailures = 0;

  const cancel = (id: string) =>
    convexMutation(api.engine.updateEnrollment, {
      id,
      status: "canceled",
      nextRunAt: null,
    });

  for (const enrollment of due) {
    const contact = enrollment.contact;
    // Pasos en la forma legacy que espera effectiveSteps (pura, sin tocar)
    const steps = effectiveSteps(
      enrollment.steps.map((s) => ({
        id: s.id,
        enabled: s.enabled,
        subject: s.subject,
        preheader: s.preheader,
        body_html: s.bodyHtml,
        position: s.position,
        delay_minutes: s.delayMinutes,
      })),
    );
    const step = steps[enrollment.step];

    // Baja/rebote/queja → fuera de la secuencia
    if (!contact || contact.status !== "subscribed") {
      await cancel(enrollment.id);
      summary.canceled += 1;
      continue;
    }

    // Recuperación de carrito: si el checkout ya convirtió, desapareció o el
    // cliente lo vació, no hay nada que recuperar
    const checkout = enrollment.checkout;
    const checkoutEmptied =
      Array.isArray(checkout?.lineItems) && checkout.lineItems.length === 0;
    if (
      enrollment.hasCheckout &&
      (!checkout || checkout.status !== "abandoned" || checkoutEmptied)
    ) {
      await cancel(enrollment.id);
      summary.canceled += 1;
      continue;
    }

    // No queda paso que enviar (borrados/desactivados después de inscribir)
    if (!step) {
      await convexMutation(api.engine.updateEnrollment, {
        id: enrollment.id,
        status: "completed",
        nextRunAt: null,
      });
      summary.completed += 1;
      continue;
    }

    try {
      // {{codigo_descuento}} → mejor código disponible (promo general activa
      // o personal de un solo uso creado en Shopify). Solo si el paso lo usa;
      // sin código resoluble el paso FALLA (retry) — nunca sale un email cojo.
      const usesDiscount = /\{\{\s*codigo_descuento\s*\}\}/i.test(
        `${step.subject ?? ""} ${step.body_html ?? ""}`,
      );
      let discountCode: string | null = null;
      if (usesDiscount) {
        discountCode = await resolveRecoveryDiscount(contact.id);
        if (!discountCode) {
          throw new Error(
            "sin código de descuento resoluble (¿SHOPIFY_ADMIN_API_TOKEN?)",
          );
        }
      }

      // {{url_carrito}} → recovery_url del checkout (fallback: el carrito de
      // la web) — se resuelve siempre para que el tag nunca llegue al email.
      // Con código, el enlace lo lleva puesto: `discount` lo auto-aplica el
      // checkout de Shopify; `code` lo aplica nuestra tienda (pj_discount).
      let cartUrl = checkout?.recoveryUrl ?? `${CRM.baseUrl}/cart`;
      if (discountCode) {
        try {
          const url = new URL(cartUrl);
          url.searchParams.set(
            checkout?.recoveryUrl ? "discount" : "code",
            discountCode,
          );
          cartUrl = url.toString();
        } catch {
          // recovery_url malformada: el enlace sale sin código (el email lo muestra)
        }
      }

      const mergeAll = (text: string) =>
        mergeName(text, contact.firstName)
          .replace(/\{\{\s*url_carrito\s*\}\}/gi, cartUrl)
          .replace(/\{\{\s*codigo_descuento\s*\}\}/gi, discountCode ?? "");

      // {{productos_carrito}} → resumen del carrito. Sin el tag, el resumen se
      // añade solo al final del email (los emails de carrito siempre lo llevan);
      // en asunto/preheader el tag se elimina sin más.
      const cartHtml = checkout
        ? cartSummaryHtml({
            line_items: checkout.lineItems,
            total_price: checkout.totalPrice,
            currency: checkout.currency,
          })
        : "";
      let bodyHtml = mergeAll(step.body_html ?? "");
      if (/\{\{\s*productos_carrito\s*\}\}/i.test(bodyHtml)) {
        bodyHtml = bodyHtml.replace(
          /\{\{\s*productos_carrito\s*\}\}/gi,
          cartHtml,
        );
      } else if (cartHtml) {
        bodyHtml += cartHtml;
      }

      // Enlaces a la tienda: mismos UTM que las campañas (utm_campaign =
      // nombre de la automatización) + ?pj= para re-identificar al volver
      bodyHtml = tagStoreLinks(
        bodyHtml,
        enrollment.automationName || "automatizacion",
        contact.email,
      );

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
        automationId: enrollment.automationId,
        automationStepId: step.id,
        checkoutId: checkout?.checkoutId ?? null, // id legacy de Shopify
        // Determinista por inscripción+paso: el reintento del lease no duplica
        idempotencyKey: `automation:${enrollment.id}:step:${enrollment.step}`,
      });

      if ("skipped" in result) {
        // En supresiones → cancelar la inscripción entera
        await cancel(enrollment.id);
        summary.skipped += 1;
      } else {
        summary.sent += 1;
        // Primer email de recuperación de este checkout → sella
        // recovery_sent_at (base de la métrica "recuperados" del webhook)
        if (checkout && enrollment.step === 0) {
          await convexMutation(api.engine.sealRecoverySent, {
            checkoutId: checkout.id,
          });
        }
        const next = steps[enrollment.step + 1];
        if (next) {
          await convexMutation(api.engine.updateEnrollment, {
            id: enrollment.id,
            step: enrollment.step + 1,
            nextRunAt: Date.now() + next.delay_minutes * 60_000,
          });
        } else {
          await convexMutation(api.engine.updateEnrollment, {
            id: enrollment.id,
            step: enrollment.step + 1,
            status: "completed",
            nextRunAt: null,
          });
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
