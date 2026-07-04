"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { effectiveSteps } from "@/lib/crm/automation-engine";
import { mergeName } from "@/lib/crm/campaign-engine";
import { isQuietHour, madridLocalToUtc } from "@/lib/crm/schedule";
import {
  countSegmentAudience,
  describeFacets,
  materializeCampaignAudience,
  parseFacets,
  sanitizeContactIds,
  type SegmentFacets,
} from "@/lib/crm/segments";
import { sendCrmEmail } from "@/lib/email/send";
import { CampaignEmail } from "@/lib/email/templates/campaign";
import { unsubscribeUrl } from "@/lib/email/tokens";
import { createClient } from "@/lib/supabase/server";

export type ActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
} | null;

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

export async function updateContact(
  contactId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(formData.get("first_name") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  const { data: current } = await supabase
    .from("contacts")
    .select("id, email, first_name")
    .eq("id", contactId)
    .maybeSingle();
  if (!current) return { error: "El contacto no existe." };

  const { error } = await supabase
    .from("contacts")
    .update({ email, first_name: firstName || null })
    .eq("id", contactId);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya hay otro contacto con ese email."
          : "No se pudo guardar el contacto.",
    };
  }

  if (email !== current.email || (firstName || null) !== current.first_name) {
    await supabase.from("events").insert({
      contact_id: contactId,
      type: "contact_updated",
      payload: {
        from: { email: current.email, first_name: current.first_name },
        to: { email, first_name: firstName || null },
        by: "admin",
      },
    });
  }

  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin/contacts");
  return { ok: true };
}

export async function deleteContact(contactId: string): Promise<ActionState> {
  const supabase = await requireAdmin();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { error: "El contacto no existe." };

  // El histórico de negocio sobrevive desvinculado (pedidos, checkouts,
  // códigos, emails: sus FK no llevan cascade a propósito); events,
  // automation_enrollments y campaign_recipients sí caen en cascada.
  // La supresión (si existe) se conserva: borrar el contacto no debe
  // rehabilitar envíos a ese email.
  const unlinks = [
    supabase.from("orders").update({ contact_id: null }),
    supabase.from("checkouts").update({ contact_id: null }),
    supabase.from("discount_codes").update({ contact_id: null }),
    supabase.from("email_sends").update({ contact_id: null }),
  ];
  for (const unlink of unlinks) {
    const { error } = await unlink.eq("contact_id", contactId);
    if (error) return { error: "No se pudo desvincular su histórico." };
  }

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId);
  if (error) return { error: "No se pudo eliminar el contacto." };

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

// Tags manuales (§16.2): agrupaciones libres tipo "club", "profe"…
export async function setContactTags(
  contactId: string,
  tagsInput: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const tags = [
    ...new Set(
      tagsInput
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length <= 30),
    ),
  ].slice(0, 20);

  const { error } = await supabase
    .from("contacts")
    .update({ tags })
    .eq("id", contactId);
  if (error) return { error: "No se pudieron guardar los tags." };
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin/contacts");
  return { ok: true };
}

// ─────────────────────────── Campañas ───────────────────────────

function campaignFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const preheader = String(formData.get("preheader") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();
  // Facetas del segmento (§16.2), serializadas por el picker del formulario
  let segment: SegmentFacets = {};
  try {
    segment = parseFacets(
      JSON.parse(String(formData.get("segment_json") ?? "{}")),
    );
  } catch {
    segment = {};
  }
  return {
    name,
    subject: subject || null,
    preheader: preheader || null,
    body_html: bodyHtml || null,
    segment,
  };
}

// Recuento en vivo para el picker de segmento del formulario
export async function countAudienceAction(
  facets: SegmentFacets,
): Promise<number> {
  const supabase = await requireAdmin();
  return countSegmentAudience(supabase, parseFacets(facets));
}

