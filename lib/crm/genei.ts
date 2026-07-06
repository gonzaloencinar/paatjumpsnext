// Cliente de la API v2 de Genei (apiv2.genei.es), proveedor de envíos de
// respaldo: /admin/orders cotiza SIEMPRE Packlink y Genei a la vez y propone
// el más barato domicilio-domicilio. Verificado contra la API real
// (2026-07-06):
//   POST /login                      body {username, password} (¡no email!),
//                                    Bearer con 15 días de vida
//   GET  /agencies/prices            cotizaciones; packages[] = JSON string
//                                    por bulto ({"weight":…,"height":…})
//   GET  /pickups/first-available    primera fecha/franja de recogida
//   POST /shipments                  crea envío en estado 7 (pendiente de
//                                    pago, sin coste) → reference + transactionId
//   GET  /payments/token?pg=4        token JWT de pago con SALDO de la cuenta
//   GET  /payments/pay/transactions/{id}?payment_token=…  PAGA el envío
//   GET  /shipments/{code}           detalle (estado, tracking, importes)
//   GET  /shipments/{code}/label?forceBase64=true&format=PDF  etiqueta base64
//   GET  /shipments/{code}/tracking/url  web de seguimiento del carrier
//   DELETE /shipments/{code}         elimina borrador / cancela pre-tránsito
// La referencia NO cambia al pagar (a diferencia de Packlink).

import {
  PACKLINK_SENDER,
  packlinkDateToIso,
  type PacklinkParcel,
  type PacklinkQuote,
  type PacklinkShipmentInput,
} from "./packlink";

const API_BASE = "https://apiv2.genei.es/api/v2";

// Enlace directo al envío en el panel web de Genei (formato verificado)
export function geneiPanelUrl(reference: string) {
  return `https://www.genei.es/usuario/envios/mis-envios/${encodeURIComponent(reference)}`;
}

// La etiqueta de Genei no tiene URL pública: se sirve por un route handler
// del propio admin que la descarga en base64 y la devuelve como PDF.
export function geneiLabelRoute(reference: string) {
  return `/api/admin/genei-label/${encodeURIComponent(reference)}`;
}

// Destinos con aduana: Genei exige el DNI/NIE del destinatario (verificado en
// vivo 2026-07-06: sin él POST /shipments devuelve 400 "destino.dni is not
// allowed to be empty" para CP de Canarias; en península acepta vacío).
export function requiresCustomsDni(country: string, zip: string): boolean {
  if (country.toUpperCase() !== "ES") return false;
  const prefix = zip.slice(0, 2);
  // 35/38 Canarias · 51 Ceuta · 52 Melilla
  return ["35", "38", "51", "52"].includes(prefix);
}

export class GeneiApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Genei ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

// ─────────────────────────── auth + HTTP ───────────────────────────

// El token dura 15 días; se cachea por instancia y se renueva en 401
let cachedToken: { token: string; fetchedAt: number } | null = null;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

async function login(): Promise<string> {
  const username = process.env.GENEI_EMAIL;
  const password = process.env.GENEI_PASSWORD;
  if (!username || !password) throw new Error("Faltan GENEI_EMAIL/PASSWORD");
  const response = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    token?: string | null;
    message?: string;
  };
  if (!response.ok || !body.token) {
    throw new GeneiApiError(response.status, body.message ?? "login sin token");
  }
  cachedToken = { token: body.token, fetchedAt: Date.now() };
  return body.token;
}

async function geneiToken(force = false): Promise<string> {
  if (
    !force &&
    cachedToken &&
    Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS
  ) {
    return cachedToken.token;
  }
  return login();
}

type Envelope<T> = {
  status?: number;
  message?: string;
  data?: T;
  errors?: unknown[];
};

// Todas las respuestas van envueltas en {status, message, data, errors};
// status 0 = error de negocio aunque el HTTP sea 200.
async function geneiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let token = await geneiToken();
  let response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (response.status === 401) {
    token = await geneiToken(true);
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  }
  const text = await response.text();
  let body: Envelope<T>;
  try {
    body = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new GeneiApiError(response.status, text);
  }
  if (!response.ok || body.status === 0) {
    const detail =
      [body.message, ...(body.errors ?? []).map(String)]
        .filter(Boolean)
        .join(" — ") || text;
    throw new GeneiApiError(response.status, detail);
  }
  return body.data as T;
}

// ─────────────────────────── cotizaciones ───────────────────────────

