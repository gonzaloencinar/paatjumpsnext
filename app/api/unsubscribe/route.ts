import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

// Baja en 1 clic (plan §11): GET desde el link del email (muestra página),
// POST para One-Click de Gmail/Yahoo (RFC 8058, cabecera List-Unsubscribe-Post).

function emailFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const encoded = url.searchParams.get("e");
  const token = url.searchParams.get("t");
  if (!encoded || !token) return null;
  let email: string;
  try {
    email = Buffer.from(encoded, "base64url").toString("utf8").toLowerCase();
  } catch {
    return null;
  }
  return verifyEmailToken("unsub", email, token) ? email : null;
}

async function unsubscribe(email: string) {
  const supabase = createAdminClient();
  await supabase.from("suppressions").upsert({ email, reason: "unsubscribe" });
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();
  if (contact && contact.status !== "unsubscribed") {
    await supabase
      .from("contacts")
      .update({ status: "unsubscribed" })
      .eq("id", contact.id);
    await supabase.from("events").insert({
      contact_id: contact.id,
      type: "unsubscribed",
      payload: { via: "link" },
    });
  }
}

const PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Baja confirmada · Paat Jumps</title>
</head>
<body style="margin:0;background:#0a0a0a;color:#fff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px">
  <div style="max-width:420px;text-align:center">
    <p style="font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#ea580c;margin:0 0 12px">Paat Jumps</p>
    <h1 style="font-size:24px;margin:0 0 12px">Baja confirmada</h1>
    <p style="color:rgba(255,255,255,.7);line-height:1.6;margin:0 0 24px">No volveremos a enviarte emails de marketing. Si cambias de idea, siempre puedes suscribirte otra vez en la tienda.</p>
    <a href="/" style="color:#ea580c;text-decoration:none;font-weight:600">← Volver a paatjumps.com</a>
  </div>
</body>
</html>`;

export async function GET(request: Request) {
  const email = emailFromRequest(request);
  if (!email) return new NextResponse("Enlace no válido.", { status: 400 });
  await unsubscribe(email);
  return new NextResponse(PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const email = emailFromRequest(request);
  if (!email) return new NextResponse(null, { status: 400 });
  await unsubscribe(email);
  return new NextResponse(null, { status: 200 });
}
