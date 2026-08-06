import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// CRM núcleo: contactos, eventos, supresiones y el dashboard del admin.
// Primitivas de acceso a datos para lib/crm/queries.ts, lib/crm/segments.ts,
// lib/crm/actions.ts y las rutas públicas /api/subscribe y /api/unsubscribe.
// La lógica de negocio (facetas de segmentación, series, validaciones de
// formulario) vive en lib/. Tablas pequeñas (decenas de contactos, cientos de
// eventos): take() + filtro/orden en JS es suficiente. Las queries no leen el
// reloj: `now` llega como argumento desde la lib.
//
// Unicidad legacy preservada en las mutations (check-before-write dentro de
// la transacción): contacts.email es único (índice by_email).

const FETCH_LIMIT = 1000;

const DAY_MS = 86_400_000;

type ContactDoc = Doc<"contacts">;

// Forma camelCase completa que las libs adaptan a snake_case/ISO/null
function contactOut(doc: ContactDoc) {
  return {
    id: doc._id as string,
    email: doc.email,
    firstName: doc.firstName ?? null,
    status: doc.status,
    source: doc.source ?? null,
    consent: doc.consent,
    consentText: doc.consentText ?? null,
    consentAt: doc.consentAt ?? null,
    consentIp: doc.consentIp ?? null,
    shopifyCustomerId: doc.shopifyCustomerId ?? null,
    ordersCount: doc.ordersCount,
    totalSpent: doc.totalSpent,
    lastOrderAt: doc.lastOrderAt ?? null,
    lastOpenAt: doc.lastOpenAt ?? null,
    lastClickAt: doc.lastClickAt ?? null,
    tags: doc.tags,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function contactByEmail(ctx: QueryCtx, email: string) {
  return await ctx.db
    .query("contacts")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

async function suppressionByEmail(ctx: QueryCtx, email: string) {
  return await ctx.db
    .query("suppressions")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

// Teléfono: vive en la ficha de cliente sincronizada de Shopify (customers),
// no en contacts
async function phoneForContact(ctx: QueryCtx, contact: ContactDoc) {
  if (!contact.shopifyCustomerId) return null;
  const customerId = Number(contact.shopifyCustomerId);
  if (!Number.isFinite(customerId)) return null;
  const customer = await ctx.db
    .query("customers")
    .withIndex("by_customer_id", (q) => q.eq("customerId", customerId))
    .first();
  return customer?.phone ?? null;
}

async function insertEvent(
  ctx: MutationCtx,
  contactId: Id<"contacts"> | undefined,
  type: string,
  payload: unknown,
) {
  await ctx.db.insert("events", {
    contactId,
    type,
    payload,
    createdAt: Date.now(),
  });
}

// Upsert de una supresión (PK legacy = email): actualiza el motivo si ya está
async function upsertSuppression(
  ctx: MutationCtx,
  email: string,
  reason: "unsubscribe" | "hard_bounce" | "complaint" | "manual",
) {
  const existing = await suppressionByEmail(ctx, email);
  if (existing) {
    await ctx.db.patch("suppressions", existing._id, { reason });
  } else {
    await ctx.db.insert("suppressions", {
      email,
      reason,
      createdAt: Date.now(),
    });
  }
}

// ─────────────────────────── lecturas ───────────────────────────

// Todo lo que agrega el dashboard (/admin): counts + filas mínimas; la serie
// de altas y los ingresos los calcula lib/crm/queries.ts
export const dashboard = query({
  args: { serverKey: v.string(), now: v.number() },
  handler: async (ctx, { serverKey, now }) => {
    assertServerKey(serverKey);
    const since7 = now - 7 * DAY_MS;
    const since30 = now - 30 * DAY_MS;

    const subscribed = await ctx.db
      .query("contacts")
      .withIndex("by_status", (q) => q.eq("status", "subscribed"))
      .take(FETCH_LIMIT);
    const pending = await ctx.db
      .query("contacts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(FETCH_LIMIT);
    const new7 = await ctx.db
      .query("contacts")
      .withIndex("by_created_at", (q) => q.gte("createdAt", since7))
      .take(FETCH_LIMIT);

    const signups = await ctx.db
      .query("events")
      .withIndex("by_type_and_created_at", (q) =>
        q.eq("type", "signup").gte("createdAt", since30),
      )
      .take(5000);

    const sends = await ctx.db.query("email_sends").take(5000);

    const abandoned = await ctx.db
      .query("checkouts")
      .withIndex("by_status_and_abandoned_at", (q) =>
        q.eq("status", "abandoned"),
      )
      .take(FETCH_LIMIT);
    const recovered = await ctx.db
      .query("checkouts")
      .withIndex("by_status_and_abandoned_at", (q) =>
        q.eq("status", "recovered"),
      )
      .take(FETCH_LIMIT);
    const converted = await ctx.db
      .query("checkouts")
      .withIndex("by_status_and_abandoned_at", (q) =>
        q.eq("status", "converted"),
      )
      .take(FETCH_LIMIT);

    const orderRows = await ctx.db
      .query("orders")
      .withIndex("by_created_at")
      .filter((q) =>
        q.and(
          q.eq(q.field("test"), false),
          q.eq(q.field("cancelledAt"), undefined),
        ),
      )
      .take(5000);

    // Últimos 8 eventos del timeline global, con su contacto embebido.
    // createdAt (fecha legacy) ≠ _creationTime (fecha del import): orden en JS.
    const allEvents = await ctx.db.query("events").take(5000);
    const recent = [...allEvents]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8);
    const recentEvents = [];
    for (const event of recent) {
      const contact = event.contactId
        ? await ctx.db.get("contacts", event.contactId)
        : null;
      recentEvents.push({
        id: event._id as string,
        type: event.type,
        payload: event.payload ?? null,
        createdAt: event.createdAt,
        contact: contact
          ? { email: contact.email, firstName: contact.firstName ?? null }
          : null,
      });
    }

    return {
      contacts: {
        subscribed: subscribed.length,
        pending: pending.length,
        newLast7: new7.length,
      },
      signupCreatedAts: signups.map((e) => e.createdAt),
      email: {
        sent: sends.filter((s) => s.sentAt !== undefined).length,
        opened: sends.filter((s) => s.openedAt !== undefined).length,
        clicked: sends.filter((s) => s.clickedAt !== undefined).length,
      },
      checkouts: {
        abandoned: abandoned.length,
        recovered: recovered.length + converted.length,
      },
      orders: orderRows.map((o) => ({
        totalPrice: o.totalPrice ?? null,
        totalRefunded: o.totalRefunded,
        discountCode: o.discountCode ?? null,
      })),
      recentEvents,
    };
  },
});

// Todos los contactos con su teléfono (ficha de Shopify), más recientes
// primero. La lib aplica facetas/búsqueda/paginación en memoria.
export const list = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_created_at")
      .order("desc")
      .take(FETCH_LIMIT);
    const out = [];
    for (const doc of rows) {
      out.push({ ...contactOut(doc), phone: await phoneForContact(ctx, doc) });
    }
    return out;
  },
});

// Ficha completa de un contacto: timeline, códigos, pedidos, emails y teléfono
export const detail = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const contactId = ctx.db.normalizeId("contacts", id);
    if (!contactId) return null;
    const contact = await ctx.db.get("contacts", contactId);
    if (!contact) return null;

    const events = await ctx.db
      .query("events")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .order("desc")
      .take(100);

    const codes = await ctx.db
      .query("discount_codes")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .order("desc")
      .take(FETCH_LIMIT);

    const orderDocs = await ctx.db
      .query("orders")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .take(FETCH_LIMIT);
    const orders = [...orderDocs].sort((a, b) => b.createdAt - a.createdAt);

    const sends = await ctx.db
      .query("email_sends")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .order("desc")
      .take(50);

    return {
      contact: contactOut(contact),
      phone: await phoneForContact(ctx, contact),
      events: events.map((e) => ({
        id: e._id as string,
        contactId: (e.contactId as string | undefined) ?? null,
        type: e.type,
        payload: e.payload ?? null,
        createdAt: e.createdAt,
      })),
      codes: codes.map((c) => ({
        id: c._id as string,
        code: c.code,
        percentage: c.percentage,
        redeemed: c.redeemed,
        expiresAt: c.expiresAt ?? null,
        shopifyDiscountId: c.shopifyDiscountId ?? null,
        createdAt: c.createdAt,
      })),
      orders: orders.map((o) => ({
        orderId: o.orderId,
        createdAt: o.createdAt,
        totalPrice: o.totalPrice ?? null,
        totalRefunded: o.totalRefunded,
        currency: o.currency ?? null,
        discountCode: o.discountCode ?? null,
        utmSource: o.utmSource ?? null,
        utmMedium: o.utmMedium ?? null,
        utmCampaign: o.utmCampaign ?? null,
        landingPage: o.landingPage ?? null,
        referrer: o.referrer ?? null,
        firstUtmSource: o.firstUtmSource ?? null,
        firstUtmMedium: o.firstUtmMedium ?? null,
        firstUtmCampaign: o.firstUtmCampaign ?? null,
        firstLandingPage: o.firstLandingPage ?? null,
        firstReferrer: o.firstReferrer ?? null,
        gclid: o.gclid ?? null,
        fbclid: o.fbclid ?? null,
      })),
      sends: sends.map((s) => ({
        id: s._id as string,
        template: s.template ?? null,
        subject: s.subject ?? null,
        status: s.status,
        sentAt: s.sentAt ?? null,
        openedAt: s.openedAt ?? null,
        clickedAt: s.clickedAt ?? null,
        createdAt: s.createdAt,
      })),
    };
  },
});

