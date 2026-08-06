import { v } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Envíos Packlink PRO / Genei (tabla packlink_shipments, PK legacy `reference`).
// Primitivas de acceso a datos para lib/crm/packlink-sync.ts y
// lib/crm/packlink-actions.ts: las llamadas a las APIs de Packlink/Genei/
// Shopify, el comparador de precios y las fases viven en lib/. Tabla pequeña
// (decenas de filas): take() + filtro en JS es suficiente.
//
// Convención de escritura (regla del proyecto): en los campos opcionales de
// upsert/update, la clave AUSENTE no toca el campo y `null` lo borra (igual
// que el update de Supabase, donde undefined se ignoraba y null ponía NULL).
// La etiqueta PDF de Genei vive en File Storage (labelStorageId), nunca en raw.

const FETCH_LIMIT = 1000;

type ShipmentDoc = WithoutSystemFields<Doc<"packlink_shipments">>;
type ShipmentPatch = Partial<ShipmentDoc>;

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableBoolean = v.union(v.boolean(), v.null());

// Campos editables por lib/: ausente = conservar, null = borrar
const patchableArgs = {
  customReference: v.optional(nullableString),
  orderId: v.optional(nullableNumber), // id de Shopify (orders.orderId)
  state: v.optional(nullableString),
  carrier: v.optional(nullableString),
  service: v.optional(nullableString),
  serviceId: v.optional(nullableString),
  priceBase: v.optional(nullableNumber),
  priceTotal: v.optional(nullableNumber),
  cost: v.optional(nullableNumber),
  currency: v.optional(nullableString),
  collectionDate: v.optional(nullableString), // YYYY-MM-DD
  collectionTime: v.optional(nullableString),
  estimatedDeliveryDate: v.optional(nullableString), // YYYY-MM-DD
  homeToHome: v.optional(nullableBoolean),
  tracking: v.optional(nullableString),
  trackingUrl: v.optional(nullableString),
  labelUrl: v.optional(nullableString),
  shipmentDate: v.optional(nullableNumber), // ms epoch
  raw: v.optional(v.any()),
  syncedAt: v.optional(v.number()), // ms epoch; lo pasa la lib al escribir
};

type PatchInput = {
  customReference?: string | null;
  orderId?: number | null;
  state?: string | null;
  carrier?: string | null;
  service?: string | null;
  serviceId?: string | null;
  priceBase?: number | null;
  priceTotal?: number | null;
  cost?: number | null;
  currency?: string | null;
  collectionDate?: string | null;
  collectionTime?: string | null;
  estimatedDeliveryDate?: string | null;
  homeToHome?: boolean | null;
  tracking?: string | null;
  trackingUrl?: string | null;
  labelUrl?: string | null;
  shipmentDate?: number | null;
  raw?: unknown;
  syncedAt?: number;
};

// null → clave presente con undefined (ctx.db.patch borra el campo);
// undefined → clave ausente (el campo no se toca)
function toPatch(input: PatchInput): ShipmentPatch {
  const patch: ShipmentPatch = {};
  const set = <K extends keyof ShipmentPatch>(
    key: K,
    value: ShipmentPatch[K] | null | undefined,
  ) => {
    if (value !== undefined) patch[key] = value ?? undefined;
  };
  set("customReference", input.customReference);
  set("orderId", input.orderId);
  set("state", input.state);
  set("carrier", input.carrier);
  set("service", input.service);
  set("serviceId", input.serviceId);
  set("priceBase", input.priceBase);
  set("priceTotal", input.priceTotal);
  set("cost", input.cost);
  set("currency", input.currency);
  set("collectionDate", input.collectionDate);
  set("collectionTime", input.collectionTime);
  set("estimatedDeliveryDate", input.estimatedDeliveryDate);
  set("homeToHome", input.homeToHome);
  set("tracking", input.tracking);
  set("trackingUrl", input.trackingUrl);
  set("labelUrl", input.labelUrl);
  set("shipmentDate", input.shipmentDate);
  if (input.raw !== undefined) patch.raw = input.raw;
  if (input.syncedAt !== undefined) patch.syncedAt = input.syncedAt;
  return patch;
}

async function byReference(ctx: MutationCtx, reference: string) {
  return await ctx.db
    .query("packlink_shipments")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .unique();
}

// ─────────────────────────── lecturas ───────────────────────────

// Envíos vivos de un pedido (bloqueo de duplicados al crear borrador)
export const shipmentsByOrder = query({
  args: { serverKey: v.string(), orderId: v.number() },
  handler: async (ctx, { serverKey, orderId }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("packlink_shipments")
      .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
      .collect();
    return rows.map((s) => ({ reference: s.reference, state: s.state ?? null }));
  },
});

