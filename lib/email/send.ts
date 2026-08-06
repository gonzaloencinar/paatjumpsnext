import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { convexMutation } from "@/lib/convex/server";
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
  checkoutId?: number | null; // emails de recuperación → su carrito (/admin/carts)
  idempotencyKey?: string;
};

// TODA salida de email pasa por aquí (plan §5/§11): el gate de suppressions
// y el registro 'queued' en email_sends van en una sola mutation Convex
// (transaccional), luego se envía por Resend con las cabeceras de baja
// RFC 8058 y se sella sent/failed. Los engines (campañas/automatizaciones)
// reutilizan esta función con su firma intacta.
export async function sendCrmEmail(input: CrmEmail) {
  const email = input.to.trim().toLowerCase();

  const queued = await convexMutation(api.emails.createQueued, {
    email,
    template: input.template,
    subject: input.subject,
    contactId: input.contactId ?? null,
    campaignId: input.campaignId ?? null,
    automationId: input.automationId ?? null,
    automationStepId: input.automationStepId ?? null,
    checkoutId: input.checkoutId ?? null,
  });
  if (queued.status === "suppressed") return { skipped: "suppressed" as const };

  const unsubscribe = unsubscribeUrl(email);

  try {
    const { providerMessageId } = await transportSend({
      to: email,
      subject: input.subject,
      react: input.react,
      idempotencyKey: input.idempotencyKey ?? queued.id,
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    // markSent registra también el evento email_sent del contacto vinculado
    await convexMutation(api.emails.markSent, {
      id: queued.id,
      providerMessageId,
    });

    return { sent: true as const, emailSendId: queued.id };
  } catch (error) {
    await convexMutation(api.emails.markFailed, { id: queued.id });
    throw error;
  }
}
