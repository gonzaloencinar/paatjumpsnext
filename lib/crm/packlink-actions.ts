"use server";

import { revalidatePath } from "next/cache";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import { getOrderShippingDetails } from "@/lib/shopify/admin";
import { requireAdmin } from "./actions";
import {
  compareQuotes,
  createPacklinkDraft,
  deletePacklinkShipment,
  FALLBACK_UNIT_WEIGHT_KG,
  PACKAGING_WEIGHT_KG,
  findPacklinkByCustomRef,
  getPacklinkLabels,
  getPacklinkShipmentDetail,
  isUrgentShipping,
  listPacklinkQuotes,
  madridToday,
  PACKLINK_DRAFT_STATES,
  PacklinkApiError,
  PARCEL_HEIGHT_CM,
  PARCEL_LENGTH_CM,
  PARCEL_WIDTH_CM,
  packlinkPanelUrl,
  pickDefaultQuote,
  purchasePacklinkShipment,
  updatePacklinkDraft,
  type PacklinkQuote,
  type PacklinkShipmentInput,
} from "./packlink";
import {
  createGeneiShipment,
  deleteGeneiShipment,
  geneiLabelRoute,
  geneiPanelUrl,
  getGeneiLabelPdf,
  getGeneiPickup,
  getGeneiShipmentDetail,
  getGeneiTrackingUrl,
  listGeneiQuotes,
  parseGeneiDetail,
  payGeneiTransaction,
  requiresCustomsDni,
} from "./genei";
import { getOrderDni, recordManualDni } from "./dni-requests";
import {
  pushPacklinkFulfillments,
  storeGeneiLabel,
  syncGeneiShipments,
  syncPacklinkShipments,
} from "./packlink-sync";

// Mutaciones de envíos de /admin/orders: borrador con el servicio más barato
// domicilio-domicilio (o el elegido en el selector), cambio de servicio,
// COMPRA de la etiqueta y descarga. Cada cotización compara SIEMPRE Packlink
// PRO y Genei a la vez; el borrador se crea en el proveedor de la opción
// elegida (por defecto, la más barata domicilio-domicilio).
// Los datos viven en Convex (convex/shipments.ts); requireAdmin() sigue
// validando la sesión (Convex Auth + allowlist admin_users).

const ORDERS_PATH = "/admin/orders";

const quoteLabel = (quote: PacklinkQuote) =>
  [quote.carrier, quote.name].filter(Boolean).join(" · ");

