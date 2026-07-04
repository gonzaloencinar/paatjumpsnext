import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { enrollContactInSignupAutomations } from "@/lib/crm/automation-engine";
import { CRM } from "@/lib/crm/config";
import { IDENTITY_COOKIE, IDENTITY_MAX_AGE } from "@/lib/crm/identity";
import { getActiveGeneralPromotion } from "@/lib/crm/promotions";
import { sendCrmEmail } from "@/lib/email/send";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { identityToken, unsubscribeUrl } from "@/lib/email/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Alta desde la barra de captación (plan §7.1). Single opt-in (decisión
// 2026-07-02): el código va directo en la bienvenida.
export async function POST(request: Request) {
  let body: {
    email?: unknown;
    first_name?: unknown;
    consent?: unknown;
    website?: unknown; // honeypot
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request" },
      { status: 400 },
    );
  }

  // Honeypot: los bots lo rellenan → fingir éxito y no hacer nada.
  if (String(body.website ?? "") !== "") {
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const firstName =
    String(body.first_name ?? "")
      .trim()
      .slice(0, 80) || null;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 422 },
    );
  }
  if (body.consent !== true) {
    return NextResponse.json(
      { ok: false, error: "consent_required" },
      { status: 422 },
    );
  }

  const ip =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() ||
    null;
  const supabase = createAdminClient();

  // Rate limit blando: máx. 5 altas/hora por IP (+ honeypot + email unique).
  if (ip) {
    const { count } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("consent_ip", ip)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429 },
      );
    }
  }

  // Suprimidos: éxito silencioso (no revelar que la dirección está en la lista).
  const { data: suppressed } = await supabase
    .from("suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (suppressed) return NextResponse.json({ ok: true });

  // Contacto (idempotente: repetir el alta reenvía el MISMO código).
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  let contactId: string;
  // Alta nueva o re-suscripción → entra en las secuencias de bienvenida
  // (§16.4); el reenvío idempotente de un ya-suscrito no re-inscribe.
  const isNewSignup = !existing || existing.status !== "subscribed";
  if (existing) {
    contactId = existing.id;
    if (existing.status !== "subscribed") {
      await supabase
        .from("contacts")
        .update({
          status: "subscribed",
          consent: true,
          consent_at: new Date().toISOString(),
          consent_ip: ip,
        })
        .eq("id", contactId);
      await supabase.from("events").insert({
        contact_id: contactId,
        type: "signup",
        payload: { source: "sticky_bar", resubscribe: true },
      });
    }
  } else {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        email,
        first_name: firstName,
        status: "subscribed",
        source: "sticky_bar",
        consent: true,
        consent_at: new Date().toISOString(),
        consent_ip: ip,
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { ok: false, error: "server_error" },
        { status: 500 },
      );
    }
    contactId = created.id;
    await supabase.from("events").insert({
      contact_id: contactId,
      type: "signup",
      payload: { source: "sticky_bar" },
    });
  }

  // Código compartido de la promo general vigente (decisión 2026-07-02: un
  // único código por promoción, gestionado en /admin/promotions y en sync
  // con Shopify). Sin promo activa, la bienvenida sale sin código.
  const promo = await getActiveGeneralPromotion();

  // Duplicado (ya suscrito) → reenvío del MISMO código por si acaso fue a spam.
  // Clave de idempotencia estable (Resend deduplica ~24h): absorbe reenvíos
  // repetidos y corta el reenvío-bombing de bots. Pasadas 24h vuelve a enviar.
  const alreadySubscribed = !isNewSignup;

  try {
    await sendCrmEmail({
      to: email,
      contactId,
      template: "welcome",
      subject: promo
        ? `Tu código −${promo.percentage}% para tu primer pedido`
        : "Bienvenida a Paat Jumps",
      idempotencyKey: `welcome/${contactId}/${promo?.code ?? "nocode"}`,
      react: WelcomeEmail({
        code: promo?.code ?? null,
        percentage: promo?.percentage ?? null,
        expiresAt: promo?.ends_at ?? null,
        baseUrl: CRM.baseUrl,
        unsubscribeUrl: unsubscribeUrl(email),
        identity: identityToken(email),
      }),
    });
  } catch (error) {
    console.error("subscribe: fallo enviando bienvenida", error);
    return NextResponse.json(
      { ok: false, error: "email_failed" },
      { status: 500 },
    );
  }

  if (isNewSignup) {
    try {
      await enrollContactInSignupAutomations(contactId);
    } catch (error) {
      // La inscripción nunca rompe el alta; el fallo queda en logs
      console.error("subscribe: fallo inscribiendo en secuencias", error);
    }
  }

  // Identidad para la recuperación de carritos pre-checkout: quien se
  // suscribe queda identificado en este navegador (lib/crm/identity.ts).
  (await cookies()).set(IDENTITY_COOKIE, identityToken(email), {
    maxAge: IDENTITY_MAX_AGE,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return NextResponse.json({ ok: true, resent: alreadySubscribed });
}
