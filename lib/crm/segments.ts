import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";

// Segmentación por facetas cerradas (plan §16.2): cada faceta responde a una
// pregunta de negocio sobre `contacts` (campos derivados mantenidos por los
// webhooks). Todas se combinan con AND. Los datos viven en Convex: la
// audiencia se calcula en memoria sobre los suscritos (tabla pequeña) y el
// snapshot de campaign_recipients lo hace la mutation transaccional
// api.campaigns.addRecipients (unicidad por campaña+contacto con el índice
// by_campaign_and_contact). La lista de supresiones no se filtra aquí: los
// suprimidos ya no están `subscribed` (y sendCrmEmail re-chequea
// suppressions en cada envío).

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SegmentFacets = {
  tipo?: "lead" | "cliente" | "repetidor" | "vip";
  vip_min?: number; // € de gasto acumulado para contar como VIP
  actividad?: "activos" | "dormidos";
  fuente?: string;
  alta_dias?: number;
  tag?: string;
  codigo?: string; // compró usando este código de descuento
  ids?: string[]; // selección manual desde /admin/contacts (bulk email)
};

// Tope compartido con la selección manual: por encima habría que trocear
export const MAX_MANUAL_IDS = 500;

// Ids válidos: uuid legacy (campañas antiguas con segment.ids) o id de
// Convex (string opaco alfanumérico, el formato actual)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONVEX_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function sanitizeContactIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" && (UUID_RE.test(id) || CONVEX_ID_RE.test(id)),
      ),
    ),
  ].slice(0, MAX_MANUAL_IDS);
}

export const VIP_MIN_DEFAULT = 100;
export const ACTIVITY_DAYS = 90;

const TIPOS = new Set(["lead", "cliente", "repetidor", "vip"]);
const ACTIVIDADES = new Set(["activos", "dormidos"]);

// json de campaigns.segment → facetas saneadas. El formato legacy
// ({status:"subscribed"}) y cualquier basura quedan en {} = todos los suscritos.
export function parseFacets(segment: Json | null | undefined): SegmentFacets {
  if (!segment || typeof segment !== "object" || Array.isArray(segment)) {
    return {};
  }
  const raw = segment as Record<string, Json | undefined>;
  const facets: SegmentFacets = {};
  if (TIPOS.has(String(raw.tipo))) {
    facets.tipo = raw.tipo as SegmentFacets["tipo"];
  }
  if (typeof raw.vip_min === "number" && raw.vip_min > 0) {
    facets.vip_min = raw.vip_min;
  }
  if (ACTIVIDADES.has(String(raw.actividad))) {
    facets.actividad = raw.actividad as SegmentFacets["actividad"];
  }
  if (typeof raw.fuente === "string" && raw.fuente.trim()) {
    facets.fuente = raw.fuente.trim();
  }
  if (typeof raw.alta_dias === "number" && raw.alta_dias > 0) {
    facets.alta_dias = raw.alta_dias;
  }
  if (typeof raw.tag === "string" && raw.tag.trim()) {
    facets.tag = raw.tag.trim();
  }
  if (typeof raw.codigo === "string" && raw.codigo.trim()) {
    facets.codigo = raw.codigo.trim().toUpperCase();
  }
  const ids = sanitizeContactIds(raw.ids);
  if (ids.length > 0) facets.ids = ids;
  return facets;
}

export function hasFacets(facets: SegmentFacets) {
  return Object.keys(facets).length > 0;
}

