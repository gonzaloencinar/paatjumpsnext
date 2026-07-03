import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhooks de Resend (plan §9): entregas/rebotes/quejas/aperturas/clics →
// email_sends + suppressions + events. Firmados con Svix; verificación manual
// (HMAC-SHA256 de "id.timestamp.payload" con el secret whsec_) para no añadir
// dependencia.

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
  const emailId = event.data?.email_id;
  const to = Array.isArray(event.data?.to) ? event.data.to[0] : event.data?.to;
  const email = to?.trim().toLowerCase() ?? null;
  const supabase = createAdminClient();

  const { data: send } = emailId
    ? await supabase
        .from("email_sends")
        .select("id, contact_id, opened_at, clicked_at")
        .eq("provider_message_id", emailId)
        .maybeSingle()
    : { data: null };

  const now = new Date().toISOString();
  const patch: { status?: string; opened_at?: string; clicked_at?: string } =
    {};
  let eventType: string | null = null;

  switch (type) {
    case "email.delivered":
      patch.status = "delivered";
      break;
    case "email.bounced":
      // Conservador: cualquier rebote suprime (deliverability > cobertura).
      patch.status = "bounced";
      break;
    case "email.complained":
      patch.status = "complained";
      break;
    case "email.opened":
      if (!send?.opened_at) patch.opened_at = now;
      eventType = "email_opened";
      break;
    case "email.clicked":
      if (!send?.clicked_at) patch.clicked_at = now;
      eventType = "email_clicked";
      break;
    default:
      return NextResponse.json({ received: true });
  }

  if (send && Object.keys(patch).length > 0) {
    await supabase.from("email_sends").update(patch).eq("id", send.id);
  }

  if (email && type === "email.bounced") {
    await supabase
      .from("suppressions")
      .upsert({ email, reason: "hard_bounce" });
    await supabase
      .from("contacts")
      .update({ status: "bounced" })
      .eq("email", email);
  }
  if (email && type === "email.complained") {
    await supabase.from("suppressions").upsert({ email, reason: "complaint" });
    await supabase
      .from("contacts")
      .update({ status: "complained" })
      .eq("email", email);
  }

  if (eventType && send?.contact_id) {
    await supabase.from("events").insert({
      contact_id: send.contact_id,
      type: eventType,
      payload: { email_send_id: send.id },
    });
    // Actividad derivada para segmentos (§16.2): activos vs dormidos
    await supabase
      .from("contacts")
      .update(
        eventType === "email_opened"
          ? { last_open_at: now }
          : { last_click_at: now },
      )
      .eq("id", send.contact_id);
  }

  return NextResponse.json({ received: true });
}
