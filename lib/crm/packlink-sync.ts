import { createOrderFulfillment } from "@/lib/shopify/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/lib/supabase/types";
import {
  geneiLabelRoute,
  getGeneiLabelPdf,
  getGeneiShipmentDetail,
  getGeneiTrackingUrl,
  parseGeneiDetail,
} from "./genei";

// Sincronización Packlink PRO → CRM: trae los envíos con su COSTE REAL
// (lo que pagamos al transportista) para el cierre de mes de /admin/finance
// y con su tracking/etiqueta para la columna Envío de /admin/orders.
// La cuenta se conectó sin envíos aún, así que el extractor es defensivo:
// prueba varios nombres de campo conocidos (SDKs oficiales/no oficiales) y
// guarda siempre el JSON crudo en `raw` — si el shape real difiere, se ajusta
// aquí y un resync re-extrae todo.
//
// Tras cada sync se enlazan envíos ↔ pedidos (custom_reference = nombre del
// pedido, p. ej. "#1011" — lo ponen tanto el módulo Shopify de Packlink como
// los borradores creados desde el CRM) y, para los envíos con etiqueta ya
// comprada y tracking, se crea el fulfillment en Shopify (una sola vez,
// marcado en fulfillment_synced_at).

const API_BASE = "https://api.packlink.com/v1";
const MAX_PAGES = 50;

// Estados previos a la compra de la etiqueta: no cuentan como gasto
const NOT_PURCHASED = new Set([
  "DRAFT",
  "PENDING",
  "AWAITING_COMPLETION",
  "READY_TO_PURCHASE",
  "CANCELED",
  "CANCELLED",
]);

type RawShipment = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstString(raw: RawShipment, keys: string[]): string | null {
  for (const key of keys) {
    const found = str(raw[key]);
    if (found) return found;
  }
  return null;
}

// Coste pagado SIN IVA (decisión del usuario: el gasto se apunta con la
// base imponible; el IVA de la factura Packlink se lo deduce Gonzalo).
// En el detalle real: price = { base_price: 3.68, tax_price: 0.77,
// total_price: 4.45 } → se toma base_price.
function extractCost(raw: RawShipment): {
  cost: number | null;
  currency: string | null;
} {
  const price = raw.price as RawShipment | undefined;
  const candidates: unknown[] = [
    price?.base_price,
    price?.basePrice,
    raw.base_price,
    raw.price,
  ];
  for (const candidate of candidates) {
    const cost = num(candidate);
    if (cost !== null) {
      return {
        cost: Math.round(cost * 100) / 100,
        currency:
          firstString((price ?? {}) as RawShipment, ["currency"]) ??
          firstString(raw, ["currency", "contentValue_currency"]),
      };
    }
  }
  return { cost: null, currency: null };
}