// Fila completa que necesitan las acciones (pagar/cambiar servicio/etiqueta)
export const shipmentByReference = query({
  args: { serverKey: v.string(), reference: v.string() },
  handler: async (ctx, { serverKey, reference }) => {
    assertServerKey(serverKey);
    const s = await ctx.db
      .query("packlink_shipments")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!s) return null;
    return {
      reference: s.reference,
      provider: s.provider,
      state: s.state ?? null,
      serviceId: s.serviceId ?? null,
      collectionDate: s.collectionDate ?? null,
      collectionTime: s.collectionTime ?? null,
      priceBase: s.priceBase ?? null,
      priceTotal: s.priceTotal ?? null,
      currency: s.currency ?? null,
      carrier: s.carrier ?? null,
      service: s.service ?? null,
      homeToHome: s.homeToHome ?? null,
      estimatedDeliveryDate: s.estimatedDeliveryDate ?? null,
      raw: s.raw ?? null,
    };
  },
});

// Referencias/estados de las filas Packlink (borrado de borradores "stale":
// el criterio de qué estados son borrables vive en la lib)
export const packlinkRefs = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("packlink_shipments").take(FETCH_LIMIT);
    return rows
      .filter((s) => s.provider === "packlink")
      .map((s) => ({ reference: s.reference, state: s.state ?? null }));
  },
});

// Filas Genei con lo que necesita el refresco del sync (la lib decide cuáles
// son finales y no se vuelven a consultar)
export const geneiForSync = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("packlink_shipments").take(FETCH_LIMIT);
    return rows
      .filter((s) => s.provider === "genei")
      .map((s) => ({
        reference: s.reference,
        state: s.state ?? null,
        trackingUrl: s.trackingUrl ?? null,
        labelUrl: s.labelUrl ?? null,
        priceBase: s.priceBase ?? null,
        raw: s.raw ?? null,
        hasStoredLabel: s.labelStorageId !== undefined,
      }));
  },
});

// Envíos con tracking aún sin empujar a Shopify (fulfillment_synced_at null)
export const fulfillmentCandidates = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("packlink_shipments").take(FETCH_LIMIT);
    return rows
      .filter(
        (s) =>
          s.fulfillmentSyncedAt === undefined &&
          s.orderId !== undefined &&
          s.tracking !== undefined,
      )
      .slice(0, 100)
      .map((s) => ({
        reference: s.reference,
        orderId: s.orderId!,
        state: s.state ?? null,
        carrier: s.carrier ?? null,
        tracking: s.tracking!,
        trackingUrl: s.trackingUrl ?? null,
      }));
  },
});

// Estado de fulfillment de un pedido (por id de Shopify)
export const orderFulfillmentInfo = query({
  args: { serverKey: v.string(), orderId: v.number() },
  handler: async (ctx, { serverKey, orderId }) => {
    assertServerKey(serverKey);
    const order = await ctx.db
      .query("orders")
      .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return null;
    return {
      orderId: order.orderId,
      fulfillmentStatus: order.fulfillmentStatus ?? null,
      cancelledAt: order.cancelledAt ?? null,
    };
  },
});

// URL firmada de la etiqueta Genei en File Storage (null si aún no se subió)
export const labelUrl = query({
  args: { serverKey: v.string(), reference: v.string() },
  handler: async (ctx, { serverKey, reference }) => {
    assertServerKey(serverKey);
    const doc = await ctx.db
      .query("packlink_shipments")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!doc?.labelStorageId) return null;
    return await ctx.storage.getUrl(doc.labelStorageId);
  },
});

// ─────────────────────────── escrituras ───────────────────────────

// Upsert de una página del listado de Packlink. Igual que el upsert legacy:
// null sobrescribe (borra el campo), salvo homeToHome/collectionDate/
// collectionTime, que se conservan del doc existente si la API no los trae
// (los editan los borradores creados desde el CRM). priceBase/priceTotal no
// van en el sync y se conservan siempre.
export const syncUpsertPacklink = mutation({
  args: {
    serverKey: v.string(),
    rows: v.array(
      v.object({
        reference: v.string(),
        tracking: nullableString,
        trackingUrl: nullableString,
        labelUrl: nullableString,
        customReference: nullableString,
        state: nullableString,
        carrier: nullableString,
        service: nullableString,
        serviceId: nullableString,
        collectionDate: nullableString,
        collectionTime: nullableString,
        estimatedDeliveryDate: nullableString,
        homeToHome: nullableBoolean,
        cost: nullableNumber,
        currency: nullableString,
        shipmentDate: nullableNumber,
        raw: v.any(),
      }),
    ),
  },
  handler: async (ctx, { serverKey, rows }) => {
    assertServerKey(serverKey);
    const now = Date.now();
    for (const row of rows) {
      const existing = await byReference(ctx, row.reference);
      const patch = toPatch(row);
      patch.homeToHome = row.homeToHome ?? existing?.homeToHome ?? undefined;
      patch.collectionDate =
        row.collectionDate ?? existing?.collectionDate ?? undefined;
      patch.collectionTime =
        row.collectionTime ?? existing?.collectionTime ?? undefined;
      patch.raw = row.raw;
      patch.syncedAt = now;
      if (existing) {
        await ctx.db.patch("packlink_shipments", existing._id, patch);
      } else {
        const doc: ShipmentDoc = {
          reference: row.reference,
          provider: "packlink", // el listado de Packlink solo trae sus envíos
          raw: row.raw,
          syncedAt: now,
        };
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) {
            (doc as Record<string, unknown>)[key] = value;
          }
        }
        await ctx.db.insert("packlink_shipments", doc);
      }
    }
    return null;
  },
});