// Descripción humana para nombres/labels: "clientes · dormidos · tag club"
export function describeFacets(facets: SegmentFacets) {
  const parts: string[] = [];
  if (facets.tipo === "lead") parts.push("leads (sin pedidos)");
  if (facets.tipo === "cliente") parts.push("clientes");
  if (facets.tipo === "repetidor") parts.push("repetidores (≥2 pedidos)");
  if (facets.tipo === "vip") {
    parts.push(`VIP (≥${facets.vip_min ?? VIP_MIN_DEFAULT} €)`);
  }
  if (facets.actividad === "activos") {
    parts.push(`activos ≤${ACTIVITY_DAYS} d`);
  }
  if (facets.actividad === "dormidos") {
    parts.push(`dormidos >${ACTIVITY_DAYS} d`);
  }
  if (facets.fuente) parts.push(`fuente ${facets.fuente}`);
  if (facets.alta_dias) parts.push(`alta ≤${facets.alta_dias} d`);
  if (facets.tag) parts.push(`tag ${facets.tag}`);
  if (facets.codigo) parts.push(`código ${facets.codigo}`);
  if (facets.ids) {
    parts.push(
      facets.ids.length === 1
        ? "1 contacto elegido a mano"
        : `${facets.ids.length} contactos elegidos a mano`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "todos los suscritos";
}

// Fila mínima sobre la que se evalúan las facetas (forma camelCase de
// api.contacts.list)
export type SegmentContactRow = {
  id: string;
  email: string;
  firstName: string | null;
  status: string;
  source: string | null;
  tags: string[];
  ordersCount: number;
  totalSpent: number;
  createdAt: number;
  lastOpenAt: number | null;
  lastClickAt: number | null;
};

type SegmentContext = {
  facets: SegmentFacets;
  // ids de contactos que compraron con el código (null = faceta inactiva)
  codigoIds: Set<string> | null;
  now: number;
};

async function buildSegmentContext(
  facets: SegmentFacets,
): Promise<SegmentContext> {
  let codigoIds: Set<string> | null = null;
  if (facets.codigo) {
    const ids = await convexQuery(api.contacts.contactIdsByDiscountCode, {
      code: facets.codigo,
    });
    codigoIds = new Set(ids);
  }
  return { facets, codigoIds, now: Date.now() };
}

// ¿El contacto cae dentro de las facetas? (sin mirar status: el status lo
// fija cada llamante — subscribed en segmentos, el filtro del admin en
// /admin/contacts). Misma semántica que el applySegment legacy.
export function contactMatchesFacets(
  contact: SegmentContactRow,
  context: SegmentContext,
): boolean {
  const { facets, codigoIds, now } = context;

  if (facets.tipo === "lead" && contact.ordersCount !== 0) return false;
  if (facets.tipo === "cliente" && contact.ordersCount < 1) return false;
  if (facets.tipo === "repetidor" && contact.ordersCount < 2) return false;
  if (
    facets.tipo === "vip" &&
    contact.totalSpent < (facets.vip_min ?? VIP_MIN_DEFAULT)
  ) {
    return false;
  }

  const activitySince = now - ACTIVITY_DAYS * 86_400_000;
  const opened = contact.lastOpenAt !== null && contact.lastOpenAt >= activitySince;
  const clicked =
    contact.lastClickAt !== null && contact.lastClickAt >= activitySince;
  if (facets.actividad === "activos" && !opened && !clicked) return false;
  if (facets.actividad === "dormidos" && (opened || clicked)) return false;

  if (facets.fuente && contact.source !== facets.fuente) return false;
  if (
    facets.alta_dias &&
    contact.createdAt < now - facets.alta_dias * 86_400_000
  ) {
    return false;
  }
  if (facets.tag && !contact.tags.includes(facets.tag)) return false;

  // Selección manual: sigue pasando por status=subscribed (el llamante), así
  // una baja posterior a la selección queda fuera igualmente.
  if (facets.ids && facets.ids.length > 0) {
    if (!facets.ids.slice(0, MAX_MANUAL_IDS).includes(contact.id)) {
      return false;
    }
  }

  if (codigoIds && !codigoIds.has(contact.id)) return false;

  return true;
}

// Contexto de facetas para /admin/contacts (sin fijar status)
export async function buildFacetsContext(facets: SegmentFacets) {
  return buildSegmentContext(facets);
}

// Audiencia del segmento: suscritos que cumplen las facetas
async function getSegmentAudience(facets: SegmentFacets) {
  const [contacts, context] = await Promise.all([
    convexQuery(api.contacts.list, {}),
    buildSegmentContext(facets),
  ]);
  return contacts.filter(
    (contact) =>
      contact.status === "subscribed" &&
      contactMatchesFacets(contact, context),
  );
}

// El primer parámetro era el cliente Supabase; se conserva (ignorado) para
// no romper a los llamantes aún no portados (lib/crm/campaign-engine.ts).
export async function countSegmentAudience(
  _client: unknown,
  facets: SegmentFacets,
) {
  return (await getSegmentAudience(facets)).length;
}

// Congela la audiencia del segmento en campaign_recipients (snapshot §16.3).
// Idempotente: los ya presentes se ignoran (mutation transaccional con el
// índice by_campaign_and_contact). Devuelve los insertados nuevos.
export async function materializeCampaignAudience(
  _client: unknown,
  campaignId: string,
  facets: SegmentFacets,
) {
  const audience = await getSegmentAudience(facets);
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < audience.length; i += chunkSize) {
    inserted += await convexMutation(api.campaigns.addRecipients, {
      id: campaignId,
      rows: audience.slice(i, i + chunkSize).map((contact) => ({
        contactId: contact.id,
        email: contact.email,
        firstName: contact.firstName,
      })),
    });
  }
  return inserted;
}