// Email a contactos elegidos a mano (selección en /admin/contacts o botón
// de la ficha): campaña borrador con la faceta ids — mismo flujo de
// redactar/probar/enviar y mismas garantías (suscritos + supresiones).
export async function createCampaignFromContacts(
  rawIds: string[],
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const ids = sanitizeContactIds(rawIds);
  if (ids.length === 0) return { error: "No hay contactos seleccionados." };

  const { data: sample } = await supabase
    .from("contacts")
    .select("email")
    .in("id", ids)
    .limit(1);
  const name =
    ids.length === 1 && sample?.[0]
      ? `Email a ${sample[0].email}`
      : `Email a ${ids.length} contactos`;

  const { data, error } = await supabase
    .from("campaigns")
    .insert({ name, segment: { ids } })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear el email." };
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${data.id}`);
}

// Email a un cliente de Shopify (/admin/customers): solo si su email ya es
// un contacto del CRM — sin contacto no hay consentimiento que respetar.
export async function createCampaignFromCustomerEmail(
  rawEmail: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();
  if (!contact) {
    return {
      error:
        "Este cliente no es contacto del CRM todavía — añádelo en Contactos primero.",
    };
  }
  if (contact.status !== "subscribed") {
    return {
      error: "Este contacto no está suscrito: no se le pueden enviar emails.",
    };
  }
  return createCampaignFromContacts([contact.id]);
}

// "Crear campaña con este filtro" desde /admin/contacts
export async function createCampaignFromFacets(facets: SegmentFacets) {
  const supabase = await requireAdmin();
  const clean = parseFacets(facets);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name: `Campaña — ${describeFacets(clean)}`,
      segment: clean,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${data.id}`);
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

  // Snapshot de destinatarios del segmento (idempotente) y a 'sending': el
  // cron del minuto siguiente empieza a enviar por lotes.
  try {
    await materializeCampaignAudience(
      supabase,
      campaignId,
      parseFacets(campaign.segment),
    );
  } catch {
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
  revalidatePath(`/admin/automations/${automationId}`);
}

// ───────────────── Automatizaciones: secuencias (§16.4) ─────────────────

const CREATABLE_TRIGGERS = new Set(["signup", "manual"]);