// Upsert por referencia desde las acciones del CRM (crear borrador, adoptar
// envío preparado, registrar la compra). En el insert, provider por defecto
// "packlink" (mismo default que la columna legacy).
export const upsertShipment = mutation({
  args: {
    serverKey: v.string(),
    reference: v.string(),
    provider: v.optional(v.union(v.literal("packlink"), v.literal("genei"))),
    ...patchableArgs,
  },
  handler: async (ctx, { serverKey, reference, provider, ...input }) => {
    assertServerKey(serverKey);
    const existing = await byReference(ctx, reference);
    const patch = toPatch(input);
    if (provider !== undefined) patch.provider = provider;
    if (existing) {
      await ctx.db.patch("packlink_shipments", existing._id, patch);
    } else {
      const doc: ShipmentDoc = {
        reference,
        provider: provider ?? "packlink",
        raw: input.raw ?? {},
        syncedAt: input.syncedAt ?? Date.now(),
      };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          (doc as Record<string, unknown>)[key] = value;
        }
      }
      await ctx.db.insert("packlink_shipments", doc);
    }
    return null;
  },
});

// Update parcial por referencia (no-op si la fila ya no existe, como el
// update legacy). syncedAt solo se toca si la lib lo pasa.
export const updateShipment = mutation({
  args: { serverKey: v.string(), reference: v.string(), ...patchableArgs },
  handler: async (ctx, { serverKey, reference, ...input }) => {
    assertServerKey(serverKey);
    const existing = await byReference(ctx, reference);
    if (!existing) return null;
    await ctx.db.patch("packlink_shipments", existing._id, toPatch(input));
    return null;
  },
});

// Borra el envío y, si tenía etiqueta en File Storage, también el fichero
export const deleteShipment = mutation({
  args: { serverKey: v.string(), reference: v.string() },
  handler: async (ctx, { serverKey, reference }) => {
    assertServerKey(serverKey);
    const existing = await byReference(ctx, reference);
    if (!existing) return null;
    if (existing.labelStorageId) {
      await ctx.storage.delete(existing.labelStorageId);
    }
    await ctx.db.delete("packlink_shipments", existing._id);
    return null;
  },
});

// Enlaza envíos sin pedido: customReference = orders.name (p. ej. "#1011")
export const linkShipmentsToOrders = mutation({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("packlink_shipments").take(FETCH_LIMIT);
    for (const shipment of rows) {
      if (shipment.orderId !== undefined) continue;
      if (shipment.customReference === undefined) continue;
      const order = await ctx.db
        .query("orders")
        .withIndex("by_name", (q) => q.eq("name", shipment.customReference))
        .first();
      if (!order) continue;
      await ctx.db.patch("packlink_shipments", shipment._id, {
        orderId: order.orderId,
      });
    }
    return null;
  },
});

// Pedido marcado como enviado en el CRM (tras crear el fulfillment en Shopify)
export const markOrderFulfilled = mutation({
  args: { serverKey: v.string(), orderId: v.number() },
  handler: async (ctx, { serverKey, orderId }) => {
    assertServerKey(serverKey);
    const order = await ctx.db
      .query("orders")
      .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return null;
    await ctx.db.patch("orders", order._id, {
      fulfillmentStatus: "fulfilled",
    });
    return null;
  },
});

// El envío ya se empujó a Shopify: no volver a crear el fulfillment
export const markFulfillmentSynced = mutation({
  args: { serverKey: v.string(), reference: v.string() },
  handler: async (ctx, { serverKey, reference }) => {
    assertServerKey(serverKey);
    const existing = await byReference(ctx, reference);
    if (!existing) return null;
    await ctx.db.patch("packlink_shipments", existing._id, {
      fulfillmentSyncedAt: Date.now(),
    });
    return null;
  },
});

// ─────────────────────── etiqueta Genei (File Storage) ───────────────────────

// Paso 1 del patrón upload-URL: la lib hace POST del PDF a esta URL
export const generateLabelUploadUrl = mutation({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    return await ctx.storage.generateUploadUrl();
  },
});

// Paso 2: engancha el fichero subido al envío (y borra la etiqueta anterior
// si la hubiera). Si el envío ya no existe, el fichero huérfano se elimina.
export const attachLabel = mutation({
  args: {
    serverKey: v.string(),
    reference: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { serverKey, reference, storageId }) => {
    assertServerKey(serverKey);
    const existing = await byReference(ctx, reference);
    if (!existing) {
      await ctx.storage.delete(storageId);
      throw new Error(`El envío ${reference} no existe`);
    }
    if (existing.labelStorageId && existing.labelStorageId !== storageId) {
      await ctx.storage.delete(existing.labelStorageId);
    }
    await ctx.db.patch("packlink_shipments", existing._id, {
      labelStorageId: storageId,
    });
    return null;
  },
});
