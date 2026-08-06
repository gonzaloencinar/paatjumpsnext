import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexMutation } from "@/lib/convex/server";

// Webhooks de Resend (plan §9): entregas/rebotes/quejas/aperturas/clics →
// email_sends + suppressions + events. Firmados con Svix; verificación manual
// (HMAC-SHA256 de "id.timestamp.payload" con el secret whsec_) para no añadir
// dependencia. Las escrituras van en una sola mutation Convex transaccional
// (api.emails.applyResendEvent): lookup por provider_message_id, estado del
// envío, supresión espejo y actividad derivada del contacto.

function verifySvixSignature(payload: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  return signatures.split(" ").some((entry) => {
    const signature = entry.split(",")[1];
    if (!signature) return false;
    const buf = Buffer.from(signature);
    return (
      buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf)
    );
  });
}

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
  };
};

const HANDLED_TYPES = new Set([
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
] as const);

type HandledType =
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifySvixSignature(payload, request.headers)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }

  const type = event.type ?? "";
  if (!HANDLED_TYPES.has(type as HandledType)) {
    return NextResponse.json({ received: true });
  }
  const emailId = event.data?.email_id ?? null;
  const to = Array.isArray(event.data?.to) ? event.data.to[0] : event.data?.to;
  const email = to?.trim().toLowerCase() ?? null;

  await convexMutation(api.emails.applyResendEvent, {
    type: type as HandledType,
    emailId,
    email,
  });

  return NextResponse.json({ received: true });
}