function madridTomorrow(): string {
  const date = new Date(`${madridToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// raw se guarda como JSON plano (v.any() de Convex no admite undefined
// anidados; mismo comportamiento que la columna jsonb legacy)
function toJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

// ─────────────────── datos del pedido → payload Packlink ───────────────────

// Medidas (cm) y peso (kg) del paquete, siempre editables en la UI al crear.
// Por defecto: sobre estándar 30×20×7 (vale para 1-2 combas) y peso real del
// pedido de Shopify; con más de 2 unidades la UI obliga a revisarlos.
export type ParcelDims = {
  length: number;
  width: number;
  height: number;
  weight?: number | null;
};

function sanitizeDims(dims?: ParcelDims | null): ParcelDims | null {
  if (!dims) return null;
  const length = Number(dims.length);
  const width = Number(dims.width);
  const height = Number(dims.height);
  if (
    ![length, width, height].every(
      (value) => Number.isFinite(value) && value >= 1 && value <= 200,
    )
  ) {
    return null;
  }
  const weight = Number(dims.weight);
  return {
    length: Math.round(length),
    width: Math.round(width),
    height: Math.round(height),
    weight:
      Number.isFinite(weight) && weight >= 0.01 && weight <= 40
        ? Math.round(weight * 100) / 100
        : null,
  };
}

type OrderBasics = {
  name: string;
  urgent: boolean;
  to: PacklinkShipmentInput["to"];
  parcels: PacklinkShipmentInput["parcels"];
  content: string;
  contentValue: number;
};

// DNI/NIE tecleado en el CRM (respaldo cuando el pedido no lo trae)
function sanitizeDni(dni?: string | null): string | null {
  const clean = (dni ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9 .-]{4,18}$/.test(clean) ? clean : null;
}

async function orderBasics(
  orderId: number,
  dims?: ParcelDims | null,
): Promise<OrderBasics | { error: string }> {
  let details;
  try {
    details = await getOrderShippingDetails(orderId);
  } catch (error) {
    console.error("[packlink] order details", error);
    return { error: "No se pudo leer el pedido de Shopify." };
  }
  const address = details?.shippingAddress;
  if (!details || !address?.address1 || !address.zip || !address.city) {
    return { error: "El pedido no tiene dirección de envío completa." };
  }

  // Peso por defecto: variantes de Shopify + 40 g de embalaje (sobre +
  // relleno). Si el usuario edita el peso a mano, se usa el suyo tal cual.
  const weight = Math.max(
    0.1,
    Math.round(
      (details.lineItems.reduce(
        (sum, item) =>
          sum + (item.weightKg ?? FALLBACK_UNIT_WEIGHT_KG) * item.quantity,
        0,
      ) +
        PACKAGING_WEIGHT_KG) *
        100,
    ) / 100,
  );

  return {
    name: details.name,
    urgent: isUrgentShipping(details.shippingLineTitle),
    to: {
      name: address.firstName ?? "Cliente",
      surname: address.lastName ?? "-",
      company: address.company,
      email: details.email ?? "contacto@paatjumps.com",
      phone: address.phone ?? "+34649198591",
      street1: address.address1,
      street2: address.address2,
      city: address.city,
      zip_code: address.zip.replace(/\s+/g, ""),
      country: address.countryCodeV2 ?? "ES",
      // DNI recibido por el formulario post-pedido (lib/crm/dni-requests.ts)
      dni: await getOrderDni(orderId),
    },
    parcels: [
      {
        width: dims?.width ?? PARCEL_WIDTH_CM,
        height: dims?.height ?? PARCEL_HEIGHT_CM,
        length: dims?.length ?? PARCEL_LENGTH_CM,
        weight: dims?.weight ?? weight,
      },
    ],
    content:
      details.lineItems
        .map((item) => `${item.quantity} ${item.title}`)
        .join(", ")
        .slice(0, 100) || "Combas de saltar",
    contentValue: details.total,
  };
}

// ─────────────────────────── cotizaciones ───────────────────────────

export type QuoteListResult =
  | {
      quotes: PacklinkQuote[];
      defaultKey: string | null;
      urgent: boolean;
      /** paquete cotizado (medidas por defecto o las editadas) para la UI */
      parcel: PacklinkShipmentInput["parcels"][number];
      /** destino con aduana (Canarias/Ceuta/Melilla): Genei exige DNI */
      needsDni: boolean;
      /** DNI del pedido (note_attribute del carrito) para prefillar */
      dni: string | null;
    }
  | { error: string };

// Packlink + Genei en paralelo; si un proveedor falla se sigue con el otro
// (con aviso en el resultado solo si fallan los dos).
async function listAllQuotes(basics: OrderBasics): Promise<PacklinkQuote[]> {
  const [packlink, genei] = await Promise.allSettled([
    listPacklinkQuotes({
      toZip: basics.to.zip_code,
      toCountry: basics.to.country,
      parcels: basics.parcels,
    }),
    listGeneiQuotes({
      toZip: basics.to.zip_code,
      toCountry: basics.to.country,
      toCity: basics.to.city,
      parcels: basics.parcels,
    }),
  ]);
  if (packlink.status === "rejected") {
    console.error("[packlink] quotes", packlink.reason);
  }
  if (genei.status === "rejected") {
    console.error("[genei] quotes", genei.reason);
  }
  const quotes = [
    ...(packlink.status === "fulfilled" ? packlink.value : []),
    ...(genei.status === "fulfilled" ? genei.value : []),
  ];
  if (quotes.length === 0) {
    throw new Error("Ni Packlink ni Genei respondieron al cotizar.");
  }
  return quotes.sort(compareQuotes);
}

// Cotizaciones para el selector de servicio (domicilio-domicilio primero,
// mezclando ambos proveedores por precio sin IVA)
export async function listQuotesAction(
  orderId: number,
  dims?: ParcelDims,
): Promise<QuoteListResult> {
  await requireAdmin();
  const basics = await orderBasics(orderId, sanitizeDims(dims));
  if ("error" in basics) return basics;
  try {
    const quotes = await listAllQuotes(basics);
    return {
      quotes,
      defaultKey: pickDefaultQuote(quotes, basics.urgent)?.key ?? null,
      urgent: basics.urgent,
      parcel: basics.parcels[0]!,
      needsDni: requiresCustomsDni(basics.to.country, basics.to.zip_code),
      dni: basics.to.dni ?? null,
    };
  } catch (error) {
    console.error("[shipping] quotes", error);
    return { error: "Ningún proveedor respondió al cotizar." };
  }
}

// ─────────────────────────── crear / cambiar servicio ───────────────────────────

export type DraftActionResult =
  | {
      ok: true;
      reference: string;
      url: string;
      service: string;
      priceBase: string;
    }
  | { error: string };

function quoteByKey(quotes: PacklinkQuote[], key: string) {
  return quotes.find((quote) => quote.key === key) ?? null;
}

// Crea el borrador en el proveedor de la cotización y lo registra en el CRM.
// Packlink: POST /shipments (borrador editable). Genei: POST /shipments crea
// el envío en estado 7 (pendiente de pago, sin coste), con la primera
// recogida de mañana; el transactionId para pagar queda en raw.
async function createDraftForQuote(
  orderId: number,
  basics: OrderBasics,
  quote: PacklinkQuote,
): Promise<DraftActionResult> {
  // Genei exige el DNI del destinatario en destinos con aduana; sin él el
  // envío no se puede crear (Packlink lo gestiona después en su panel)
  if (
    quote.provider === "genei" &&
    requiresCustomsDni(basics.to.country, basics.to.zip_code) &&
    !basics.to.dni
  ) {
    return {
      error:
        "Genei necesita el DNI/NIE del destinatario para la aduana (Canarias/Ceuta/Melilla). Escríbelo en el selector de servicio.",
    };
  }

  const collection =
    quote.provider === "genei"
      ? await getGeneiPickup({
          agencyId: quote.id,
          fromDate: madridTomorrow(),
          toCountry: basics.to.country,
        })
      : quote.collection;

  const input: PacklinkShipmentInput = {
    to: basics.to,
    parcels: basics.parcels,
    content: basics.content,
    contentValue: basics.contentValue,
    serviceId: quote.id,
    customReference: basics.name,
    collection,
  };

  let reference: string;
  let transactionId: number | null = null;
  try {
    if (quote.provider === "genei") {
      ({ reference, transactionId } = await createGeneiShipment(input));
    } else {
      reference = await createPacklinkDraft(input);
    }
  } catch (error) {
    console.error(`[${quote.provider}] create draft`, error);
    // El motivo importa: p. ej. Genei valida el saldo YA AL CREAR con pago a
    // saldo ("Saldo Insuficiente - current: …") → recargar en genei.es
    const message = error instanceof Error ? error.message : "";
    return {
      error: `${quote.provider === "genei" ? "Genei" : "Packlink"} rechazó el borrador${
        message ? ` — ${message.slice(0, 180)}` : ". Revisa la dirección"
      }.`,
    };
  }

  await convexMutation(api.shipments.upsertShipment, {
    reference,
    provider: quote.provider,
    customReference: basics.name,
    orderId,
    state: quote.provider === "genei" ? "DRAFT" : "AWAITING_COMPLETION",
    carrier: quote.carrier,
    service: quote.name || null,
    serviceId: String(quote.id),
    priceBase: quote.priceBase,
    priceTotal: quote.priceTotal,
    currency: quote.currency,
    collectionDate: collection?.date ?? null,
    collectionTime: collection?.time ?? null,
    estimatedDeliveryDate: quote.estimatedDelivery,
    homeToHome: quote.homeToHome,
    raw: toJson({
      created_by: "crm",
      input,
      ...(transactionId != null ? { genei_transaction_id: transactionId } : {}),
    }),
    syncedAt: Date.now(),
  });

  revalidatePath(ORDERS_PATH);
  return {
    ok: true,
    reference,
    url:
      quote.provider === "genei"
        ? geneiPanelUrl(reference)
        : packlinkPanelUrl(reference, "borrador"),
    service: quoteLabel(quote),
    priceBase: `${quote.priceBase.toFixed(2)} € s/IVA`,
  };
}

// quoteKey opcional ("packlink:20154" | "genei:12"): sin él, el más barato
// domicilio-domicilio de ambos proveedores (exprés si el pedido es urgente
// 24h). Recogida por defecto: día siguiente por la mañana.
export async function createPacklinkDraftAction(
  orderId: number,
  quoteKey?: string,
  dims?: ParcelDims,
  dni?: string,
): Promise<DraftActionResult> {
  await requireAdmin();

  // No duplicar: solo bloquea si hay un envío vivo (los cancelados no cuentan)
  const existingRows = await convexQuery(api.shipments.shipmentsByOrder, {
    orderId,
  });
  const alive = existingRows.find(
    (row) => !["CANCELED", "CANCELLED"].includes(row.state ?? ""),
  );
  if (alive) {
    return { error: `El pedido ya tiene el envío ${alive.reference}.` };
  }

  const basics = await orderBasics(orderId, sanitizeDims(dims));
  if ("error" in basics) return basics;
  const manualDni = sanitizeDni(dni);
  if (manualDni) {
    basics.to.dni = manualDni;
    // Resuelve la petición pendiente → paran recordatorios y avisos
    await recordManualDni(orderId, manualDni);
  }

  let quote: PacklinkQuote | null;
  try {
    const quotes = await listAllQuotes(basics);
    quote = quoteKey
      ? quoteByKey(quotes, quoteKey)
      : pickDefaultQuote(quotes, basics.urgent);
  } catch (error) {
    console.error("[shipping] services", error);
    return { error: "Ningún proveedor respondió al buscar servicios." };
  }
  if (!quote) {
    return { error: "No hay servicios disponibles para ese destino." };
  }

  return createDraftForQuote(orderId, basics, quote);
}

// Cambia el servicio (y re-programa la recogida) de un borrador existente.
// Mismo proveedor Packlink → PUT sobre el borrador; si cambia el proveedor o
// es Genei (sin PUT en su API) → se crea el nuevo y se elimina el viejo.
export async function changePacklinkServiceAction(
  reference: string,
  orderId: number,
  quoteKey: string,
  dims?: ParcelDims,
  dni?: string,
): Promise<DraftActionResult> {
  await requireAdmin();
  const basics = await orderBasics(orderId, sanitizeDims(dims));
  if ("error" in basics) return basics;
  const manualDni = sanitizeDni(dni);
  if (manualDni) {
    basics.to.dni = manualDni;
    await recordManualDni(orderId, manualDni);
  }

  const current = await convexQuery(api.shipments.shipmentByReference, {
    reference,
  });
  const currentProvider = current?.provider ?? "packlink";

  let quote: PacklinkQuote | null;
  try {
    const quotes = await listAllQuotes(basics);
    quote = quoteByKey(quotes, quoteKey);
  } catch (error) {
    console.error("[shipping] services", error);
    return { error: "Ningún proveedor respondió al buscar servicios." };
  }
  if (!quote) return { error: "Ese servicio ya no está disponible." };

  if (currentProvider !== "packlink" || quote.provider !== "packlink") {
    // Crear primero el nuevo; solo si va bien se elimina el borrador viejo
    const created = await createDraftForQuote(orderId, basics, quote);
    if ("error" in created) return created;
    try {
      if (currentProvider === "genei") await deleteGeneiShipment(reference);
      else await deletePacklinkShipment(reference);
    } catch (error) {
      console.warn(`[${currentProvider}] delete old draft`, error);
    }
    await convexMutation(api.shipments.deleteShipment, { reference });
    revalidatePath(ORDERS_PATH);
    return created;
  }

  const input: PacklinkShipmentInput = {
    to: basics.to,
    parcels: basics.parcels,
    content: basics.content,
    contentValue: basics.contentValue,
    serviceId: quote.id,
    customReference: basics.name,
    collection: quote.collection,
  };

  try {
    await updatePacklinkDraft(reference, input);
  } catch (error) {
    console.error("[packlink] update draft", error);
    if (error instanceof PacklinkApiError && error.status === 404) {
      // Borrador eliminado a mano en el panel → se quita del CRM y el pedido
      // vuelve a mostrar el botón de crear borrador
      await convexMutation(api.shipments.deleteShipment, { reference });
      revalidatePath(ORDERS_PATH);
      return {
        error:
          "Ese borrador ya no existe en Packlink (se ha quitado del CRM). Crea uno nuevo.",
      };
    }
    return { error: "Packlink no dejó cambiar el servicio." };
  }

  await convexMutation(api.shipments.updateShipment, {
    reference,
    carrier: quote.carrier,
    service: quote.name,
    serviceId: String(quote.id),
    priceBase: quote.priceBase,
    priceTotal: quote.priceTotal,
    currency: quote.currency,
    collectionDate: quote.collection?.date ?? null,
    collectionTime: quote.collection?.time ?? null,
    estimatedDeliveryDate: quote.estimatedDelivery,
    homeToHome: quote.homeToHome,
    syncedAt: Date.now(),
  });

  revalidatePath(ORDERS_PATH);
  return {
    ok: true,
    reference,
    url: packlinkPanelUrl(reference, "borrador"),
    service: quoteLabel(quote),
    priceBase: `${quote.priceBase.toFixed(2)} € s/IVA`,
  };
}

// ─────────────────────────── pagar ───────────────────────────

// Fila del envío tal y como la devuelve convex/shipments.ts (camelCase, null)
type DraftRow = NonNullable<
  FunctionReturnType<typeof api.shipments.shipmentByReference>
>;

// Si el cobro de /v1/orders falla dejando un envío preparado, se sustituye el
// borrador viejo por esa referencia (en Packlink y en el CRM).
async function adoptPreparedShipment(params: {
  orderId: number;
  customReference: string;
  previousReference: string;
  row: DraftRow;
}): Promise<string | null> {
  try {
    const candidates = (await findPacklinkByCustomRef(params.customReference))
      .filter(
        (shipment) =>
          shipment.reference !== params.previousReference &&
          PACKLINK_DRAFT_STATES.has(shipment.state ?? ""),
      )
      .sort((a, b) => (a.reference < b.reference ? 1 : -1));
    const prepared = candidates[0];
    if (!prepared) return null;

    // El borrador anterior sobra (si el panel no lo tenía ya borrado)
    try {
      await deletePacklinkShipment(params.previousReference);
    } catch {
      // ya no existía
    }
    await convexMutation(api.shipments.deleteShipment, {
      reference: params.previousReference,
    });

    let detail: Record<string, unknown> = {};
    try {
      detail = await getPacklinkShipmentDetail(prepared.reference);
    } catch {
      // sin detalle, la fila se rellena con los datos del borrador
    }
    await convexMutation(api.shipments.upsertShipment, {
      reference: prepared.reference,
      customReference: params.customReference,
      orderId: params.orderId,
      state: prepared.state ?? "READY_TO_PURCHASE",
      carrier: params.row.carrier,
      service: params.row.service,
      serviceId: params.row.serviceId,
      priceBase: params.row.priceBase,
      priceTotal: params.row.priceTotal,
      currency: params.row.currency ?? "EUR",
      collectionDate:
        typeof detail.collection_date === "string"
          ? detail.collection_date.replaceAll("/", "-")
          : params.row.collectionDate,
      collectionTime:
        typeof detail.collection_time === "string"
          ? detail.collection_time
          : params.row.collectionTime,
      estimatedDeliveryDate: params.row.estimatedDeliveryDate,
      homeToHome: params.row.homeToHome,
      raw: toJson({ ...detail, created_by: "crm" }),
      syncedAt: Date.now(),
    });
    return prepared.reference;
  } catch (error) {
    console.warn("[packlink] adopt prepared", error);
    return null;
  }
}

export type PayResult =
  | {
      ok: true;
      reference: string;
      labelUrl: string | null;
      total: string | null;
    }
  | { error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pago de un envío Genei: cobra la transacción contra el SALDO de la cuenta
// (la referencia no cambia) y refresca detalle, tracking y etiqueta. Si el
// carrier tarda en tramitar, el cron completa tracking/etiqueta después.
async function payGeneiDraft(row: DraftRow): Promise<PayResult> {
  const transactionId = (row.raw as { genei_transaction_id?: number } | null)
    ?.genei_transaction_id;
  if (!transactionId) {
    return {
      error:
        "Este borrador de Genei no tiene transacción de pago. Elimínalo y crea uno nuevo.",
    };
  }

  try {
    await payGeneiTransaction(transactionId);
  } catch (error) {
    console.error("[genei] pay", error);
    const message = error instanceof Error ? error.message : "";
    return {
      error: `Genei no pudo cobrar el envío${message ? ` — ${message.slice(0, 180)}` : ""}. Comprueba el saldo de tu cuenta en genei.es y vuelve a pulsar Pagar.`,
    };
  }

  // Detalle y etiqueta pueden tardar unos segundos tras el pago. La etiqueta
  // (base64) se sube a Convex File Storage; label_url apunta al route del admin
  let detail: Record<string, unknown> | null = null;
  let labelUrl: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(attempt === 0 ? 1500 : 3000);
    detail = await getGeneiShipmentDetail(row.reference).catch(() => detail);
    if (!labelUrl) {
      const pdf = await getGeneiLabelPdf(row.reference);
      if (pdf && (await storeGeneiLabel(row.reference, pdf))) {
        labelUrl = geneiLabelRoute(row.reference);
      }
    }
    if (labelUrl && detail) break;
  }
  const parsed = detail ? parseGeneiDetail(detail) : null;
  const trackingUrl = parsed?.tracking
    ? (parsed.trackingUrl ?? (await getGeneiTrackingUrl(row.reference)))
    : null;

  await convexMutation(api.shipments.updateShipment, {
    reference: row.reference,
    // pagado: aunque el detalle tarde, ya no es borrador
    state: !parsed || parsed.state === "DRAFT" ? "PROCESSING" : parsed.state,
    cost: parsed?.costBase ?? row.priceBase,
    currency: row.currency ?? "EUR",
    tracking: parsed?.tracking ?? null,
    trackingUrl,
    labelUrl,
    collectionDate: parsed?.collectionDate ?? row.collectionDate,
    collectionTime: parsed?.collectionTime ?? row.collectionTime,
    shipmentDate: Date.now(),
    raw: toJson({
      ...(detail ?? {}),
      genei_transaction_id: transactionId,
      created_by: "crm",
    }),
    syncedAt: Date.now(),
  });

  // Fulfillment en Shopify si ya hay tracking; si no, lo hará el cron
  try {
    await pushPacklinkFulfillments();
  } catch (error) {
    console.warn("[genei] fulfillment tras pago", error);
  }

  revalidatePath(ORDERS_PATH);
  return {
    ok: true,
    reference: row.reference,
    labelUrl,
    total: row.priceTotal != null ? `${row.priceTotal.toFixed(2)} €` : null,
  };
}

// Compra la etiqueta del borrador. Packlink: POST /v1/orders crea el envío
// pagado con referencia nueva y el borrador viejo se elimina (cargo al método
// de pago de Packlink PRO). Genei: cobro de la transacción contra saldo.
export async function payPacklinkDraftAction(
  reference: string,
  orderId: number,
): Promise<PayResult> {
  await requireAdmin();

  const row = await convexQuery(api.shipments.shipmentByReference, {
    reference,
  });
  if (!row?.serviceId) {
    return { error: "No encuentro el borrador o no tiene servicio elegido." };
  }

  if (row.provider === "genei") {
    return payGeneiDraft(row);
  }

  const basics = await orderBasics(orderId);
  if ("error" in basics) return basics;

  // Bultos: los del borrador (raw.input, con medidas/peso editados al
  // crearlo); solo si faltan se recalculan por defecto desde el pedido
  const draftParcels = (row.raw as { input?: PacklinkShipmentInput } | null)
    ?.input?.parcels;
  const parcels =
    draftParcels && draftParcels.length > 0 ? draftParcels : basics.parcels;

  // Recogida: la del borrador si sigue siendo futura; si caducó, la próxima
  // mañana disponible del servicio.
  let collection =
    row.collectionDate && row.collectionDate >= madridToday()
      ? {
          date: row.collectionDate,
          time: row.collectionTime ?? "09:00-13:00",
        }
      : null;
  if (!collection) {
    try {
      const quotes = await listPacklinkQuotes({
        toZip: basics.to.zip_code,
        toCountry: basics.to.country,
        parcels,
      });
      collection =
        quotes.find((quote) => quote.id === Number(row.serviceId))
          ?.collection ?? null;
    } catch {
      collection = null;
    }
  }

  // POST /v1/orders exige fecha y hora de recogida (CarrierProductFailure)
  if (!collection) {
    return {
      error:
        "El servicio no ofrece fecha de recogida ahora mismo. Cambia de servicio o inténtalo más tarde.",
    };
  }

  const input: PacklinkShipmentInput = {
    to: basics.to,
    parcels,
    content: basics.content,
    contentValue: basics.contentValue,
    serviceId: Number(row.serviceId),
    customReference: basics.name,
    collection,
  };

  let purchased;
  try {
    purchased = await purchasePacklinkShipment(input, basics.name);
  } catch (error) {
    console.error("[packlink] purchase", error);
    // POST /v1/orders deja a veces el envío PREPARADO (READY_TO_PURCHASE)
    // aunque el cobro falle con 500 (verificado 2026-07-06): se adopta esa
    // referencia para no duplicar envíos en cada reintento.
    const adopted = await adoptPreparedShipment({
      orderId,
      customReference: basics.name,
      previousReference: reference,
      row,
    });
    revalidatePath(ORDERS_PATH);
    if (adopted) {
      return {
        error:
          "Packlink preparó el envío pero NO pudo cobrarlo. Añade un método de pago guardado en pro.packlink.es (Configuración → Pagos) y vuelve a pulsar Pagar.",
      };
    }
    const message = error instanceof Error ? error.message : "";
    return {
      error: `Packlink rechazó el pago${message ? ` — ${message.slice(0, 180)}` : ""}. Revisa el método de pago en pro.packlink.es.`,
    };
  }

  // El borrador viejo ya no sirve: se elimina de Packlink y del CRM
  try {
    await deletePacklinkShipment(reference);
  } catch (error) {
    console.warn("[packlink] delete old draft", error);
  }
  await convexMutation(api.shipments.deleteShipment, { reference });

  // Fila del envío comprado; el detalle y la etiqueta pueden tardar unos
  // segundos en estar listos.
  let detail: Record<string, unknown> = {};
  let labelUrl: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(attempt === 0 ? 1500 : 3000);
    try {
      detail = await getPacklinkShipmentDetail(purchased.reference);
      const labels = await getPacklinkLabels(purchased.reference);
      labelUrl = labels[0] ?? null;
      if (labelUrl) break;
    } catch {
      // aún no disponible; se reintenta y si no, lo trae el cron
    }
  }

  const trackings = detail.trackings;
  await convexMutation(api.shipments.upsertShipment, {
    reference: purchased.reference,
    customReference: basics.name,
    orderId,
    state:
      typeof detail.state === "string"
        ? (detail.state as string).toUpperCase()
        : "PROCESSING",
    carrier: row.carrier,
    service: row.service,
    serviceId: row.serviceId,
    priceBase: row.priceBase,
    priceTotal: purchased.totalPrice ?? row.priceTotal,
    currency: row.currency ?? "EUR",
    collectionDate:
      typeof detail.collection_date === "string"
        ? detail.collection_date.replaceAll("/", "-")
        : (collection?.date ?? null),
    collectionTime:
      typeof detail.collection_time === "string"
        ? detail.collection_time
        : (collection?.time ?? null),
    estimatedDeliveryDate: row.estimatedDeliveryDate,
    homeToHome: row.homeToHome,
    tracking: Array.isArray(trackings)
      ? ((trackings[0] as string | undefined) ?? null)
      : null,
    trackingUrl:
      typeof detail.tracking_url === "string" ? detail.tracking_url : null,
    labelUrl,
    raw: toJson({
      ...detail,
      receipt: purchased.receipt,
      created_by: "crm",
    }),
    syncedAt: Date.now(),
  });

  // Fulfillment en Shopify (tracking + email al cliente) si ya hay tracking;
  // si no, lo hará el cron en cuanto Packlink lo publique.
  try {
    await pushPacklinkFulfillments();
  } catch (error) {
    console.warn("[packlink] fulfillment tras pago", error);
  }

  revalidatePath(ORDERS_PATH);
  return {
    ok: true,
    reference: purchased.reference,
    labelUrl,
    total:
      purchased.totalPrice != null
        ? `${purchased.totalPrice.toFixed(2)} €`
        : null,
  };
}

// ─────────────────────────── etiqueta / eliminar ───────────────────────────

export async function getLabelAction(
  reference: string,
): Promise<{ url?: string; error?: string }> {
  await requireAdmin();

  const row = await convexQuery(api.shipments.shipmentByReference, {
    reference,
  });

  try {
    let url: string | undefined;
    if (row?.provider === "genei") {
      // La etiqueta se sirve por el route handler del admin desde Convex
      // File Storage; si Genei ya la generó, se sube aquí (idempotente)
      const pdf = await getGeneiLabelPdf(reference);
      if (pdf) {
        await storeGeneiLabel(reference, pdf);
        url = geneiLabelRoute(reference);
      }
    } else {
      const labels = await getPacklinkLabels(reference);
      url = labels[0];
    }
    if (!url) return { error: "La etiqueta aún no está disponible." };
    await convexMutation(api.shipments.updateShipment, {
      reference,
      labelUrl: url,
    });
    revalidatePath(ORDERS_PATH);
    return { url };
  } catch (error) {
    console.error("[shipping] labels", error);
    return { error: "La etiqueta aún no está disponible." };
  }
}

// Borra un borrador (p. ej. si el pedido se envió nativo desde Shopify).
// El deleteShipment de Convex también elimina la etiqueta de File Storage.
export async function deletePacklinkDraftAction(
  reference: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();

  const row = await convexQuery(api.shipments.shipmentByReference, {
    reference,
  });

  try {
    if (row?.provider === "genei") await deleteGeneiShipment(reference);
    else await deletePacklinkShipment(reference);
  } catch (error) {
    if (!(error instanceof PacklinkApiError && error.status === 404)) {
      console.error("[shipping] delete draft", error);
      return {
        error: `${row?.provider === "genei" ? "Genei" : "Packlink"} no dejó eliminar el borrador.`,
      };
    }
    // 404 = ya lo borraron en el panel; basta con limpiar el CRM
  }
  await convexMutation(api.shipments.deleteShipment, { reference });
  revalidatePath(ORDERS_PATH);
  return { ok: true };
}

// ─────────────────────────── sync manual ───────────────────────────

// Botón "Actualizar envíos": sync Packlink + Genei + fulfillments sin esperar
// al cron
export async function refreshPacklinkAction(): Promise<{
  ok?: boolean;
  error?: string;
}> {
  await requireAdmin();
  try {
    await syncPacklinkShipments();
    await syncGeneiShipments();
    const { errors } = await pushPacklinkFulfillments();
    revalidatePath(ORDERS_PATH);
    return errors > 0
      ? { error: `Sincronizado con ${errors} error(es) de fulfillment.` }
      : { ok: true };
  } catch (error) {
    console.error("[shipping] refresh", error);
    return { error: "No se pudo sincronizar los envíos." };
  }
}
