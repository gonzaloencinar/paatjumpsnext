"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";

// Server actions del admin. El gate de sesión sigue siendo Supabase Auth
// (requireAdmin, hasta F3); los DATOS viven en Convex — las mutations llevan
// las guardas de estado y las unicidades dentro de la transacción, y aquí
// queda la validación de formularios y el mapeo a mensajes en castellano.

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
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(formData.get("first_name") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  let result;
  try {
    result = await convexMutation(api.contacts.create, {
      email,
      firstName: firstName || null,
      source: "manual",
      consentText: "Alta manual desde el CRM",
    });
  } catch {
    return { error: "No se pudo crear el contacto." };
  }
  if (result.status === "suppressed") {
    return {
      error: "Ese email está en la lista de supresión. Quítalo de ahí primero.",
    };
  }
  if (result.status === "exists") {
    return { error: "Ese contacto ya existe." };
  }

  revalidatePath("/admin/contacts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateContact(
  contactId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(formData.get("first_name") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  let result;
  try {
    result = await convexMutation(api.contacts.update, {
      id: contactId,
      email,
      firstName: firstName || null,
    });
  } catch {
    return { error: "No se pudo guardar el contacto." };
  }
  if (result.status === "not_found") return { error: "El contacto no existe." };
  if (result.status === "duplicate") {
    return { error: "Ya hay otro contacto con ese email." };
  }

  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin/contacts");
  return { ok: true };
}

export async function deleteContact(contactId: string): Promise<ActionState> {
  await requireAdmin();
  // El histórico de negocio sobrevive desvinculado (pedidos, checkouts,
  // códigos, emails); events, inscripciones y campaign_recipients caen con
  // él. La supresión (si existe) se conserva: borrar el contacto no debe
  // rehabilitar envíos a ese email. Todo dentro de la mutation.
  let result;
  try {
    result = await convexMutation(api.contacts.remove, { id: contactId });
  } catch {
    return { error: "No se pudo eliminar el contacto." };
  }
  if (result.status === "not_found") return { error: "El contacto no existe." };

  revalidatePath("/admin/contacts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function setContactStatus(
  contactId: string,
  status: "subscribed" | "unsubscribed",
) {
  await requireAdmin();
  await convexMutation(api.contacts.setStatus, { id: contactId, status });
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
  await requireAdmin();
  const tags = [
    ...new Set(
      tagsInput
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length <= 30),
    ),
  ].slice(0, 20);

  try {
    await convexMutation(api.contacts.setTags, { id: contactId, tags });
  } catch {
    return { error: "No se pudieron guardar los tags." };
  }
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
    bodyHtml: bodyHtml || null,
    segment,
  };
}

// Recuento en vivo para el picker de segmento del formulario
export async function countAudienceAction(
  facets: SegmentFacets,
): Promise<number> {
  await requireAdmin();
  return countSegmentAudience(null, parseFacets(facets));
}

// Email a contactos elegidos a mano (selección en /admin/contacts o botón
// de la ficha): campaña borrador con la faceta ids — mismo flujo de
// redactar/probar/enviar y mismas garantías (suscritos + supresiones).
export async function createCampaignFromContacts(
  rawIds: string[],
): Promise<ActionState> {
  await requireAdmin();
  const ids = sanitizeContactIds(rawIds);
  if (ids.length === 0) return { error: "No hay contactos seleccionados." };

  let campaignId: string;
  try {
    const emails = await convexQuery(api.contacts.emailsForIds, {
      ids: ids.slice(0, 1),
    });
    const name =
      ids.length === 1 && emails[0]
        ? `Email a ${emails[0]}`
        : `Email a ${ids.length} contactos`;
    campaignId = await convexMutation(api.campaigns.create, {
      name,
      subject: null,
      preheader: null,
      bodyHtml: null,
      segment: { ids },
    });
  } catch {
    return { error: "No se pudo crear el email." };
  }
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${campaignId}`);
}

// Email a un cliente de Shopify (/admin/customers): solo si su email ya es
// un contacto del CRM — sin contacto no hay consentimiento que respetar.
export async function createCampaignFromCustomerEmail(
  rawEmail: string,
): Promise<ActionState> {
  await requireAdmin();
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  const contact = await convexQuery(api.contacts.byEmail, { email });
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
  await requireAdmin();
  const clean = parseFacets(facets);
  const campaignId = await convexMutation(api.campaigns.create, {
    name: `Campaña — ${describeFacets(clean)}`,
    subject: null,
    preheader: null,
    bodyHtml: null,
    segment: clean,
  });
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${campaignId}`);
}

