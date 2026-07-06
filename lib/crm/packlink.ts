// Cliente de la API de Packlink PRO para /admin/orders. Capacidades
// verificadas contra la API real (2026-07-06):
//   POST /v1/shipments            crea borrador (acepta collection_date/time)
//   PUT  /v1/shipments/{ref}      actualiza borrador (servicio, recogida…)
//   DELETE /v1/shipments/{ref}    elimina borrador
//   POST /v1/orders               COMPRA envíos (payload completo; devuelve
//                                 nueva referencia + total + recibo)
//   GET  /v1/shipments/{ref}/labels  PDFs de la etiqueta tras la compra
// El servicio por defecto es el MÁS BARATO con recogida y entrega a
// domicilio (dropoff=false y delivery_to_parcelshop=false); si el cliente
// eligió urgente 24h en el checkout, el más barato exprés domicilio-domicilio.

const API_BASE = "https://api.packlink.com/v1";
const PANEL_BASE = "https://pro.packlink.es/private";

// Estados previos a la compra de la etiqueta (mismo criterio que
// packlink-sync). Los demás estados se consideran ya comprados.
export const PACKLINK_DRAFT_STATES = new Set([
  "DRAFT",
  "PENDING",
  "AWAITING_COMPLETION",
  "READY_TO_PURCHASE",
]);

export type PacklinkPhase =
  | "borrador"
  | "etiqueta"
  | "recogida"
  | "enviado"
  | "entregado"
  | "incidencia"
  | "cancelado";

const STATE_PHASE: Record<string, PacklinkPhase> = {
  DELIVERED: "entregado",
  COMPLETED: "entregado",
  RETURNED_TO_SENDER: "incidencia",
  INCIDENT: "incidencia",
  CANCELED: "cancelado",
  CANCELLED: "cancelado",
  ACCEPTED: "enviado",
  IN_TRANSIT: "enviado",
  OUT_FOR_DELIVERY: "enviado",
};

// La opción de envío elegida en el checkout de Shopify indica urgente 24h
export function isUrgentShipping(title: string | null | undefined): boolean {
  return /24\s*h|urgente|express|exprés/i.test(title ?? "");
}

export function madridToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date()); // YYYY-MM-DD
}

// Fase operativa: Borrador → Etiqueta generada → Pendiente recogida (hay
// fecha y no ha pasado) → Enviado (pasó la fecha de recogida o el carrier ya
// lo movió) → Entregado. collectionDate en ISO (YYYY-MM-DD).
export function packlinkPhase(
  state: string | null | undefined,
  collectionDate?: string | null,
): PacklinkPhase {
  const normalized = (state ?? "").toUpperCase();
  const fixed = STATE_PHASE[normalized];
  if (fixed) return fixed;
  if (PACKLINK_DRAFT_STATES.has(normalized) || !normalized) return "borrador";
  // Comprado: la fecha de recogida decide la fase
  if (!collectionDate) return "etiqueta";
  return collectionDate < madridToday() ? "enviado" : "recogida";
}

// Enlace directo al panel PRO. Para borradores, la ruta de completado que
// usan los módulos oficiales de Packlink (referencia + /create/address).
export function packlinkPanelUrl(reference: string, phase: PacklinkPhase) {
  return phase === "borrador"
    ? `${PANEL_BASE}/shipments/${encodeURIComponent(reference)}/create/address`
    : `${PANEL_BASE}/shipments/${encodeURIComponent(reference)}`;
}

// ─────────────────────────── remitente y bultos ───────────────────────────

// Dirección del almacén (la misma que usa Packlink PRO). Se puede
// sobreescribir por env sin tocar código.
export const PACKLINK_SENDER = {
  name: process.env.PACKLINK_FROM_NAME ?? "Patricia",
  surname: process.env.PACKLINK_FROM_SURNAME ?? "Martí Rodriguez",
  company: process.env.PACKLINK_FROM_COMPANY ?? "Paat Jumps",
  email: process.env.PACKLINK_FROM_EMAIL ?? "contacto@paatjumps.com",
  phone: process.env.PACKLINK_FROM_PHONE ?? "+34649198591",
  street1: process.env.PACKLINK_FROM_STREET ?? "Calle de Magallanes 19 Piso 4B",
  city: process.env.PACKLINK_FROM_CITY ?? "Madrid",
  zip_code: process.env.PACKLINK_FROM_ZIP ?? "28015",
  country: process.env.PACKLINK_FROM_COUNTRY ?? "ES",
} as const;

