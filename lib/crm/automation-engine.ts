import { mergeName } from "@/lib/crm/campaign-engine";
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

  const [stepsRes, contactsRes] = await Promise.all([
    supabase
      .from("automation_steps")
      .select("*")
      .in("automation_id", automationIds),
    supabase
      .from("contacts")
      .select("id, email, first_name, status")
      .in("id", contactIds),
  ]);
  if (stepsRes.error) throw stepsRes.error;
  if (contactsRes.error) throw contactsRes.error;

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

    // No queda paso que enviar (borrados/desactivados después de inscribir)
    if (!step) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", next_run_at: null })
        .eq("id", enrollment.id);
      summary.completed += 1;
      continue;
    }

    try {
      const result = await sendCrmEmail({
        to: contact.email,
        subject: mergeName(step.subject ?? "", contact.first_name),
        react: CampaignEmail({
          bodyHtml: mergeName(step.body_html ?? "", contact.first_name),
          preheader: step.preheader,
          unsubscribeUrl: unsubscribeUrl(contact.email),
        }),
        template: "automation_step",
        contactId: contact.id,
        automationId: enrollment.automation_id,
        automationStepId: step.id,
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
