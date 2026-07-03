import type { ReactNode } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { transportSend } from "./provider";
import { unsubscribeUrl } from "./tokens";

type CrmEmail = {
  to: string;
  subject: string;
  react: ReactNode;
  template: string;
  contactId?: string | null;
  campaignId?: string | null;
  automationId?: string | null;
  automationStepId?: string | null;
  idempotencyKey?: string;
};

// TODA salida de email pasa por aquí (plan §5/§11): consulta suppressions
// antes de enviar, registra en email_sends, y pone las cabeceras de baja
// RFC 8058. Los blasts de campañas (Fase 3) reutilizarán esta función.
export async function sendCrmEmail(input: CrmEmail) {
  const supabase = createAdminClient();
  const email = input.to.trim().toLowerCase();

  const { data: suppressed } = await supabase
    .from("suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (suppressed) return { skipped: "suppressed" as const };

  const { data: send, error: insertError } = await supabase
    .from("email_sends")
    .insert({
      contact_id: input.contactId ?? null,
      campaign_id: input.campaignId ?? null,
      automation_id: input.automationId ?? null,
      automation_step_id: input.automationStepId ?? null,
      template: input.template,
      subject: input.subject,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const unsubscribe = unsubscribeUrl(email);

  try {
    const { providerMessageId } = await transportSend({
      to: email,
      subject: input.subject,
      react: input.react,
      idempotencyKey: input.idempotencyKey ?? send.id,
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    await supabase
      .from("email_sends")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
      })
      .eq("id", send.id);

    if (input.contactId) {
      await supabase.from("events").insert({
        contact_id: input.contactId,
        type: "email_sent",
        payload: { template: input.template, email_send_id: send.id },
      });
    }

    return { sent: true as const, emailSendId: send.id };
  } catch (error) {
    await supabase
      .from("email_sends")
      .update({ status: "failed" })
      .eq("id", send.id);
    throw error;
  }
}