// Contacto por email (createCampaignFromCustomerEmail, checks públicos)
export const byEmail = query({
  args: { serverKey: v.string(), email: v.string() },
  handler: async (ctx, { serverKey, email }) => {
    assertServerKey(serverKey);
    const contact = await contactByEmail(ctx, email);
    if (!contact) return null;
    return { id: contact._id as string, status: contact.status };
  },
});

// Emails de una selección manual (nombre de la campaña bulk)
export const emailsForIds = query({
  args: { serverKey: v.string(), ids: v.array(v.string()) },
  handler: async (ctx, { serverKey, ids }) => {
    assertServerKey(serverKey);
    const emails: string[] = [];
    for (const id of ids) {
      const contactId = ctx.db.normalizeId("contacts", id);
      if (!contactId) continue;
      const contact = await ctx.db.get("contacts", contactId);
      if (contact) emails.push(contact.email);
    }
    return emails;
  },
});

// Contactos que compraron con un código (faceta `codigo` de segmentos)
export const contactIdsByDiscountCode = query({
  args: { serverKey: v.string(), code: v.string() },
  handler: async (ctx, { serverKey, code }) => {
    assertServerKey(serverKey);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_discount_code", (q) => q.eq("discountCode", code))
      .take(FETCH_LIMIT);
    return [
      ...new Set(
        orders
          .map((o) => o.contactId as string | undefined)
          .filter((id): id is string => id !== undefined),
      ),
    ];
  },
});

