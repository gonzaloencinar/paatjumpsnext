"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mergeName } from "@/lib/crm/campaign-engine";
import { isQuietHour, madridLocalToUtc } from "@/lib/crm/schedule";
import { sendCrmEmail } from "@/lib/email/send";
import { CampaignEmail } from "@/lib/email/templates/campaign";
import { unsubscribeUrl } from "@/lib/email/tokens";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Gate de todas las mutaciones: sesión + allowlist. RLS es la última barrera. */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/admin/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("No autorizado");
  return supabase;
}

// ─────────────────────────── Contactos ───────────────────────────

export async function addContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(formData.get("first_name") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  const { data: suppressed } = await supabase
    .from("suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (suppressed) {
    return {
      error: "Ese email está en la lista de supresión. Quítalo de ahí primero.",
    };
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      email,
      first_name: firstName || null,
      status: "subscribed",
      source: "manual",
      consent: true,
      consent_text: "Alta manual desde el CRM",
      consent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ese contacto ya existe."
          : "No se pudo crear el contacto.",
    };
  }

  await supabase.from("events").insert({
    contact_id: contact.id,
    type: "signup",
    payload: { source: "manual" },
  });

  revalidatePath("/admin/contacts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function setContactStatus(
  contactId: string,
  status: "subscribed" | "unsubscribed",
) {
  const supabase = await requireAdmin();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email, status")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact || contact.status === status) return;

  const { error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", contactId);
  if (error) throw error;

  if (status === "unsubscribed") {
    await supabase
      .from("suppressions")
      .upsert({ email: contact.email, reason: "manual" });
  } else {
    await supabase.from("suppressions").delete().eq("email", contact.email);
  }

  await supabase.from("events").insert({
    contact_id: contactId,
    type: "status_changed",
    payload: { from: contact.status, to: status, by: "admin" },
  });

  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin/contacts");
  revalidatePath("/admin/suppressions");
  revalidatePath("/admin");
}

// ─────────────────────────── Campañas ───────────────────────────

function campaignFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const preheader = String(formData.get("preheader") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();
  const segment = String(formData.get("segment") ?? "subscribed");
  return {
    name,
    subject: subject || null,
    preheader: preheader || null,
    body_html: bodyHtml || null,
    segment: { status: segment },
  };
}

export async function createCampaign(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const fields = campaignFields(formData);
  if (!fields.name) return { error: "La campaña necesita un nombre." };

  const { data, error } = await supabase
    .from("campaigns")
    .insert(fields)
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear la campaña." };

  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${data.id}`);
}

export async function updateCampaign(
  campaignId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();

  const { data: current } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!current) return { error: "La campaña no existe." };
  if (current.status !== "draft") {
    return { error: "Solo se pueden editar borradores." };
  }

  const fields = campaignFields(formData);
  if (!fields.name) return { error: "La campaña necesita un nombre." };

  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", campaignId);
  if (error) return { error: "No se pudo guardar la campaña." };

  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return { ok: true };
}

export async function deleteCampaign(campaignId: string) {
  const supabase = await requireAdmin();
  const { data: current } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!current || current.status !== "draft") {
    throw new Error("Solo se pueden eliminar borradores.");
  }
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId);
  if (error) throw error;
  revalidatePath("/admin/campaigns");
  redirect("/admin/campaigns");
}

// ───────────────────── Campañas: envío (§16.3) ─────────────────────

function notSendableError(campaign: {
  subject: string | null;
  body_html: string | null;
}) {
  if (!campaign.subject?.trim()) return "Ponle un asunto antes de enviar.";
  if (!campaign.body_html?.trim()) return "El email no tiene contenido.";
  return null;
}

async function getCampaignForSend(
  supabase: Awaited<ReturnType<typeof requireAdmin>>,
  campaignId: string,
) {
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  return data;
}

export async function sendTestCampaign(
  campaignId: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const campaign = await getCampaignForSend(supabase, campaignId);
  if (!campaign) return { error: "La campaña no existe." };
  const invalid = notSendableError(campaign);
  if (invalid) return { error: invalid };

  const { data } = await supabase.auth.getClaims();
  const adminEmail = String(
    (data?.claims as { email?: string } | undefined)?.email ?? "",
  ).toLowerCase();
  if (!adminEmail) return { error: "No se pudo leer tu email de la sesión." };

  try {
    // Sin campaign_id a propósito: la prueba no pisa las métricas reales.
    // Se renderiza sin nombre para ver el comportamiento del fallback.
    const result = await sendCrmEmail({
      to: adminEmail,
      subject: `[Prueba] ${mergeName(campaign.subject ?? "", null)}`,
      react: CampaignEmail({
        bodyHtml: mergeName(campaign.body_html ?? "", null),
        preheader: campaign.preheader,
        unsubscribeUrl: unsubscribeUrl(adminEmail),
      }),
      template: "campaign_test",
    });
    if ("skipped" in result) {
      return {
        error: "Tu email está en supresiones — quítalo para recibir pruebas.",
      };
    }
  } catch {
    return { error: "No se pudo enviar la prueba." };
  }
  return { ok: true };
}

export async function scheduleCampaign(
  campaignId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const campaign = await getCampaignForSend(supabase, campaignId);
  if (!campaign) return { error: "La campaña no existe." };
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return { error: "Esta campaña ya no se puede programar." };
  }
  const invalid = notSendableError(campaign);
  if (invalid) return { error: invalid };

  const local = String(formData.get("scheduled_local") ?? "");
  const when = madridLocalToUtc(local);
  if (!when) return { error: "Fecha no válida." };
  if (isQuietHour(local)) {
    return {
      error: "Entre las 22:00 y las 9:00 no se programan envíos (quiet hours).",
    };
  }
  if (when.getTime() < Date.now() + 60_000) {
    return { error: "Esa hora ya ha pasado — elige una futura." };
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "scheduled", scheduled_at: when.toISOString() })
    .eq("id", campaignId)
    .in("status", ["draft", "scheduled"]);
  if (error) return { error: "No se pudo programar la campaña." };

  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return { ok: true };
}

export async function unscheduleCampaign(campaignId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "draft", scheduled_at: null })
    .eq("id", campaignId)
    .eq("status", "scheduled");
  if (error) throw error;
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function sendCampaignNow(
  campaignId: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const campaign = await getCampaignForSend(supabase, campaignId);
  if (!campaign) return { error: "La campaña no existe." };
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return { error: "Esta campaña ya está en marcha o enviada." };
  }
  const invalid = notSendableError(campaign);
  if (invalid) return { error: invalid };

  // Snapshot de destinatarios (idempotente) y a 'sending': el cron del
  // minuto siguiente empieza a enviar por lotes.
  const { error: materializeError } = await supabase.rpc(
    "materialize_campaign",
    { p_campaign_id: campaignId },
  );
  if (materializeError) {
    return { error: "No se pudo preparar la lista de destinatarios." };
  }

  const { count } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (!count) {
    return { error: "No hay destinatarios: ningún contacto suscrito." };
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "sending", scheduled_at: null })
    .eq("id", campaignId)
    .in("status", ["draft", "scheduled"]);
  if (error) return { error: "No se pudo iniciar el envío." };

  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return { ok: true };
}

export async function pauseCampaign(campaignId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending");
  if (error) throw error;
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function resumeCampaign(campaignId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "sending", paused_at: null })
    .eq("id", campaignId)
    .eq("status", "paused");
  if (error) throw error;
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function cancelCampaign(campaignId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "canceled" })
    .eq("id", campaignId)
    .in("status", ["scheduled", "sending", "paused"]);
  if (error) throw error;
  // Los pendientes quedan como 'skipped'; un lote ya reclamado en vuelo
  // (≤40) puede terminar de salir.
  await supabase
    .from("campaign_recipients")
    .update({ status: "skipped" })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function duplicateCampaign(campaignId: string) {
  const supabase = await requireAdmin();
  const { data: source } = await supabase
    .from("campaigns")
    .select("name, subject, preheader, body_html, segment")
    .eq("id", campaignId)
    .maybeSingle();
  if (!source) throw new Error("La campaña no existe.");

  const { data: copy, error } = await supabase
    .from("campaigns")
    .insert({ ...source, name: `${source.name} (copia)` })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${copy.id}`);
}

// ──────────────────────── Automatizaciones ────────────────────────

export async function toggleAutomation(automationId: string, enabled: boolean) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", automationId);
  if (error) throw error;
  revalidatePath("/admin/automations");
}

// ─────────────────────────── Supresiones ───────────────────────────

export async function addSuppression(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  const { error } = await supabase
    .from("suppressions")
    .upsert({ email, reason: "manual" });
  if (error) return { error: "No se pudo añadir la supresión." };

  // Si el email es un contacto, reflejar la baja
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
      type: "suppression_added",
      payload: { reason: "manual", by: "admin" },
    });
  }

  revalidatePath("/admin/suppressions");
  revalidatePath("/admin/contacts");
  return { ok: true };
}

export async function removeSuppression(email: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("suppressions")
    .delete()
    .eq("email", email);
  if (error) throw error;
  revalidatePath("/admin/suppressions");
}
