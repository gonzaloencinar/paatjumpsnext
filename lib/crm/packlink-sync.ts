import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/lib/supabase/types";

// Sincronización Packlink PRO → CRM: trae los envíos con su COSTE REAL
// (lo que pagamos al transportista) para el cierre de mes de /admin/finance.
// La cuenta se conectó sin envíos aún, así que el extractor es defensivo:
// prueba varios nombres de campo conocidos (SDKs oficiales/no oficiales) y
// guarda siempre el JSON crudo en `raw` — si el shape real difiere, se ajusta
// aquí y un resync re-extrae todo.

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
    custom_reference: firstString(raw, [
      "shipment_custom_reference",
      "custom_reference",
      "customReference",
      "order_id",
    ]),
    state,
    carrier: firstString(raw, ["carrier"]),
    service: firstString(raw, ["service"]),
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

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { shipments, totalPages } = await fetchPage(page);
    if (shipments.length === 0) break;

    const rows: TablesInsert<"packlink_shipments">[] = [];
    for (const shipment of shipments) {
      let row = toRow(shipment);
      if (!row) {
        skipped += 1;
        continue;
      }
      // Coste real desde el detalle (se refresca en cada sync por si Packlink
      // añade recargos a posteriori)
      if (isPurchasedShipment(row.state ?? null)) {
        const detail = await fetchDetail(row.reference);
        if (detail) {
          row = toRow({ ...shipment, ...detail }) ?? row;
        }
      }
      if (typeof row.cost === "number" && row.cost > 0 && !row.currency) {
        row.currency = "EUR";
      }
      rows.push(row);
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("packlink_shipments")
        .upsert(rows, { onConflict: "reference" });
      if (error) throw error;
      synced += rows.length;
    }

    if (page >= totalPages) break;
  }

  return { synced, skipped };
}