export const listSuppressions = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("suppressions").take(500);
    return [...rows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({ email: s.email, reason: s.reason, createdAt: s.createdAt }));
  },
});

// ─────────────────────────── escrituras ───────────────────────────

// Alta manual desde el CRM (suscrito directo con consentimiento del admin)
export const create = mutation({
  args: {
    serverKey: v.string(),
    email: v.string(), // ya en lowercase (lo garantiza la action)
    firstName: v.union(v.string(), v.null()),
    source: v.string(),
    consentText: v.string(),
  },
  handler: async (ctx, { serverKey, email, firstName, source, consentText }) => {
    assertServerKey(serverKey);
    if (await suppressionByEmail(ctx, email)) {
      return { status: "suppressed" as const };
    }
    if (await contactByEmail(ctx, email)) {
      return { status: "exists" as const };
    }
    const now = Date.now();
    const id = await ctx.db.insert("contacts", {
      email,
      firstName: firstName ?? undefined,
      status: "subscribed",
      source,
      consent: true,
      consentText,
      consentAt: now,
      ordersCount: 0,
      totalSpent: 0,
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    await insertEvent(ctx, id, "signup", { source });
    return { status: "created" as const, id: id as string };
  },
});

// Edición de email/nombre desde la ficha (evento contact_updated si cambia)
export const update = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    email: v.string(),
    firstName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { serverKey, id, email, firstName }) => {
    assertServerKey(serverKey);
    const contactId = ctx.db.normalizeId("contacts", id);
    const current = contactId ? await ctx.db.get("contacts", contactId) : null;
    if (!contactId || !current) return { status: "not_found" as const };

    const other = await contactByEmail(ctx, email);
    if (other && other._id !== contactId) {
      return { status: "duplicate" as const };
    }

    await ctx.db.patch("contacts", contactId, {
      email,
      firstName: firstName ?? undefined,
      updatedAt: Date.now(),
    });

    const currentFirstName = current.firstName ?? null;
    if (email !== current.email || firstName !== currentFirstName) {
      await insertEvent(ctx, contactId, "contact_updated", {
        from: { email: current.email, first_name: currentFirstName },
        to: { email, first_name: firstName },
        by: "admin",
      });
    }
    return { status: "ok" as const };
  },
});

