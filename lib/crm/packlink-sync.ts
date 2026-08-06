import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import { createOrderFulfillment } from "@/lib/shopify/admin";
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

// Fila que consume la mutation de upsert del sync (null = borrar el campo;
// homeToHome/collectionDate/collectionTime se conservan en Convex si vienen
// a null y la fila ya existía)
type SyncRow = {
  reference: string;
  tracking: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  customReference: string | null;
  state: string | null;
  carrier: string | null;
  service: string | null;
  serviceId: string | null;
  collectionDate: string | null;
  collectionTime: string | null;
  estimatedDeliveryDate: string | null;
  homeToHome: boolean | null;
  cost: number | null;
  currency: string | null;
  shipmentDate: number | null;
  raw: RawShipment;
};

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

// Fecha del envío → ms epoch (columna timestamptz legacy)
function extractDate(raw: RawShipment): number | null {
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
      if (!Number.isNaN(date.getTime())) return date.getTime();
    }
    const asString = str(candidate);
    if (asString) {
      const date = new Date(asString);
      if (!Number.isNaN(date.getTime())) return date.getTime();
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

function toRow(raw: RawShipment): SyncRow | null {
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
    trackingUrl: firstString(raw, ["tracking_url"]),
    labelUrl: extractLabel(raw),
    customReference: firstString(raw, [
      "shipment_custom_reference",
      "custom_reference",
      "customReference",
      "order_id",
    ]),
    state,
    carrier: firstString(raw, ["carrier"]),
    service: firstString(raw, ["service"]),
    serviceId: str(raw.service_id),
    collectionDate: isoDate(raw.collection_date ?? raw.collectionDate),
    collectionTime: str(raw.collection_time),
    estimatedDeliveryDate: isoDate(raw.estimated_delivery_date),
    homeToHome: extractHomeToHome(raw),
    cost,
    currency,
    shipmentDate: extractDate(raw),
    raw,
  };
}

export function isPurchasedShipment(state: string | null): boolean {
  return !NOT_PURCHASED.has((state ?? "").toUpperCase());
}

// ─────────────── etiqueta Genei → Convex File Storage ───────────────

// Sube el PDF (que la API de Genei solo da en base64) con el patrón
// upload-URL y lo engancha al envío (labelStorageId). El route handler
// /api/admin/genei-label/[reference] lo sirve después desde File Storage.
export async function storeGeneiLabel(
  reference: string,
  pdf: Uint8Array,
): Promise<boolean> {
  try {
    const uploadUrl = await convexMutation(
      api.shipments.generateLabelUploadUrl,
      {},
    );
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: new Blob([pdf as BlobPart]),
    });
    if (!response.ok) {
      throw new Error(`upload ${response.status}: ${await response.text()}`);
    }
    const { storageId } = (await response.json()) as {
      storageId: Id<"_storage">;
    };
    await convexMutation(api.shipments.attachLabel, { reference, storageId });
    return true;
  } catch (error) {
    console.warn(`[genei] etiqueta ${reference}`, error);
    return false;
  }
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

    const rows: SyncRow[] = [];
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
      // La mutation conserva price_base/price_total (no van en el sync) y
      // home_to_home/recogida cuando la API no los trae
      await convexMutation(api.shipments.syncUpsertPacklink, { rows });
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
    const stale = await convexQuery(api.shipments.packlinkRefs, {});
    const gone = stale.filter(
      (row) =>
        !seen.has(row.reference) &&
        NOT_PURCHASED.has((row.state ?? "").toUpperCase()),
    );
    for (const row of gone) {
      await convexMutation(api.shipments.deleteShipment, {
        reference: row.reference,
      });
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
  const rows = await convexQuery(api.shipments.geneiForSync, {});

  let synced = 0;
  for (const row of rows) {
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
      row.trackingUrl ??
      parsed.trackingUrl ??
      (parsed.tracking ? await getGeneiTrackingUrl(row.reference) : null);

    // Etiqueta: si aún no está en File Storage, se descarga (base64) y se
    // sube; label_url apunta siempre al route handler del admin
    let labelUrl = row.labelUrl;
    if (purchased && !row.hasStoredLabel) {
      const pdf = await getGeneiLabelPdf(row.reference);
      if (pdf && (await storeGeneiLabel(row.reference, pdf))) {
        labelUrl = geneiLabelRoute(row.reference);
      }
    }

    const transactionId = (row.raw as { genei_transaction_id?: number } | null)
      ?.genei_transaction_id;

    await convexMutation(api.shipments.updateShipment, {
      reference: row.reference,
      state: parsed.state,
      tracking: parsed.tracking,
      trackingUrl,
      labelUrl,
      cost: purchased ? (parsed.costBase ?? row.priceBase) : null,
      // clave ausente = conservar la recogida ya guardada
      ...(parsed.collectionDate !== null
        ? { collectionDate: parsed.collectionDate }
        : {}),
      ...(parsed.collectionTime !== null
        ? { collectionTime: parsed.collectionTime }
        : {}),
      raw: {
        ...detail,
        ...(transactionId != null
          ? { genei_transaction_id: transactionId }
          : {}),
        created_by: "crm",
      },
      syncedAt: Date.now(),
    });
    synced += 1;
  }
  return { synced };
}

// ─────────────── enlace con pedidos y fulfillment en Shopify ───────────────

// Envíos con etiqueta comprada y tracking → fulfillment en Shopify (con
// notificación al cliente) + pedido marcado como enviado en el CRM. Cada
// envío se empuja una sola vez (fulfillment_synced_at); si el pedido ya
// estaba enviado (fulfillment manual o módulo de Packlink), solo se marca.
export async function pushPacklinkFulfillments(): Promise<{
  fulfilled: number;
  errors: number;
}> {
  // custom_reference ("#1011") ↔ orders.name → order_id (id de Shopify)
  await convexMutation(api.shipments.linkShipmentsToOrders, {});

  const candidates = await convexQuery(api.shipments.fulfillmentCandidates, {});

  let fulfilled = 0;
  let errors = 0;
  for (const shipment of candidates) {
    if (!isPurchasedShipment(shipment.state)) continue;
    const order = await convexQuery(api.shipments.orderFulfillmentInfo, {
      orderId: shipment.orderId,
    });
    if (!order) continue;

    try {
      if (order.fulfillmentStatus !== "fulfilled" && !order.cancelledAt) {
        await createOrderFulfillment(order.orderId, {
          number: shipment.tracking,
          company: shipment.carrier,
          url: shipment.trackingUrl,
        });
        await convexMutation(api.shipments.markOrderFulfilled, {
          orderId: order.orderId,
        });
        fulfilled += 1;
      }
      await convexMutation(api.shipments.markFulfillmentSynced, {
        reference: shipment.reference,
      });
    } catch (error) {
      errors += 1;
      console.error(`[packlink-sync] fulfillment ${shipment.reference}`, error);
    }
  }
  return { fulfilled, errors };
}