export async function createCampaign(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const fields = campaignFields(formData);
  if (!fields.name) return { error: "La campaña necesita un nombre." };

  let campaignId: string;
  try {
    campaignId = await convexMutation(api.campaigns.create, fields);
  } catch {
    return { error: "No se pudo crear la campaña." };
  }

  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${campaignId}`);
}

export async function updateCampaign(
  campaignId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const fields = campaignFields(formData);
  if (!fields.name) return { error: "La campaña necesita un nombre." };

  let result;
  try {
    result = await convexMutation(api.campaigns.update, {
      id: campaignId,
      ...fields,
    });
  } catch {
    return { error: "No se pudo guardar la campaña." };
  }
  if (result.status === "not_found") return { error: "La campaña no existe." };
  if (result.status === "not_draft") {
    return { error: "Solo se pueden editar borradores." };
  }

  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return { ok: true };
}

export async function deleteCampaign(campaignId: string) {
  await requireAdmin();
  const result = await convexMutation(api.campaigns.remove, { id: campaignId });
  if (result.status !== "ok") {
    throw new Error("Solo se pueden eliminar borradores.");
  }
  revalidatePath("/admin/campaigns");
}

// ───────────────────── Campañas: envío (§16.3) ─────────────────────

function notSendableError(campaign: {
  subject: string | null;
  bodyHtml: string | null;
}) {
  if (!campaign.subject?.trim()) return "Ponle un asunto antes de enviar.";
  if (!campaign.bodyHtml?.trim()) return "El email no tiene contenido.";
  return null;
}

async function getCampaignForSend(campaignId: string) {
  return await convexQuery(api.campaigns.get, { id: campaignId });
}

export async function sendTestCampaign(
  campaignId: string,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const campaign = await getCampaignForSend(campaignId);
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
        bodyHtml: mergeName(campaign.bodyHtml ?? "", null),
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
  await requireAdmin();
  const campaign = await getCampaignForSend(campaignId);
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

  let result;
  try {
    result = await convexMutation(api.campaigns.schedule, {
      id: campaignId,
      scheduledAt: when.getTime(),
    });
  } catch {
    return { error: "No se pudo programar la campaña." };
  }
  if (result.status !== "ok") {
    return { error: "Esta campaña ya no se puede programar." };
  }

  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return { ok: true };
}

export async function unscheduleCampaign(campaignId: string) {
  await requireAdmin();
  await convexMutation(api.campaigns.unschedule, { id: campaignId });
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function sendCampaignNow(
  campaignId: string,
): Promise<ActionState> {
  await requireAdmin();
  const campaign = await getCampaignForSend(campaignId);
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
      null,
      campaignId,
      parseFacets(campaign.segment),
    );
  } catch {
    return { error: "No se pudo preparar la lista de destinatarios." };
  }

  let result;
  try {
    result = await convexMutation(api.campaigns.startSending, {
      id: campaignId,
    });
  } catch {
    return { error: "No se pudo iniciar el envío." };
  }
  if (result.status === "no_recipients") {
    return { error: "No hay destinatarios: ningún contacto suscrito." };
  }
  if (result.status !== "ok") {
    return { error: "No se pudo iniciar el envío." };
  }

  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return { ok: true };
}

export async function pauseCampaign(campaignId: string) {
  await requireAdmin();
  await convexMutation(api.campaigns.pause, { id: campaignId });
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function resumeCampaign(campaignId: string) {
  await requireAdmin();
  await convexMutation(api.campaigns.resume, { id: campaignId });
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function cancelCampaign(campaignId: string) {
  await requireAdmin();
  // Los pendientes quedan como 'skipped'; un lote ya reclamado en vuelo
  // (≤40) puede terminar de salir. Todo en la misma mutation.
  await convexMutation(api.campaigns.cancel, { id: campaignId });
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function duplicateCampaign(campaignId: string) {
  await requireAdmin();
  const copyId = await convexMutation(api.campaigns.duplicate, {
    id: campaignId,
  });
  if (!copyId) throw new Error("La campaña no existe.");

  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${copyId}`);
}

// ──────────────────────── Automatizaciones ────────────────────────

export async function toggleAutomation(automationId: string, enabled: boolean) {
  await requireAdmin();
  await convexMutation(api.automations.toggle, { id: automationId, enabled });
  revalidatePath("/admin/automations");
  revalidatePath(`/admin/automations/${automationId}`);
}

// ───────────────── Automatizaciones: secuencias (§16.4) ─────────────────