type RawAgency = {
  id_agencia: string | number;
  nombre_agencia: string;
  servicio_horas?: string | number | null;
  domicilio_domicilio?: number | string;
  importe: number;
  importe_sin_iva: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function toQuote(agency: RawAgency): PacklinkQuote {
  const id = Number(agency.id_agencia);
  const hours = Number(agency.servicio_horas) || null;
  return {
    provider: "genei",
    key: `genei:${id}`,
    id,
    carrier: agency.nombre_agencia.trim(),
    name: "",
    homeToHome: Number(agency.domicilio_domicilio) === 1,
    express: hours !== null && hours <= 24,
    priceBase: round2(Number(agency.importe_sin_iva)),
    priceTotal: round2(Number(agency.importe)),
    currency: "EUR",
    transit: hours ? `${hours} h` : null,
    estimatedDelivery: null,
    collection: null, // se resuelve al crear con /pickups/first-available
  };
}

export async function listGeneiQuotes(params: {
  toZip: string;
  toCountry: string;
  toCity: string;
  parcels: PacklinkParcel[];
}): Promise<PacklinkQuote[]> {
  const search = new URLSearchParams({
    isWarehouse: "false",
    isoCountryOrigin: PACKLINK_SENDER.country,
    isoCountryDestination: params.toCountry,
    postalCodeOrigin: PACKLINK_SENDER.zip_code,
    postalCodeDestination: params.toZip,
    townOrigin: PACKLINK_SENDER.city,
    townDestination: params.toCity,
  });
  for (const parcel of params.parcels) {
    search.append(
      "packages[]",
      JSON.stringify({
        weight: parcel.weight,
        height: parcel.height,
        width: parcel.width,
        length: parcel.length,
        isBox: false,
      }),
    );
  }
  const agencies = await geneiFetch<RawAgency[]>(
    `/agencies/prices?${search.toString()}`,
  );
  return agencies.map(toQuote);
}

// ─────────────────────────── recogida ───────────────────────────

// Primera recogida disponible desde `fromDate` (ISO), acotada a la mañana si
// la franja lo permite (mismo criterio que el borrador de Packlink).
export async function getGeneiPickup(params: {
  agencyId: number;
  fromDate: string;
  toCountry: string;
}): Promise<{ date: string; time: string } | null> {
  try {
    const data = await geneiFetch<{
      fecha_recogida?: string;
      horas?: { horasIntervalo?: { inicial?: string; final?: string } };
    }>(
      `/pickups/first-available?${new URLSearchParams({
        date: params.fromDate,
        postalCodeOrigin: PACKLINK_SENDER.zip_code,
        isoCountryOrigin: PACKLINK_SENDER.country,
        isoCountryDestination: params.toCountry,
        idAgency: String(params.agencyId),
      }).toString()}`,
    );
    const date = packlinkDateToIso(data.fecha_recogida);
    if (!date) return null;
    const start = data.horas?.horasIntervalo?.inicial ?? "09:00";
    const end = data.horas?.horasIntervalo?.final ?? "14:00";
    const morningEnd = end > "13:00" && start < "13:00" ? "13:00" : end;
    return { date, time: `${start}-${morningEnd}` };
  } catch {
    return null; // sin recogida programada el envío se crea igual
  }
}

// ─────────────────────────── envíos ───────────────────────────

// "2026-07-08" → "08/07/2026" (formato de pickupDate)
const isoToGeneiDate = (iso: string) => iso.split("-").reverse().join("/");

// Reutiliza el input de Packlink: serviceId = id de agencia Genei
export async function createGeneiShipment(
  params: PacklinkShipmentInput,
): Promise<{ reference: string; transactionId: number | null }> {
  const [pickupFrom = "09:00", pickupTo = "13:00"] =
    params.collection?.time.split("-") ?? [];
  const body = {
    packagesArray: params.parcels,
    origin: {
      postalCode: PACKLINK_SENDER.zip_code,
      town: PACKLINK_SENDER.city,
      name: PACKLINK_SENDER.company,
      address: PACKLINK_SENDER.street1,
      isoCountry: PACKLINK_SENDER.country,
      phone: PACKLINK_SENDER.phone,
      email: PACKLINK_SENDER.email,
      observations: "",
      dni: process.env.GENEI_FROM_DNI ?? "",
      contact: `${PACKLINK_SENDER.name} ${PACKLINK_SENDER.surname}`,
    },
    destination: {
      postalCode: params.to.zip_code,
      town: params.to.city,
      name: `${params.to.name} ${params.to.surname}`.trim(),
      address: [params.to.street1, params.to.street2]
        .filter(Boolean)
        .join(", "),
      isoCountry: params.to.country,
      phone: params.to.phone,
      email: params.to.email,
      observations: "",
      dni: params.to.dni ?? "",
      contact: `${params.to.name} ${params.to.surname}`.trim(),
    },
    paymentMethodShipping: 4, // saldo de la cuenta
    agencyId: params.serviceId,
    shippingFromWarehouse: 0,
    shippingToWarehouse: 0,
    shippingPalletized: 0,
    cashOnDelivery: 0,
    cashOnDeliveryAmount: 0,
    priority: 0,
    pickupAtStore: 0,
    insurance: 0,
    externalShippingCode: params.customReference,
    clientReference: params.customReference,
    note: params.content.slice(0, 100),
    ...(params.collection
      ? {
          pickupDate: isoToGeneiDate(params.collection.date),
          pickupTimeFrom: pickupFrom,
          pickupTimeTo: pickupTo,
        }
      : {}),
  };
  const data = await geneiFetch<{
    reference?: string;
    transactionId?: number;
  }>("/shipments", { method: "POST", body: JSON.stringify(body) });
  if (!data.reference) {
    throw new Error("Genei no devolvió la referencia del envío");
  }
  return {
    reference: data.reference,
    transactionId: data.transactionId ?? null,
  };
}

// Paga el envío con el SALDO de la cuenta Genei (pg=4). Con saldo
// insuficiente la API devuelve error → recargar en genei.es.
export async function payGeneiTransaction(transactionId: number) {
  const paymentToken = await geneiFetch<string>("/payments/token?pg=4");
  await geneiFetch(
    `/payments/pay/transactions/${transactionId}?payment_token=${encodeURIComponent(paymentToken)}`,
  );
}

export async function deleteGeneiShipment(reference: string): Promise<void> {
  await geneiFetch(`/shipments/${encodeURIComponent(reference)}`, {
    method: "DELETE",
  });
}

export async function getGeneiShipmentDetail(
  reference: string,
): Promise<Record<string, unknown>> {
  return geneiFetch<Record<string, unknown>>(
    `/shipments/${encodeURIComponent(reference)}`,
  );
}

// Etiqueta PDF en base64 (data anidada según agencia) → bytes
export async function getGeneiLabelPdf(
  reference: string,
): Promise<Uint8Array | null> {
  try {
    const data = await geneiFetch<string | { data?: string }>(
      `/shipments/${encodeURIComponent(reference)}/label?forceBase64=true&format=PDF`,
    );
    const base64 = typeof data === "string" ? data : data?.data;
    if (!base64) return null;
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

export async function getGeneiTrackingUrl(
  reference: string,
): Promise<string | null> {
  try {
    const data = await geneiFetch<{ webSeguimiento?: string | null }>(
      `/shipments/${encodeURIComponent(reference)}/tracking/url`,
    );
    return data.webSeguimiento ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────── estados ───────────────────────────

// Estados numéricos de Genei → vocabulario de estados Packlink que ya
// entienden packlinkPhase() y Finanzas (isPurchasedShipment). El numérico
// original queda en raw.estado.
// 7 pendiente de pago · 6 pendiente tramitar · 1 tramitado · 2 pendiente
// depositar · 5 en tránsito · 80 en reparto · 85 en oficina · 3 entregado ·
// 13 concertado reparto · 86 centro logístico · 9 recogida fallida ·
// 10 incidencia · 15 siniestro · 79 destruido · 14 devuelto · 11/12 abono ·
// 8 rectificativo · 77 cerrado
export function geneiStateToCrm(state: number | null | undefined): string {
  switch (state) {
    case 7:
      return "DRAFT";
    case 6:
    case 1:
    case 2:
      return "PROCESSING";
    case 5:
    case 13:
    case 85:
    case 86:
      return "IN_TRANSIT";
    case 80:
      return "OUT_FOR_DELIVERY";
    case 3:
      return "DELIVERED";
    case 77:
      return "COMPLETED";
    case 14:
      return "RETURNED_TO_SENDER";
    case 9:
    case 10:
    case 15:
    case 79:
      return "INCIDENT";
    case 8:
    case 11:
    case 12:
      return "CANCELED";
    default:
      return "PROCESSING";
  }
}

// Campos operativos del detalle de un envío Genei
export function parseGeneiDetail(detail: Record<string, unknown>): {
  state: string;
  tracking: string | null;
  trackingUrl: string | null;
  costBase: number | null;
  collectionDate: string | null;
  collectionTime: string | null;
} {
  const estado =
    typeof detail.estado === "number" ? detail.estado : Number(detail.estado);
  // fecha_recogida: "2026/07/08,09:00,14:00"
  const [rawDate, from, to] =
    typeof detail.fecha_recogida === "string"
      ? detail.fecha_recogida.split(",")
      : [];
  const importeSinIva = Number(detail.importe_sin_iva ?? detail.importe);
  return {
    state: geneiStateToCrm(Number.isFinite(estado) ? estado : null),
    tracking:
      typeof detail.codigo_seguimiento === "string" &&
      detail.codigo_seguimiento.trim()
        ? detail.codigo_seguimiento.trim()
        : null,
    trackingUrl:
      typeof detail.web_seguimiento === "string" && detail.web_seguimiento
        ? detail.web_seguimiento
        : null,
    costBase: Number.isFinite(importeSinIva) ? round2(importeSinIva) : null,
    collectionDate: packlinkDateToIso(rawDate),
    collectionTime: from && to ? `${from}-${to}` : null,
  };
}
