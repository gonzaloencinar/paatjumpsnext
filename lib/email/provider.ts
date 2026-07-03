import { Resend } from "resend";
import type { ReactNode } from "react";
import { CRM } from "@/lib/crm/config";

// Único punto de contacto con el ESP (plan §9): migrar de Resend a SES en el
// futuro = tocar solo este fichero. La lógica CRM (supresiones, email_sends)
// vive en lib/email/send.ts, no aquí.

let client: Resend | null = null;

function resend() {
  return (client ??= new Resend(process.env.RESEND_API_KEY!));
}

export type TransportInput = {
  to: string;
  subject: string;
  react: ReactNode;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export async function transportSend(input: TransportInput) {
  const { data, error } = await resend().emails.send(
    {
      from: CRM.emailFrom,
      to: [input.to],
      subject: input.subject,
      react: input.react,
      headers: input.headers,
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (error || !data) {
    throw new Error(`Resend: ${error?.message ?? "sin respuesta"}`);
  }
  return { providerMessageId: data.id };
}
