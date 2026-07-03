import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

// Segmentación por facetas cerradas (plan §16.2): cada faceta responde a una
// pregunta de negocio y compila a filtros PostgREST sobre `contacts` (campos
// derivados mantenidos por los webhooks). Todas se combinan con AND. La lista
// de supresiones no se filtra aquí: los suprimidos ya no están `subscribed`
// (y sendCrmEmail re-chequea suppressions en cada envío).

export type SegmentFacets = {
  tipo?: "lead" | "cliente" | "repetidor" | "vip";
  vip_min?: number; // € de gasto acumulado para contar como VIP
  actividad?: "activos" | "dormidos";
  fuente?: string;
  alta_dias?: number;
  tag?: string;
  codigo?: string; // compró usando este código de descuento
};

type Client = SupabaseClient<Database>;

export const VIP_MIN_DEFAULT = 100;
export const ACTIVITY_DAYS = 90;

const TIPOS = new Set(["lead", "cliente", "repetidor", "vip"]);
const ACTIVIDADES = new Set(["activos", "dormidos"]);

// jsonb de campaigns.segment → facetas saneadas. El formato legacy
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
  return parts.length > 0 ? parts.join(" · ") : "todos los suscritos";
}

type SegmentContext = {
  facets: SegmentFacets;
  // ids de contactos que compraron con el código (null = faceta inactiva)
  codigoIds: string[] | null;
};

export async function buildSegmentContext(
  client: Client,
  facets: SegmentFacets,
): Promise<SegmentContext> {
  let codigoIds: string[] | null = null;
  if (facets.codigo) {
    const { data } = await client
      .from("orders")
      .select("contact_id")
      .eq("discount_code", facets.codigo)
      .not("contact_id", "is", null)
      .limit(10000);
    codigoIds = [
      ...new Set(
        (data ?? [])
          .map((order) => order.contact_id)
          .filter((v): v is string => v !== null),
      ),
    ];
  }
  return { facets, codigoIds };
}

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

// Aplica las facetas a un query builder de `contacts` ya creado (select/count)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySegment<Q extends { eq: any }>(
  query: Q,
  context: SegmentContext,
): Q {
  const { facets, codigoIds } = context;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query.eq("status", "subscribed");

  if (facets.tipo === "lead") q = q.eq("orders_count", 0);
  if (facets.tipo === "cliente") q = q.gte("orders_count", 1);
  if (facets.tipo === "repetidor") q = q.gte("orders_count", 2);
  if (facets.tipo === "vip") {
    q = q.gte("total_spent", facets.vip_min ?? VIP_MIN_DEFAULT);
  }

  const activityIso = new Date(
    Date.now() - ACTIVITY_DAYS * 86_400_000,
  ).toISOString();
  if (facets.actividad === "activos") {
    q = q.or(
      `last_open_at.gte.${activityIso},last_click_at.gte.${activityIso}`,
    );
  }
  if (facets.actividad === "dormidos") {
    q = q
      .or(`last_open_at.is.null,last_open_at.lt.${activityIso}`)
      .or(`last_click_at.is.null,last_click_at.lt.${activityIso}`);
  }

  if (facets.fuente) q = q.eq("source", facets.fuente);
  if (facets.alta_dias) {
    q = q.gte(
      "created_at",
      new Date(Date.now() - facets.alta_dias * 86_400_000).toISOString(),
    );
  }
  if (facets.tag) q = q.contains("tags", [facets.tag]);

  if (codigoIds) {
    // Límite defensivo para no reventar la URL de PostgREST; con más de 500
    // compradores del mismo código ya tocará mover esto a una RPC
    q =
      codigoIds.length > 0
        ? q.in("id", codigoIds.slice(0, 500))
        : q.eq("id", EMPTY_UUID);
  }

  return q as Q;
}

export async function countSegmentAudience(
  client: Client,
  facets: SegmentFacets,
) {
  const context = await buildSegmentContext(client, facets);
  const { count, error } = await applySegment(
    client.from("contacts").select("id", { count: "exact", head: true }),
    context,
  );
  if (error) throw error;
  return count ?? 0;
}

// Congela la audiencia del segmento en campaign_recipients (snapshot §16.3).
// Idempotente: los ya presentes se ignoran. Devuelve los insertados nuevos.
export async function materializeCampaignAudience(
  client: Client,
  campaignId: string,
  facets: SegmentFacets,
) {
  const context = await buildSegmentContext(client, facets);
  const pageSize = 1000;
  let from = 0;
  let inserted = 0;

  for (;;) {
    const { data, error } = await applySegment(
      client
        .from("contacts")
        .select("id, email, first_name")
        .order("id")
        .range(from, from + pageSize - 1),
      context,
    );
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    const { data: added, error: insertError } = await client
      .from("campaign_recipients")
      .upsert(
        rows.map((contact) => ({
          campaign_id: campaignId,
          contact_id: contact.id,
          email: contact.email,
          first_name: contact.first_name,
        })),
        { ignoreDuplicates: true },
      )
      .select("id");
    if (insertError) throw insertError;
    inserted += added?.length ?? 0;

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return inserted;
}