// Borrado con histórico desvinculado (pedidos, checkouts, códigos y emails
// sobreviven sin contacto, como los FK sin cascade del legacy); events,
// inscripciones y campaign_recipients caen con él. La supresión, si existe,
// se conserva: borrar el contacto no rehabilita envíos a ese email.
export const remove = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const contactId = ctx.db.normalizeId("contacts", id);
    const contact = contactId ? await ctx.db.get("contacts", contactId) : null;
    if (!contactId || !contact) return { status: "not_found" as const };

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .take(FETCH_LIMIT);
    for (const o of orders) {
      await ctx.db.patch("orders", o._id, { contactId: undefined });
    }
    const checkouts = await ctx.db
      .query("checkouts")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .take(FETCH_LIMIT);
    for (const c of checkouts) {
      await ctx.db.patch("checkouts", c._id, { contactId: undefined });
    }
    const codes = await ctx.db
      .query("discount_codes")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .take(FETCH_LIMIT);
    for (const c of codes) {
      await ctx.db.patch("discount_codes", c._id, { contactId: undefined });
    }
    const sends = await ctx.db
      .query("email_sends")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .take(FETCH_LIMIT);
    for (const s of sends) {
      await ctx.db.patch("email_sends", s._id, { contactId: undefined });
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .take(5000);
    for (const e of events) await ctx.db.delete("events", e._id);

    const enrollments = await ctx.db
      .query("automation_enrollments")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .take(FETCH_LIMIT);
    for (const e of enrollments) {
      await ctx.db.delete("automation_enrollments", e._id);
    }

    // campaign_recipients no tiene índice por contacto: tabla pequeña, scan
    const recipients = await ctx.db.query("campaign_recipients").take(5000);
    for (const r of recipients) {
      if (r.contactId === contactId) {
        await ctx.db.delete("campaign_recipients", r._id);
      }
    }

    await ctx.db.delete("contacts", contactId);
    return { status: "ok" as const };
  },
});

// Alta/baja manual desde el admin, con supresión espejo y evento
export const setStatus = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    status: v.union(v.literal("subscribed"), v.literal("unsubscribed")),
  },
  handler: async (ctx, { serverKey, id, status }) => {
    assertServerKey(serverKey);
    const contactId = ctx.db.normalizeId("contacts", id);
    const contact = contactId ? await ctx.db.get("contacts", contactId) : null;
    if (!contactId || !contact || contact.status === status) return null;

    await ctx.db.patch("contacts", contactId, {
      status,
      updatedAt: Date.now(),
    });

    if (status === "unsubscribed") {
      await upsertSuppression(ctx, contact.email, "manual");
    } else {
      const suppression = await suppressionByEmail(ctx, contact.email);
      if (suppression) await ctx.db.delete("suppressions", suppression._id);
    }

    await insertEvent(ctx, contactId, "status_changed", {
      from: contact.status,
      to: status,
      by: "admin",
    });
    return null;
  },
});

// Tags manuales (§16.2), ya normalizados por la action
export const setTags = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, { serverKey, id, tags }) => {
    assertServerKey(serverKey);
    const contactId = ctx.db.normalizeId("contacts", id);
    const contact = contactId ? await ctx.db.get("contacts", contactId) : null;
    if (!contactId || !contact) return { status: "not_found" as const };
    await ctx.db.patch("contacts", contactId, { tags, updatedAt: Date.now() });
    return { status: "ok" as const };
  },
});