function extractDate(raw: RawShipment): string | null {
  // Formato real observado: orderDate "2026/07/06" (module_shopify)
  const candidates = [
    raw.orderDate,
    raw.order_date,
    raw.created_at,
    raw.createdAt,
    raw.date,
    raw.purchase_date,
    raw.collectionDate,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      // epoch en segundos o ms
      const ms = candidate > 1e12 ? candidate : candidate * 1000;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    const asString = str(candidate);
    if (asString) {
      const date = new Date(asString);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return null;
}

// Tracking del transportista: array `trackings` en el detalle; también viene
// dentro de packages[0].carrier_tracking_number.
function extractTracking(raw: RawShipment): string | null {
  const trackings = raw.trackings;
  if (Array.isArray(trackings)) {
    const first = str(trackings[0]);
    if (first) return first;
  }
  const packages = raw.packages;
  if (Array.isArray(packages) && packages.length > 0) {
    const first = packages[0] as RawShipment;
    return str(first.carrier_tracking_number ?? first.tracking_number);
  }
  return null;
}

function extractLabel(raw: RawShipment): string | null {
  const labels = raw.labels;
  return Array.isArray(labels) ? str(labels[0]) : null;
}

// "2026/07/08" → "2026-07-08" (columnas date)
function isoDate(value: unknown): string | null {
  const asString = str(value)?.replaceAll("/", "-") ?? null;
  return asString && /^\d{4}-\d{2}-\d{2}$/.test(asString) ? asString : null;
}

// Domicilio-domicilio según el detalle (service_info.is_drop_off_*)
function extractHomeToHome(raw: RawShipment): boolean | null {
  const info = raw.service_info as RawShipment | undefined;
  if (!info || typeof info !== "object") return null;
  const origin = info.is_drop_off_in_origin;
  const destination = info.is_drop_off_in_destination;
  if (typeof origin !== "boolean" || typeof destination !== "boolean") {
    return null;
  }
  return !origin && !destination;
}

function toRow(raw: RawShipment): TablesInsert<"packlink_shipments"> | null {
  const reference = firstString(raw, [
    "packlink_reference",
    "reference",
    "shipment_reference",
  ]);
  if (!reference) return null;
  const { cost, currency } = extractCost(raw);
  const state =
    raw.canceled === true
      ? "CANCELED"
      : (firstString(raw, ["status", "state"])?.toUpperCase() ?? null);
  return {
    reference,
    tracking: extractTracking(raw),
    tracking_url: firstString(raw, ["tracking_url"]),
    label_url: extractLabel(raw),
    custom_reference: firstString(raw, [
      "shipment_custom_reference",
      "custom_reference",
      "customReference",
      "order_id",
    ]),
    state,
    carrier: firstString(raw, ["carrier"]),
    service: firstString(raw, ["service"]),
    service_id: str(raw.service_id),
    collection_date: isoDate(raw.collection_date ?? raw.collectionDate),
    collection_time: str(raw.collection_time),
    estimated_delivery_date: isoDate(raw.estimated_delivery_date),
    home_to_home: extractHomeToHome(raw),
    cost,
    currency,
    shipment_date: extractDate(raw),
    raw: raw as Json,
    synced_at: new Date().toISOString(),
  };
}

export function isPurchasedShipment(state: string | null): boolean {
  return !NOT_PURCHASED.has((state ?? "").toUpperCase());
}

async function fetchPage(page: number): Promise<{
  shipments: RawShipment[];
  totalPages: number;
}> {
  const apiKey = process.env.PACKLINK_API_KEY;
  if (!apiKey) throw new Error("Falta PACKLINK_API_KEY");
  const response = await fetch(`${API_BASE}/shipments?page=${page}`, {
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Packlink ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as {
    shipments?: RawShipment[];
    pagination?: { current_page?: number; total_pages?: number };
  };
  return {
    shipments: body.shipments ?? [],
    totalPages: body.pagination?.total_pages ?? 0,
  };
}

// El listado devuelve `price: "0"` incluso con la etiqueta comprada: el coste
// real (price.base/tax/total_price) solo está en el detalle del envío. Para
// los comprados se hace una segunda llamada y se mergea sobre el JSON del
// listado (el detalle no trae `status`, que se conserva del listado).
async function fetchDetail(reference: string): Promise<RawShipment | null> {
  const apiKey = process.env.PACKLINK_API_KEY;
  if (!apiKey) throw new Error("Falta PACKLINK_API_KEY");
  const response = await fetch(
    `${API_BASE}/shipments/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null; // un detalle caído no rompe el sync
  return (await response.json()) as RawShipment;
}

export async function syncPacklinkShipments(): Promise<{
  synced: number;
  skipped: number;
}> {
  const supabase = createAdminClient();
  let synced = 0;
  let skipped = 0;
  const seen = new Set<string>();
  let fullSweep = false; // true si recorrimos el listado completo

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { shipments, totalPages } = await fetchPage(page);
    if (shipments.length === 0) {
      fullSweep = true;
      break;
    }

    const rows: TablesInsert<"packlink_shipments">[] = [];
    for (const shipment of shipments) {
      let row = toRow(shipment);
      if (!row) {
        skipped += 1;
        continue;
      }
      // Detalle para todos los envíos vivos: coste real de los comprados y
      // recogida/servicio de los borradores (editables en el panel). Se
      // refresca en cada sync por si Packlink añade recargos a posteriori.
      if ((row.state ?? "") !== "CANCELED") {
        const detail = await fetchDetail(row.reference);
        if (detail) {
          row = toRow({ ...shipment, ...detail }) ?? row;
        }
      }
      if (typeof row.cost === "number" && row.cost > 0 && !row.currency) {
        row.currency = "EUR";
      }
      seen.add(row.reference);
      rows.push(row);
    }

    if (rows.length > 0) {
      // Los campos cotizados desde el CRM (price_base/price_total no van en
      // el upsert) y home_to_home/recogida se conservan si la API no los trae
      const references = rows.map((r) => r.reference);
      const { data: existing } = await supabase
        .from("packlink_shipments")
        .select("reference, home_to_home, collection_date, collection_time")
        .in("reference", references);
      const byRef = new Map((existing ?? []).map((r) => [r.reference, r]));
      for (const row of rows) {
        const prev = byRef.get(row.reference);
        if (!prev) continue;
        row.home_to_home = row.home_to_home ?? prev.home_to_home;
        row.collection_date = row.collection_date ?? prev.collection_date;
        row.collection_time = row.collection_time ?? prev.collection_time;
      }

      const { error } = await supabase
        .from("packlink_shipments")
        .upsert(rows, { onConflict: "reference" });
      if (error) throw error;
      synced += rows.length;
    }

    if (page >= totalPages) {
      fullSweep = true;
      break;
    }
  }

  // Borradores eliminados en el panel: si ya no aparecen en el listado
  // completo, se quitan del CRM (solo estados de borrador y solo filas de
  // Packlink — los envíos Genei viven en la misma tabla; los comprados se
  // conservan como histórico para Finanzas).
  if (fullSweep) {
    const { data: stale } = await supabase
      .from("packlink_shipments")
      .select("reference, state")
      .eq("provider", "packlink")
      .limit(1000);
    const gone = (stale ?? []).filter(
      (row) =>
        !seen.has(row.reference) &&
        NOT_PURCHASED.has((row.state ?? "").toUpperCase()),
    );
    for (const row of gone) {
      await supabase
        .from("packlink_shipments")
        .delete()
        .eq("reference", row.reference);
    }
  }

  return { synced, skipped };
}

// ─────────────────────────── sync Genei ───────────────────────────

// Estados normalizados ya finales: no hace falta volver a consultarlos
const GENEI_FINAL_STATES = new Set([
  "DELIVERED",
  "COMPLETED",
  "CANCELED",
  "CANCELLED",
  "RETURNED_TO_SENDER",
]);

// Los envíos Genei se crean solo desde el CRM, así que no hay listado que
// recorrer: se refresca el detalle de las filas provider=genei no finales
// (estado, tracking, coste real sin IVA y etiqueta). Volumen pequeño.
export async function syncGeneiShipments(): Promise<{ synced: number }> {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("packlink_shipments")
    .select("reference, state, tracking_url, label_url, price_base, raw")
    .eq("provider", "genei")
    .limit(500);

  let synced = 0;
  for (const row of rows ?? []) {
    if (GENEI_FINAL_STATES.has((row.state ?? "").toUpperCase())) continue;
    let detail: Record<string, unknown>;
    try {
      detail = await getGeneiShipmentDetail(row.reference);
    } catch (error) {
      console.warn(`[genei-sync] detalle ${row.reference}`, error);
      continue;
    }
    const parsed = parseGeneiDetail(detail);
    const purchased = parsed.state !== "DRAFT";
    const trackingUrl =
      row.tracking_url ??
      parsed.trackingUrl ??
      (parsed.tracking ? await getGeneiTrackingUrl(row.reference) : null);
    const labelUrl =
      row.label_url ??
      (purchased && (await getGeneiLabelPdf(row.reference))
        ? geneiLabelRoute(row.reference)
        : null);
    const transactionId = (row.raw as { genei_transaction_id?: number } | null)
      ?.genei_transaction_id;

    await supabase
      .from("packlink_shipments")
      .update({
        state: parsed.state,
        tracking: parsed.tracking,
        tracking_url: trackingUrl,
        label_url: labelUrl,
        cost: purchased ? (parsed.costBase ?? row.price_base) : null,
        collection_date: parsed.collectionDate ?? undefined,
        collection_time: parsed.collectionTime ?? undefined,
        raw: {
          ...(detail as Record<string, Json>),
          ...(transactionId != null
            ? { genei_transaction_id: transactionId }
            : {}),
          created_by: "crm",
        } as Json,
        synced_at: new Date().toISOString(),
      })
      .eq("reference", row.reference);
    synced += 1;
  }
  return { synced };
}

// ─────────────── enlace con pedidos y fulfillment en Shopify ───────────────

type Supabase = ReturnType<typeof createAdminClient>;

async function linkShipmentsToOrders(supabase: Supabase) {
  const { data: unlinked } = await supabase
    .from("packlink_shipments")
    .select("reference, custom_reference")
    .is("order_id", null)
    .not("custom_reference", "is", null)
    .limit(500);
  if (!unlinked || unlinked.length === 0) return;

  const names = [...new Set(unlinked.map((s) => s.custom_reference!))];
  const { data: orders } = await supabase
    .from("orders")
    .select("id, name")
    .in("name", names);
  const byName = new Map((orders ?? []).map((o) => [o.name, o.id]));

  for (const shipment of unlinked) {
    const orderId = byName.get(shipment.custom_reference!);
    if (orderId == null) continue;
    await supabase
      .from("packlink_shipments")
      .update({ order_id: orderId })
      .eq("reference", shipment.reference);
  }
}

// Envíos con etiqueta comprada y tracking → fulfillment en Shopify (con
// notificación al cliente) + pedido marcado como enviado en el CRM. Cada
// envío se empuja una sola vez (fulfillment_synced_at); si el pedido ya
// estaba enviado (fulfillment manual o módulo de Packlink), solo se marca.
export async function pushPacklinkFulfillments(): Promise<{
  fulfilled: number;
  errors: number;
}> {
  const supabase = createAdminClient();
  await linkShipmentsToOrders(supabase);

  const { data: candidates } = await supabase
    .from("packlink_shipments")
    .select("reference, order_id, state, carrier, tracking, tracking_url")
    .is("fulfillment_synced_at", null)
    .not("order_id", "is", null)
    .not("tracking", "is", null)
    .limit(100);

  let fulfilled = 0;
  let errors = 0;
  for (const shipment of candidates ?? []) {
    if (!isPurchasedShipment(shipment.state)) continue;
    const { data: order } = await supabase
      .from("orders")
      .select("id, fulfillment_status, cancelled_at")
      .eq("id", shipment.order_id!)
      .maybeSingle();
    if (!order) continue;

    try {
      if (order.fulfillment_status !== "fulfilled" && !order.cancelled_at) {
        await createOrderFulfillment(order.id, {
          number: shipment.tracking!,
          company: shipment.carrier,
          url: shipment.tracking_url,
        });
        await supabase
          .from("orders")
          .update({ fulfillment_status: "fulfilled" })
          .eq("id", order.id);
        fulfilled += 1;
      }
      await supabase
        .from("packlink_shipments")
        .update({ fulfillment_synced_at: new Date().toISOString() })
        .eq("reference", shipment.reference);
    } catch (error) {
      errors += 1;
      console.error(`[packlink-sync] fulfillment ${shipment.reference}`, error);
    }
  }
  return { fulfilled, errors };
}