const CREATABLE_TRIGGERS = new Set(["signup", "manual"]);

export async function createAutomation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
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

  let automationId: string;
  try {
    automationId = await convexMutation(api.automations.create, {
      name,
      trigger: trigger as "signup" | "manual",
      key: `${slug}_${crypto.randomUUID().slice(0, 4)}`,
    });
  } catch {
    return { error: "No se pudo crear la automatización." };
  }

  revalidatePath("/admin/automations");
  redirect(`/admin/automations/${automationId}`);
}

export async function deleteAutomation(
  automationId: string,
): Promise<ActionState> {
  await requireAdmin();
  const automation = await convexQuery(api.automations.get, {
    id: automationId,
  });
  if (!automation) return { error: "No existe." };
  if (automation.key === "welcome" || automation.key === "cart_recovery") {
    return {
      error: "Esta automatización es estructural — desactívala en su lugar.",
    };
  }
  const result = await convexMutation(api.automations.remove, {
    id: automationId,
  });
  if (result.status === "has_sends") {
    // Como el FK restrictivo de email_sends: si ya envió, se conserva
    return { error: "Ya tiene envíos registrados; desactívala en su lugar." };
  }
  if (result.status === "not_found") return { error: "No existe." };
  revalidatePath("/admin/automations");
  redirect("/admin/automations");
}

export async function addAutomationStep(automationId: string) {
  await requireAdmin();
  await convexMutation(api.automations.addStep, { automationId });
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
  await requireAdmin();

  const delayValue = Number(formData.get("delay_value"));
  const factor = DELAY_FACTOR[String(formData.get("delay_unit") ?? "days")];
  if (!factor || !Number.isFinite(delayValue) || delayValue < 0) {
    return { error: "La espera no es válida." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const preheader = String(formData.get("preheader") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();

  try {
    const result = await convexMutation(api.automations.updateStep, {
      stepId,
      delayMinutes: Math.round(delayValue * factor),
      subject: subject || null,
      preheader: preheader || null,
      bodyHtml: bodyHtml || null,
    });
    if (result.status === "not_found") {
      return { error: "No se pudo guardar el paso." };
    }
  } catch {
    return { error: "No se pudo guardar el paso." };
  }

  revalidatePath(`/admin/automations/${automationId}`);
  return { ok: true };
}

export async function toggleAutomationStep(
  automationId: string,
  stepId: string,
  enabled: boolean,
) {
  await requireAdmin();
  await convexMutation(api.automations.toggleStep, { stepId, enabled });
  revalidatePath(`/admin/automations/${automationId}`);
}

export async function deleteAutomationStep(
  automationId: string,
  stepId: string,
) {
  await requireAdmin();
  await convexMutation(api.automations.deleteStep, { stepId });
  revalidatePath(`/admin/automations/${automationId}`);
}

export async function moveAutomationStep(
  automationId: string,
  stepId: string,
  direction: "up" | "down",
) {
  await requireAdmin();
  // El intercambio de posiciones ocurre dentro de una sola mutation
  await convexMutation(api.automations.moveStep, {
    automationId,
    stepId,
    direction,
  });
  revalidatePath(`/admin/automations/${automationId}`);
}

// Trigger manual: inscribir a los suscritos actuales que nunca han pasado
// por esta secuencia (los que la completaron/cancelaron no se re-inscriben).
export async function enrollSubscribers(
  automationId: string,
): Promise<ActionState> {
  await requireAdmin();

  let result;
  try {
    result = await convexMutation(api.automations.enrollSubscribers, {
      automationId,
    });
  } catch {
    return { error: "No se pudieron crear las inscripciones." };
  }
  if (result.status === "not_found") {
    return { error: "La automatización no existe." };
  }
  if (result.status === "no_steps") {
    return { error: "La secuencia no tiene ningún paso activo con contenido." };
  }
  if (result.status === "none") {
    return { error: "No hay suscriptores nuevos que inscribir." };
  }

  const count = result.count;
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
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Email no válido." };

  try {
    // Si el email es un contacto, la mutation refleja también la baja
    await convexMutation(api.contacts.addSuppression, { email });
  } catch {
    return { error: "No se pudo añadir la supresión." };
  }

  revalidatePath("/admin/suppressions");
  revalidatePath("/admin/contacts");
  return { ok: true };
}

export async function removeSuppression(email: string) {
  await requireAdmin();
  await convexMutation(api.contacts.removeSuppression, { email });
  revalidatePath("/admin/suppressions");
}