// Alta pública desde la barra de captación (/api/subscribe): rate limit por
// IP + supresión + upsert idempotente del contacto, todo en una transacción
export const subscribe = mutation({
  args: {
    serverKey: v.string(),
    email: v.string(), // ya en lowercase (lo garantiza la ruta)
    firstName: v.union(v.string(), v.null()),
    ip: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { serverKey, email, firstName, ip }) => {
    assertServerKey(serverKey);
    const now = Date.now();

    // Rate limit blando: máx. 5 altas/hora por IP (solo cuentan altas nuevas,
    // igual que el count por created_at del legacy)
    if (ip) {
      const lastHour = await ctx.db
        .query("contacts")
        .withIndex("by_created_at", (q) => q.gte("createdAt", now - 3_600_000))
        .take(FETCH_LIMIT);
      if (lastHour.filter((c) => c.consentIp === ip).length >= 5) {
        return { status: "rate_limited" as const };
      }
    }

    // Suprimidos: la ruta responde éxito silencioso
    if (await suppressionByEmail(ctx, email)) {
      return { status: "suppressed" as const };
    }

    const existing = await contactByEmail(ctx, email);
    if (existing) {
      const isNewSignup = existing.status !== "subscribed";
      if (isNewSignup) {
        await ctx.db.patch("contacts", existing._id, {
          status: "subscribed",
          consent: true,
          consentAt: now,
          consentIp: ip ?? undefined,
          updatedAt: now,
        });
        await insertEvent(ctx, existing._id, "signup", {
          source: "sticky_bar",
          resubscribe: true,
        });
      }
      return {
        status: "ok" as const,
        contactId: existing._id as string,
        isNewSignup,
      };
    }

    const id = await ctx.db.insert("contacts", {
      email,
      firstName: firstName ?? undefined,
      status: "subscribed",
      source: "sticky_bar",
      consent: true,
      consentAt: now,
      consentIp: ip ?? undefined,
      ordersCount: 0,
      totalSpent: 0,
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    await insertEvent(ctx, id, "signup", { source: "sticky_bar" });
    return { status: "ok" as const, contactId: id as string, isNewSignup: true };
  },
});

// Baja en 1 clic (/api/unsubscribe): supresión + estado del contacto + evento
export const unsubscribeByEmail = mutation({
  args: { serverKey: v.string(), email: v.string() },
  handler: async (ctx, { serverKey, email }) => {
    assertServerKey(serverKey);
    await upsertSuppression(ctx, email, "unsubscribe");
    const contact = await contactByEmail(ctx, email);
    if (contact && contact.status !== "unsubscribed") {
      await ctx.db.patch("contacts", contact._id, {
        status: "unsubscribed",
        updatedAt: Date.now(),
      });
      await insertEvent(ctx, contact._id, "unsubscribed", { via: "link" });
    }
    return null;
  },
});

// Supresión manual desde /admin/suppressions (refleja la baja en el contacto)
export const addSuppression = mutation({
  args: { serverKey: v.string(), email: v.string() },
  handler: async (ctx, { serverKey, email }) => {
    assertServerKey(serverKey);
    await upsertSuppression(ctx, email, "manual");
    const contact = await contactByEmail(ctx, email);
    if (contact && contact.status !== "unsubscribed") {
      await ctx.db.patch("contacts", contact._id, {
        status: "unsubscribed",
        updatedAt: Date.now(),
      });
      await insertEvent(ctx, contact._id, "suppression_added", {
        reason: "manual",
        by: "admin",
      });
    }
    return null;
  },
});

// ─────────────────── códigos de descuento (motor CRM) ───────────────────

// Último código personal vigente del contacto (no canjeado y con margen de
// caducidad) — lo reusa resolveRecoveryDiscount para no acumular códigos
export const latestDiscountCodeForContact = query({
  args: { serverKey: v.string(), contactId: v.string(), minExpiresAt: v.number() },
  handler: async (ctx, { serverKey, contactId, minExpiresAt }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("contacts", contactId);
    if (!id) return null;
    const codes = await ctx.db
      .query("discount_codes")
      .withIndex("by_contact_and_created_at", (q) => q.eq("contactId", id))
      .order("desc")
      .take(50);
    const valid = codes.find(
      (c) =>
        !c.redeemed && c.expiresAt !== undefined && c.expiresAt > minExpiresAt,
    );
    return valid?.code ?? null;
  },
});

// Registra un código personal recién creado en Shopify (recuperación de carrito)
export const insertDiscountCode = mutation({
  args: {
    serverKey: v.string(),
    code: v.string(),
    contactId: v.string(),
    percentage: v.number(),
    expiresAt: v.number(),
    shopifyDiscountId: v.union(v.string(), v.null()),
  },
  handler: async (
    ctx,
    { serverKey, code, contactId, percentage, expiresAt, shopifyDiscountId },
  ) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("contacts", contactId);
    if (!id) return null;
    await ctx.db.insert("discount_codes", {
      code,
      contactId: id,
      percentage,
      expiresAt,
      shopifyDiscountId: shopifyDiscountId ?? undefined,
      redeemed: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

// assign_discount_code legacy: asigna transaccionalmente el primer código
// libre del pool (contactId ausente, el más antiguo) a un contacto. La
// serialización de la mutation sustituye al FOR UPDATE SKIP LOCKED: dos altas
// simultáneas nunca reciben el mismo código.
export const assignDiscountCode = mutation({
  args: { serverKey: v.string(), contactId: v.string() },
  handler: async (ctx, { serverKey, contactId }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("contacts", contactId);
    if (!id) return null;
    const free = await ctx.db
      .query("discount_codes")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", undefined),
      )
      .first();
    if (!free) return null;
    await ctx.db.patch("discount_codes", free._id, { contactId: id });
    return { code: free.code, expiresAt: free.expiresAt ?? null };
  },
});

export const removeSuppression = mutation({
  args: { serverKey: v.string(), email: v.string() },
  handler: async (ctx, { serverKey, email }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(10);
    for (const row of rows) await ctx.db.delete("suppressions", row._id);
    return null;
  },
});