export async function createAutomation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const trigger = String(formData.get("trigger") ?? "manual");
  if (!name) return { error: "Ponle un nombre a la secuencia." };
  if (!CREATABLE_TRIGGERS.has(trigger)) {
    return { error: "Ese trigger llega con la Fase 2." };
  }

  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "secuencia";

  const { data, error } = await supabase
    .from("automations")
    .insert({
      name,
      trigger,
      key: `${slug}_${crypto.randomUUID().slice(0, 4)}`,
      enabled: false,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear la automatización." };

  revalidatePath("/admin/automations");
  redirect(`/admin/automations/${data.id}`);
}

export async function deleteAutomation(
  automationId: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const { data: automation } = await supabase
    .from("automations")
    .select("key")
    .eq("id", automationId)
    .maybeSingle();
  if (!automation) return { error: "No existe." };
  if (automation.key === "welcome" || automation.key === "cart_recovery") {
    return {
      error: "Esta automatización es estructural — desactívala en su lugar.",
    };
  }
  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", automationId);
  if (error) {
    // FK de email_sends: si ya envió emails, conservamos el histórico
    return { error: "Ya tiene envíos registrados; desactívala en su lugar." };
  }
  revalidatePath("/admin/automations");
  redirect("/admin/automations");
}

export async function addAutomationStep(automationId: string) {
  const supabase = await requireAdmin();
  const { data: last } = await supabase
    .from("automation_steps")
    .select("position")
    .eq("automation_id", automationId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("automation_steps").insert({
    automation_id: automationId,
    position: (last?.position ?? 0) + 1,
    delay_minutes: 1440,
  });
  if (error) throw error;
  revalidatePath(`/admin/automations/${automationId}`);
}

const DELAY_FACTOR: Record<string, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export async function updateAutomationStep(
  automationId: string,
  stepId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();

  const delayValue = Number(formData.get("delay_value"));
  const factor = DELAY_FACTOR[String(formData.get("delay_unit") ?? "days")];
  if (!factor || !Number.isFinite(delayValue) || delayValue < 0) {
    return { error: "La espera no es válida." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const preheader = String(formData.get("preheader") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();

  const { error } = await supabase
    .from("automation_steps")
    .update({
      delay_minutes: Math.round(delayValue * factor),
      subject: subject || null,
      preheader: preheader || null,
      body_html: bodyHtml || null,
    })
    .eq("id", stepId);
  if (error) return { error: "No se pudo guardar el paso." };

  revalidatePath(`/admin/automations/${automationId}`);
  return { ok: true };
}

export async function toggleAutomationStep(
  automationId: string,
  stepId: string,
  enabled: boolean,
) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("automation_steps")
    .update({ enabled })
    .eq("id", stepId);
  if (error) throw error;
  revalidatePath(`/admin/automations/${automationId}`);
}

export async function deleteAutomationStep(
  automationId: string,
  stepId: string,
) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("automation_steps")
    .delete()
    .eq("id", stepId);
  if (error) throw error;
  revalidatePath(`/admin/automations/${automationId}`);
}

export async function moveAutomationStep(
  automationId: string,
  stepId: string,
  direction: "up" | "down",
) {
  const supabase = await requireAdmin();
  const { data: steps } = await supabase
    .from("automation_steps")
    .select("id, position")
    .eq("automation_id", automationId)
    .order("position");
  if (!steps) return;

  const index = steps.findIndex((step) => step.id === stepId);
  const other = direction === "up" ? steps[index - 1] : steps[index + 1];
  const current = steps[index];
  if (!current || !other) return;

  // Sin unique en position: el swap en dos updates es seguro
  await supabase
    .from("automation_steps")
    .update({ position: other.position })
    .eq("id", current.id);
  await supabase
    .from("automation_steps")
    .update({ position: current.position })
    .eq("id", other.id);
  revalidatePath(`/admin/automations/${automationId}`);
}

// Trigger manual: inscribir a los suscritos actuales que nunca han pasado
// por esta secuencia (los que la completaron/cancelaron no se re-inscriben).
export async function enrollSubscribers(
  automationId: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();

  const { data: automation } = await supabase
    .from("automations")
    .select("id, automation_steps(*)")
    .eq("id", automationId)
    .maybeSingle();
  if (!automation) return { error: "La automatización no existe." };
  const [first] = effectiveSteps(automation.automation_steps ?? []);
  if (!first) {
    return { error: "La secuencia no tiene ningún paso activo con contenido." };
  }

  const [contacts, suppressions, enrolled] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, email")
      .eq("status", "subscribed")
      .limit(10000),
    supabase.from("suppressions").select("email").limit(10000),
    supabase
      .from("automation_enrollments")
      .select("contact_id")
      .eq("automation_id", automationId)
      .limit(10000),
  ]);
  if (contacts.error) return { error: "No se pudo leer la audiencia." };

  const suppressed = new Set((suppressions.data ?? []).map((s) => s.email));
  const already = new Set((enrolled.data ?? []).map((e) => e.contact_id));
  const audience = (contacts.data ?? []).filter(
    (contact) => !suppressed.has(contact.email) && !already.has(contact.id),
  );
  if (audience.length === 0) {
    return { error: "No hay suscriptores nuevos que inscribir." };
  }

  const nextRunAt = new Date(
    Date.now() + first.delay_minutes * 60_000,
  ).toISOString();
  let count = 0;
  for (let i = 0; i < audience.length; i += 500) {
    const chunk = audience.slice(i, i + 500).map((contact) => ({
      automation_id: automationId,
      contact_id: contact.id,
      step: 0,
      status: "active",
      next_run_at: nextRunAt,
    }));
    const { data, error } = await supabase
      .from("automation_enrollments")
      .upsert(chunk, { ignoreDuplicates: true })
      .select("id");
    if (error) return { error: "No se pudieron crear las inscripciones." };
    count += data?.length ?? 0;
  }

  revalidatePath(`/admin/automations/${automationId}`);
  return {
    ok: true,
    message: `${count} ${count === 1 ? "suscriptor inscrito" : "suscriptores inscritos"} — el primer paso sale según su espera.`,
  };
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