// Sobre estándar de Paat Jumps (cm)
export const PARCEL_LENGTH_CM = 30;
export const PARCEL_WIDTH_CM = 20;
export const PARCEL_HEIGHT_CM = 7;
// Embalaje (sobre + relleno): se suma siempre al peso de las variantes
export const PACKAGING_WEIGHT_KG = 0.04;
// Peso por unidad si Shopify no tiene el peso de la variante
export const FALLBACK_UNIT_WEIGHT_KG = 0.15;

export type PacklinkAddress = {
  name: string;
  surname: string;
  company?: string | null;
  email: string;
  phone: string;
  street1: string;
  street2?: string | null;
  city: string;
  zip_code: string;
  country: string;
  /** DNI/NIE del destinatario: lo exige Genei en destinos con aduana
   *  (Canarias/Ceuta/Melilla); Packlink no lo usa (se descarta al enviar) */
  dni?: string | null;
};

export type PacklinkParcel = {
  width: number;
  height: number;
  length: number;
  weight: number;
};

// ─────────────────────────── HTTP ───────────────────────────

export class PacklinkApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Packlink ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

async function packlinkFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.PACKLINK_API_KEY;
  if (!apiKey) throw new Error("Falta PACKLINK_API_KEY");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new PacklinkApiError(response.status, await response.text());
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// Busca envíos por referencia de pedido ("#1014") en el listado. Se usa para
// detectar el envío READY_TO_PURCHASE que POST /v1/orders deja creado cuando
// el cobro falla (devuelve 500 pero el envío queda preparado).
export async function findPacklinkByCustomRef(
  customReference: string,
): Promise<{ reference: string; state: string | null }[]> {
  const found: { reference: string; state: string | null }[] = [];
  for (let page = 1; page <= 3; page++) {
    const body = await packlinkFetch<{
      shipments?: Record<string, unknown>[];
      pagination?: { total_pages?: number };
    }>(`/shipments?page=${page}`);
    for (const shipment of body.shipments ?? []) {
      if (shipment.shipment_custom_reference !== customReference) continue;
      const reference =
        (shipment.packlink_reference as string | undefined) ??
        (shipment.reference as string | undefined);
      if (!reference) continue;
      const state =
        ((shipment.status ?? shipment.state) as string | undefined) ?? null;
      found.push({ reference, state: state?.toUpperCase() ?? null });
    }
    if (page >= (body.pagination?.total_pages ?? 0)) break;
  }
  return found;
}

// ─────────────────────────── servicios ───────────────────────────

type RawService = {
  id: number;
  name: string;
  carrier_name: string;
  dropoff: boolean;
  delivery_to_parcelshop: boolean;
  category: string | null;
  transit_hours?: string | null;
  transit_time?: string | null;
  first_estimated_delivery_date?: string | null;
  available_dates?: Record<string, string>;
  price: { total_price: number; base_price: number; currency: string };
};

// Cotización de cualquiera de los dos proveedores (Packlink PRO o Genei):
// /admin/orders cotiza siempre ambos y propone el más barato dom-dom.
export type ShippingProvider = "packlink" | "genei";

export type PacklinkQuote = {
  provider: ShippingProvider;
  /** clave única entre proveedores: "packlink:20154" | "genei:12" */
  key: string;
  id: number;
  carrier: string;
  name: string;
  homeToHome: boolean;
  express: boolean;
  priceBase: number;
  priceTotal: number;
  currency: string;
  transit: string | null;
  estimatedDelivery: string | null; // ISO YYYY-MM-DD
  collection: { date: string; time: string } | null; // primera recogida (mañana)
};

