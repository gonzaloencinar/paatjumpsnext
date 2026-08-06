import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Promociones (/admin/promotions + lecturas del storefront). Primitivas de
// acceso a datos: la sincronización con Shopify Discounts y la validación del
// formulario viven en lib/crm/promotion-actions.ts. Tabla pequeña: collect()
// + orden en JS es suficiente. Regla: las queries no leen el reloj — `now`
// llega como argumento desde la lib.

const promotionFields = {
  type: v.union(v.literal("general"), v.literal("affiliate")),
  name: v.string(),
  code: v.string(), // siempre uppercase (lo garantiza parseForm en la lib)
  percentage: v.number(),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  affiliateName: v.optional(v.string()),
  affiliateCommissionPct: v.optional(v.number()),
  shopifyDiscountId: v.optional(v.string()),
};

const DUPLICATE_CODE = "Ya existe una promoción con ese código.";
const NOT_FOUND = "La promoción no existe.";

// Última promo general activa y vigente en `now` (equivale al
// `.or("ends_at.is.null,ends_at.gt.now")` + order created_at desc del legacy)
async function latestGeneralActive(
  ctx: QueryCtx,
  now: number,
  announce?: boolean,
) {
  const rows = await ctx.db
    .query("promotions")
    .withIndex("by_type_and_active_and_announce", (q) => {
      const base = q.eq("type", "general").eq("active", true);
      return announce === undefined ? base : base.eq("announce", announce);
    })
    .collect();
  return (
    rows
      .filter(
        (p) => p.startsAt <= now && (p.endsAt === undefined || p.endsAt > now),
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

// ─────────────────────────── lecturas storefront ───────────────────────────

export const activeGeneral = query({
  args: { serverKey: v.string(), now: v.number() },
  handler: async (ctx, { serverKey, now }) => {
    assertServerKey(serverKey);
    const promo = await latestGeneralActive(ctx, now);
    if (!promo) return null;
    return {
      _id: promo._id,
      code: promo.code,
      percentage: promo.percentage,
      endsAt: promo.endsAt ?? null,
    };
  },
});

export const byCode = query({
  args: { serverKey: v.string(), code: v.string() },
  handler: async (ctx, { serverKey, code }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("promotions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .collect();
    const promo = rows.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!promo) return null;
    return { type: promo.type, endsAt: promo.endsAt ?? null };
  },
});

export const announced = query({
  args: { serverKey: v.string(), now: v.number() },
  handler: async (ctx, { serverKey, now }) => {
    assertServerKey(serverKey);
    const promo = await latestGeneralActive(ctx, now, true);
    if (!promo) return null;
    return {
      name: promo.name,
      code: promo.code,
      percentage: promo.percentage,
      endsAt: promo.endsAt ?? null,
    };
  },
});

// ─────────────────────────── lecturas admin ───────────────────────────

export const list = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("promotions").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Pedidos atribuidos a los códigos dados, con solo los campos que agrega la
// lib (ventas/comisiones por promoción en /admin/promotions)
export const ordersByDiscountCodes = query({
  args: { serverKey: v.string(), codes: v.array(v.string()) },
  handler: async (ctx, { serverKey, codes }) => {
    assertServerKey(serverKey);
    const result: { discountCode: string; totalPrice: number | null }[] = [];
    for (const code of codes) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_discount_code", (q) => q.eq("discountCode", code))
        .take(5000);
      for (const order of orders) {
        result.push({
          discountCode: code,
          totalPrice: order.totalPrice ?? null,
        });
      }
    }
    return result;
  },
});

// Estado actual antes de tocar Shopify (la lib decide crear/actualizar/borrar
// el descuento con shopifyDiscountId y validar el tipo antes de anunciar)
export const get = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const promotionId = ctx.db.normalizeId("promotions", id);
    if (!promotionId) return null;
    const promo = await ctx.db.get("promotions", promotionId);
    if (!promo) return null;
    return {
      _id: promo._id,
      type: promo.type,
      shopifyDiscountId: promo.shopifyDiscountId ?? null,
    };
  },
});

// ─────────────────────────── mutaciones ───────────────────────────

export const create = mutation({
  args: { serverKey: v.string(), ...promotionFields },
  handler: async (ctx, { serverKey, ...fields }) => {
    assertServerKey(serverKey);
    const duplicate = await ctx.db
      .query("promotions")
      .withIndex("by_code", (q) => q.eq("code", fields.code))
      .first();
    if (duplicate) return { error: DUPLICATE_CODE };

    const now = Date.now();
    await ctx.db.insert("promotions", {
      ...fields,
      active: true,
      announce: false,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const update = mutation({
  args: { serverKey: v.string(), id: v.string(), ...promotionFields },
  handler: async (ctx, { serverKey, id, ...fields }) => {
    assertServerKey(serverKey);
    const promotionId = ctx.db.normalizeId("promotions", id);
    if (!promotionId) return { error: NOT_FOUND };
    const current = await ctx.db.get("promotions", promotionId);
    if (!current) return { error: NOT_FOUND };

    const duplicate = await ctx.db
      .query("promotions")
      .withIndex("by_code", (q) => q.eq("code", fields.code))
      .first();
    if (duplicate && duplicate._id !== promotionId) {
      return { error: DUPLICATE_CODE };
    }

    // Claves siempre presentes: undefined elimina el campo (= poner a null)
    await ctx.db.patch("promotions", promotionId, {
      type: fields.type,
      name: fields.name,
      code: fields.code,
      percentage: fields.percentage,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
      affiliateName: fields.affiliateName,
      affiliateCommissionPct: fields.affiliateCommissionPct,
      shopifyDiscountId: fields.shopifyDiscountId,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const setActive = mutation({
  args: { serverKey: v.string(), id: v.string(), active: v.boolean() },
  handler: async (ctx, { serverKey, id, active }) => {
    assertServerKey(serverKey);
    const promotionId = ctx.db.normalizeId("promotions", id);
    if (!promotionId) return { error: NOT_FOUND };
    await ctx.db.patch("promotions", promotionId, {
      active,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const setAnnounce = mutation({
  args: { serverKey: v.string(), id: v.string(), announce: v.boolean() },
  handler: async (ctx, { serverKey, id, announce }) => {
    assertServerKey(serverKey);
    const promotionId = ctx.db.normalizeId("promotions", id);
    if (!promotionId) return { error: NOT_FOUND };
    await ctx.db.patch("promotions", promotionId, {
      announce,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const promotionId = ctx.db.normalizeId("promotions", id);
    if (!promotionId) return { error: NOT_FOUND };
    await ctx.db.delete("promotions", promotionId);
    return { ok: true };
  },
});