// "2026/07/08" → "2026-07-08"
export function packlinkDateToIso(date: string | null | undefined) {
  if (!date) return null;
  const normalized = date.replaceAll("/", "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

const isoToPacklinkDate = (iso: string) => iso.replaceAll("-", "/");

// available_dates: { "2026/07/07": "[09:00 , 14:00]", … } → primera fecha con
// franja de mañana (inicio de la ventana hasta las 13:00 como muy tarde).
function firstMorningCollection(
  dates: Record<string, string> | undefined,
): { date: string; time: string } | null {
  if (!dates) return null;
  const [first] = Object.keys(dates).sort();
  if (!first) return null;
  const window = dates[first] ?? "";
  const [start = "09:00", end = "14:00"] = window.match(/\d{2}:\d{2}/g) ?? [];
  const morningEnd = end > "13:00" && start < "13:00" ? "13:00" : end;
  return {
    date: packlinkDateToIso(first) ?? first,
    time: `${start}-${morningEnd}`,
  };
}

function toQuote(service: RawService): PacklinkQuote {
  const transitHours = Number(service.transit_hours) || null;
  return {
    provider: "packlink",
    key: `packlink:${service.id}`,
    id: service.id,
    carrier: service.carrier_name,
    name: service.name,
    homeToHome: !service.dropoff && !service.delivery_to_parcelshop,
    express:
      (service.category ?? "").trim().toLowerCase() === "express" ||
      (transitHours !== null && transitHours <= 24),
    priceBase: service.price.base_price,
    priceTotal: service.price.total_price,
    currency: service.price.currency,
    transit: service.transit_time?.trim() || service.transit_hours || null,
    estimatedDelivery: packlinkDateToIso(service.first_estimated_delivery_date),
    collection: firstMorningCollection(service.available_dates),
  };
}

// Todas las cotizaciones para un destino: domicilio-domicilio primero (por
// precio) y después el resto (por precio) para el selector con ⚠️.
export async function listPacklinkQuotes(params: {
  toZip: string;
  toCountry: string;
  parcels: PacklinkParcel[];
}): Promise<PacklinkQuote[]> {
  const search = new URLSearchParams({
    "from[country]": PACKLINK_SENDER.country,
    "from[zip]": PACKLINK_SENDER.zip_code,
    "to[country]": params.toCountry,
    "to[zip]": params.toZip,
  });
  params.parcels.forEach((parcel, i) => {
    search.set(`packages[${i}][width]`, String(parcel.width));
    search.set(`packages[${i}][height]`, String(parcel.height));
    search.set(`packages[${i}][length]`, String(parcel.length));
    search.set(`packages[${i}][weight]`, String(parcel.weight));
  });
  const services = await packlinkFetch<RawService[]>(
    `/services?${search.toString()}`,
  );
  return services.map(toQuote).sort(compareQuotes);
}

// Domicilio-domicilio primero; dentro de cada grupo, por precio sin IVA (los
// umbrales de negocio y Finanzas van sin IVA). Sirve también para el listado
// mezclado Packlink + Genei.
export function compareQuotes(a: PacklinkQuote, b: PacklinkQuote): number {
  if (a.homeToHome !== b.homeToHome) return a.homeToHome ? -1 : 1;
  return a.priceBase - b.priceBase;
}

// Servicio por defecto: el más barato domicilio-domicilio; con urgente 24h,
// el más barato exprés domicilio-domicilio (si lo hay).
export function pickDefaultQuote(
  quotes: PacklinkQuote[],
  urgent: boolean,
): PacklinkQuote | null {
  const home = quotes.filter((quote) => quote.homeToHome);
  if (urgent) {
    const express = home.filter((quote) => quote.express);
    if (express.length > 0) return express[0]!;
  }
  return home[0] ?? null;
}

// ─────────────────────────── códigos postales ───────────────────────────

// El panel de Packlink no resuelve país/CP desde los strings de la dirección:
// usa el id interno del código postal (additional_data.zip_code_id_*) y el
// campo `state`. Sin ellos, el borrador aparece con país y CP vacíos en la
// web. Se resuelven con el buscador de CPs de la propia API.
type PostalCodeHit = {
  id: string;
  zipcode: string;
  city: string;
  state: string | null;
  postal_zone_id: number | null;
};

const postalCodeCache = new Map<string, PostalCodeHit | null>();

export async function lookupPostalCode(
  country: string,
  zip: string,
): Promise<PostalCodeHit | null> {
  const key = `${country}:${zip}`;
  const cached = postalCodeCache.get(key);
  if (cached !== undefined) return cached;
  let hit: PostalCodeHit | null = null;
  try {
    const results = await packlinkFetch<PostalCodeHit[]>(
      `/locations/postalcodes/country/${encodeURIComponent(country)}?q=${encodeURIComponent(zip)}`,
    );
    hit = results.find((r) => r.zipcode === zip) ?? results[0] ?? null;
  } catch {
    hit = null; // sin lookup el borrador se crea igual, solo peor pintado
  }
  postalCodeCache.set(key, hit);
  return hit;
}

// ─────────────────────────── envíos ───────────────────────────

export type PacklinkShipmentInput = {
  to: PacklinkAddress;
  parcels: PacklinkParcel[];
  content: string;
  contentValue: number;
  serviceId: number;
  customReference: string;
  collection?: { date: string; time: string } | null; // date en ISO
};

async function shipmentBody(params: PacklinkShipmentInput) {
  const [fromZip, toZip] = await Promise.all([
    lookupPostalCode(PACKLINK_SENDER.country, PACKLINK_SENDER.zip_code),
    lookupPostalCode(params.to.country, params.to.zip_code),
  ]);
  // dni es para Genei; la API de Packlink no lo contempla
  const { dni: _dni, ...to } = params.to;
  return {
    from: { ...PACKLINK_SENDER, state: fromZip?.state ?? null },
    to: { ...to, state: toZip?.state ?? null },
    packages: params.parcels,
    content: params.content,
    contentvalue: params.contentValue,
    service_id: params.serviceId,
    shipment_custom_reference: params.customReference,
    source: "source_inbound_api",
    additional_data: {
      ...(fromZip
        ? {
            zip_code_id_from: fromZip.id,
            postal_zone_id_from: String(fromZip.postal_zone_id ?? ""),
            postal_zone_name_from: fromZip.state ?? "",
          }
        : {}),
      ...(toZip
        ? {
            zip_code_id_to: toZip.id,
            postal_zone_id_to: String(toZip.postal_zone_id ?? ""),
            postal_zone_name_to: toZip.state ?? "",
          }
        : {}),
    },
    ...(params.collection
      ? {
          collection_date: isoToPacklinkDate(params.collection.date),
          collection_time: params.collection.time,
        }
      : {}),
  };
}

export async function createPacklinkDraft(
  params: PacklinkShipmentInput,
): Promise<string> {
  const created = await packlinkFetch<{
    reference?: string;
    shipment_reference?: string;
  }>("/shipments", {
    method: "POST",
    body: JSON.stringify(await shipmentBody(params)),
  });
  const reference = created.reference ?? created.shipment_reference;
  if (!reference) {
    throw new Error("Packlink no devolvió la referencia del borrador");
  }
  return reference;
}

export async function updatePacklinkDraft(
  reference: string,
  params: PacklinkShipmentInput,
): Promise<void> {
  await packlinkFetch(`/shipments/${encodeURIComponent(reference)}`, {
    method: "PUT",
    body: JSON.stringify(await shipmentBody(params)),
  });
}

export async function deletePacklinkShipment(reference: string): Promise<void> {
  await packlinkFetch(`/shipments/${encodeURIComponent(reference)}`, {
    method: "DELETE",
  });
}

// Compra: POST /v1/orders crea un envío NUEVO ya pagado (referencia distinta
// al borrador; el borrador viejo se borra aparte). El cargo va al método de
// pago configurado en la cuenta Packlink PRO.
export async function purchasePacklinkShipment(
  params: PacklinkShipmentInput,
  orderReference: string,
): Promise<{
  reference: string;
  totalPrice: number | null;
  receipt: string | null;
}> {
  const result = await packlinkFetch<{
    order_reference?: string;
    shipments?: {
      shipment_reference?: string;
      reference?: string;
      total_price?: number;
      receipt?: string;
    }[];
    total_amount?: number;
  }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      order_custom_reference: orderReference,
      shipments: [await shipmentBody(params)],
    }),
  });
  const shipment = result.shipments?.[0];
  const reference = shipment?.shipment_reference ?? shipment?.reference;
  if (!reference) {
    throw new Error(
      `Packlink no devolvió la referencia de la compra: ${JSON.stringify(result).slice(0, 200)}`,
    );
  }
  return {
    reference,
    totalPrice: shipment?.total_price ?? result.total_amount ?? null,
    receipt: shipment?.receipt ?? null,
  };
}

export async function getPacklinkLabels(reference: string): Promise<string[]> {
  return packlinkFetch<string[]>(
    `/shipments/${encodeURIComponent(reference)}/labels`,
  );
}

export async function getPacklinkShipmentDetail(
  reference: string,
): Promise<Record<string, unknown>> {
  return packlinkFetch<Record<string, unknown>>(
    `/shipments/${encodeURIComponent(reference)}`,
  );
}
