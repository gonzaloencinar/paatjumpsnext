import {
  buildFacetsContext,
  contactMatchesFacets,
  countSegmentAudience,
  type SegmentContactRow,
  type SegmentFacets,
} from "@/lib/crm/segments";
import { api } from "@/convex/_generated/api";
import { convexQuery, msToIso } from "@/lib/convex/server";
import type { FunctionReturnType } from "convex/server";

// Lecturas del panel CRM (/admin): los datos viven en Convex y este módulo
// adapta los docs a la forma legacy (snake_case, ISO, null) que esperan las
// páginas y componentes. Tablas pequeñas: los filtros, la paginación y las
// agregaciones se hacen en memoria sobre el conjunto completo (mismo patrón
// que lib/crm/store-queries.ts).

export const CONTACTS_PER_PAGE = 25;

const DAY_MS = 86_400_000;

// Contacto en la forma legacy Tables<"contacts"> (snake_case, ISO, null)
type ContactRow = FunctionReturnType<typeof api.contacts.list>[number];

function toLegacyContact(c: Omit<ContactRow, "phone">) {
  return {
    id: c.id,
    email: c.email,
    first_name: c.firstName,
    status: c.status as string,
    source: c.source,
    consent: c.consent,
    consent_text: c.consentText,
    consent_at: msToIso(c.consentAt ?? undefined),
    consent_ip: c.consentIp,
    shopify_customer_id: c.shopifyCustomerId,
    orders_count: c.ordersCount,
    total_spent: c.totalSpent,
    last_order_at: msToIso(c.lastOrderAt ?? undefined),
    last_open_at: msToIso(c.lastOpenAt ?? undefined),
    last_click_at: msToIso(c.lastClickAt ?? undefined),
    tags: c.tags,
    created_at: new Date(c.createdAt).toISOString(),
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

export async function getDashboardData() {
  const now = Date.now();
  const data = await convexQuery(api.contacts.dashboard, { now });

  // Serie de altas por día (30 días, huecos a 0)
  const series: { date: string; altas: number }[] = [];
  const index = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    index.set(date, series.length);
    series.push({ date, altas: 0 });
  }
  for (const createdAt of data.signupCreatedAts) {
    const i = index.get(new Date(createdAt).toISOString().slice(0, 10));
    if (i !== undefined) series[i]!.altas += 1;
  }

  const net = (o: { totalPrice: number | null; totalRefunded: number }) =>
    (o.totalPrice ?? 0) - (o.totalRefunded ?? 0);
  const revenueTotal = data.orders.reduce((sum, o) => sum + net(o), 0);
  const revenueWithCode = data.orders
    .filter((o) => o.discountCode)
    .reduce((sum, o) => sum + net(o), 0);

  return {
    contacts: data.contacts,
    email: data.email,
    checkouts: data.checkouts,
    revenue: {
      total: revenueTotal,
      withCode: revenueWithCode,
      orders: data.orders.length,
    },
    signupsSeries: series,
    recentEvents: data.recentEvents.map((event) => ({
      id: event.id,
      type: event.type,
      payload: event.payload,
      created_at: new Date(event.createdAt).toISOString(),
      contacts: event.contact
        ? { email: event.contact.email, first_name: event.contact.firstName }
        : null,
    })),
  };
}

export async function listContacts(params: {
  q?: string;
  status?: string;
  page?: number;
  tipo?: string;
  actividad?: string;
  fuente?: string;
  alta_dias?: number;
  tag?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * CONTACTS_PER_PAGE;

  // Facetas §16.2 (mismas semánticas que lib/crm/segments.ts, pero sin fijar
  // status: aquí se combinan con el filtro de estado que elija el admin)
  const facets: SegmentFacets = {};
  if (
    params.tipo === "lead" ||
    params.tipo === "cliente" ||
    params.tipo === "repetidor" ||
    params.tipo === "vip"
  ) {
    facets.tipo = params.tipo;
  }
  if (params.actividad === "activos" || params.actividad === "dormidos") {
    facets.actividad = params.actividad;
  }
  if (params.fuente) facets.fuente = params.fuente;
  if (params.alta_dias && params.alta_dias > 0) {
    facets.alta_dias = params.alta_dias;
  }
  if (params.tag) facets.tag = params.tag.toLowerCase();

  const [rows, context] = await Promise.all([
    convexQuery(api.contacts.list, {}),
    buildFacetsContext(facets),
  ]);

  let filtered = rows;
  if (params.status) {
    filtered = filtered.filter((c) => c.status === params.status);
  }
  filtered = filtered.filter((c) =>
    contactMatchesFacets(c as SegmentContactRow, context),
  );

  if (params.q) {
    // Herencia del interpolado de .or() de PostgREST (comas y paréntesis
    // eran sintaxis): se sanea igual para que la búsqueda se comporte como antes
    const q = params.q
      .replaceAll(",", " ")
      .replaceAll("(", " ")
      .replaceAll(")", " ")
      .trim()
      .toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          (c.firstName ?? "").toLowerCase().includes(q),
      );
    }
  }

  // api.contacts.list ya llega ordenado por created_at desc
  const pageRows = filtered.slice(from, from + CONTACTS_PER_PAGE);

  // Teléfonos de la página (viven en la ficha de cliente de Shopify, no en
  // contacts), mapeados por contact.id
  const phones = new Map<string, string>();
  for (const row of pageRows) {
    if (row.phone) phones.set(row.id, row.phone);
  }

  return {
    contacts: pageRows.map(toLegacyContact),
    phones,
    total: filtered.length,
    page,
    perPage: CONTACTS_PER_PAGE,
  };
}

export async function getContactDetail(id: string) {
  const detail = await convexQuery(api.contacts.detail, { id });
  if (!detail) return null;

  return {
    contact: toLegacyContact(detail.contact),
    events: detail.events.map((e) => ({
      id: e.id,
      contact_id: e.contactId,
      type: e.type,
      payload: e.payload,
      created_at: new Date(e.createdAt).toISOString(),
    })),
    codes: detail.codes.map((c) => ({
      id: c.id,
      code: c.code,
      percentage: c.percentage,
      redeemed: c.redeemed,
      expires_at: msToIso(c.expiresAt ?? undefined),
      shopify_discount_id: c.shopifyDiscountId,
      created_at: new Date(c.createdAt).toISOString(),
    })),
    orders: detail.orders.map((o) => ({
      id: o.orderId,
      created_at: new Date(o.createdAt).toISOString(),
      total_price: o.totalPrice,
      total_refunded: o.totalRefunded,
      currency: o.currency,
      discount_code: o.discountCode,
      utm_source: o.utmSource,
      utm_medium: o.utmMedium,
      utm_campaign: o.utmCampaign,
      landing_page: o.landingPage,
      referrer: o.referrer,
      first_utm_source: o.firstUtmSource,
      first_utm_medium: o.firstUtmMedium,
      first_utm_campaign: o.firstUtmCampaign,
      first_landing_page: o.firstLandingPage,
      first_referrer: o.firstReferrer,
      gclid: o.gclid,
      fbclid: o.fbclid,
    })),
    sends: detail.sends.map((s) => ({
      id: s.id,
      template: s.template,
      subject: s.subject,
      status: s.status,
      sent_at: msToIso(s.sentAt ?? undefined),
      opened_at: msToIso(s.openedAt ?? undefined),
      clicked_at: msToIso(s.clickedAt ?? undefined),
      created_at: new Date(s.createdAt).toISOString(),
    })),
    phone: detail.phone,
  };
}

// Campaña en la forma legacy Tables<"campaigns">
type CampaignRow = NonNullable<FunctionReturnType<typeof api.campaigns.get>>;

function toLegacyCampaign(c: CampaignRow) {
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    preheader: c.preheader,
    body_html: c.bodyHtml,
    segment: c.segment,
    status: c.status as string,
    scheduled_at: msToIso(c.scheduledAt ?? undefined),
    sent_at: msToIso(c.sentAt ?? undefined),
    paused_at: msToIso(c.pausedAt ?? undefined),
    created_at: new Date(c.createdAt).toISOString(),
  };
}

export async function listCampaigns() {
  const campaigns = await convexQuery(api.campaigns.list, {});
  return campaigns.map(toLegacyCampaign);
}

export async function getCampaign(id: string) {
  const campaign = await convexQuery(api.campaigns.get, { id });
  return campaign ? toLegacyCampaign(campaign) : null;
}

// Recuento de la audiencia de un segmento (facetas §16.2; {} = todos los
// suscritos). Se usa en la ficha de campaña y en el editor de secuencias.
export async function getCampaignAudienceCount(facets: SegmentFacets = {}) {
  return countSegmentAudience(null, facets);
}

export type CampaignSendStats = {
  total: number;
  sent: number;
  inFlight: number; // pending + sending (reclamados)
  skipped: number;
  failed: number;
  opened: number;
  clicked: number;
};

export async function getCampaignSendStats(
  campaignId: string,
): Promise<CampaignSendStats> {
  const stats = await convexQuery(api.campaigns.sendStats, { id: campaignId });
  const by = (status: string) =>
    stats.statuses.filter((s) => s === status).length;
  return {
    total: stats.statuses.length,
    sent: by("sent"),
    inFlight: by("pending") + by("sending"),
    skipped: by("skipped"),
    failed: by("failed"),
    opened: stats.opened,
    clicked: stats.clicked,
  };
}

// Paso en la forma legacy Tables<"automation_steps">
type AutomationRow = FunctionReturnType<typeof api.automations.list>[number];

function toLegacyStep(s: AutomationRow["steps"][number]) {
  return {
    id: s.id,
    automation_id: s.automationId,
    position: s.position,
    delay_minutes: s.delayMinutes,
    subject: s.subject,
    preheader: s.preheader,
    body_html: s.bodyHtml,
    enabled: s.enabled,
    created_at: new Date(s.createdAt).toISOString(),
  };
}

function toLegacyAutomation(a: Omit<AutomationRow, "steps">) {
  return {
    id: a.id,
    key: a.key,
    name: a.name,
    enabled: a.enabled,
    trigger: a.trigger as string,
    config: a.config,
    created_at: new Date(a.createdAt).toISOString(),
  };
}

export async function listAutomations() {
  const automations = await convexQuery(api.automations.list, {});
  return automations.map((automation) => ({
    ...toLegacyAutomation(automation),
    automation_steps: [...automation.steps]
      .sort((a, b) => a.position - b.position)
      .map(toLegacyStep),
  }));
}

export type StepStats = { sent: number; opened: number; clicked: number };

export async function getAutomationDetail(id: string) {
  const detail = await convexQuery(api.automations.detail, { id });
  if (!detail) return null;

  const steps = [...detail.steps]
    .sort((a, b) => a.position - b.position)
    .map(toLegacyStep);

  const statsByStep = new Map<string, StepStats>();
  for (const send of detail.sends) {
    if (!send.automationStepId) continue;
    const entry = statsByStep.get(send.automationStepId) ?? {
      sent: 0,
      opened: 0,
      clicked: 0,
    };
    entry.sent += 1;
    if (send.openedAt) entry.opened += 1;
    if (send.clickedAt) entry.clicked += 1;
    statsByStep.set(send.automationStepId, entry);
  }

  const enrollmentCounts = { active: 0, completed: 0, canceled: 0 };
  for (const status of detail.enrollmentStatuses) {
    if (status === "active") enrollmentCounts.active += 1;
    else if (status === "completed") enrollmentCounts.completed += 1;
    else if (status === "canceled") enrollmentCounts.canceled += 1;
  }

  return {
    automation: {
      ...toLegacyAutomation(detail.automation),
      automation_steps: steps,
    },
    steps,
    statsByStep,
    enrollmentCounts,
  };
}

export async function listPromotions() {
  const promotions = await convexQuery(api.promotions.list, {});

  // Atribución por código (orders llega con los webhooks de Fase 2).
  const stats = new Map<string, { revenue: number; orders: number }>();
  const codes = promotions.map((p) => p.code);
  if (codes.length > 0) {
    const orders = await convexQuery(api.promotions.ordersByDiscountCodes, {
      codes,
    });
    for (const order of orders) {
      const entry = stats.get(order.discountCode) ?? { revenue: 0, orders: 0 };
      entry.revenue += order.totalPrice ?? 0;
      entry.orders += 1;
      stats.set(order.discountCode, entry);
    }
  }

  // Forma legacy (snake_case, ISO, null) que esperan los componentes
  return promotions.map((doc) => ({
    id: doc._id as string,
    type: doc.type,
    name: doc.name,
    code: doc.code,
    percentage: doc.percentage,
    affiliate_name: doc.affiliateName ?? null,
    affiliate_commission_pct: doc.affiliateCommissionPct ?? null,
    starts_at: new Date(doc.startsAt).toISOString(),
    ends_at: msToIso(doc.endsAt),
    active: doc.active,
    announce: doc.announce,
    shopify_discount_id: doc.shopifyDiscountId ?? null,
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
    stats: stats.get(doc.code) ?? { revenue: 0, orders: 0 },
  }));
}

export async function listSuppressions() {
  const suppressions = await convexQuery(api.contacts.listSuppressions, {});
  return suppressions.map((s) => ({
    email: s.email,
    reason: s.reason as string,
    created_at: new Date(s.createdAt).toISOString(),
  }));
}

// ─────────────────────────── Blog ───────────────────────────

export async function listBlogPosts() {
  const posts = await convexQuery(api.blog.listAll, {});
  return posts.map((doc) => ({
    id: doc._id,
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    published_at: msToIso(doc.publishedAt),
    updated_at: new Date(doc.updatedAt).toISOString(),
    created_at: new Date(doc.createdAt).toISOString(),
    seo_title: doc.seoTitle ?? null,
    seo_description: doc.seoDescription ?? null,
  }));
}

export async function getBlogPost(id: string) {
  const doc = await convexQuery(api.blog.get, { id });
  if (!doc) return null;
  return {
    id: doc._id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt ?? null,
    content_md: doc.contentMd,
    cover_image_url: doc.coverImageUrl ?? null,
    seo_title: doc.seoTitle ?? null,
    seo_description: doc.seoDescription ?? null,
    keywords: doc.keywords ?? null,
    status: doc.status,
    author: doc.author,
    published_at: msToIso(doc.publishedAt),
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

export const CARTS_PER_PAGE = 50;

const CART_STATUSES = [
  "abandoned",
  "reached_checkout",
  "recovered",
  "converted",
] as const;

// /admin/carts: carritos (checkouts de Shopify + carritos de la web) con su
// contacto, el estado de la secuencia de recuperación y los emails enviados
// (email_sends.checkout_id). KPIs para la cabecera y counts por estado para
// los filtros. La query devuelve el conjunto completo; filtro, orden,
// paginación y KPIs se hacen aquí en memoria.
export async function getCartsData(params: { estado?: string; page?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * CARTS_PER_PAGE;
  const estado = (CART_STATUSES as readonly string[]).includes(
    params.estado ?? "",
  )
    ? params.estado
    : undefined;

  const rows = await convexQuery(api.carts.listForAdmin, {});

  // KPIs sobre el conjunto completo (independientes del filtro activo)
  const recoveredRows = rows.filter((r) => r.status === "recovered");
  const kpis = {
    abandoned: rows.filter((r) => r.status === "abandoned").length,
    reachedCheckout: rows.filter((r) => r.status === "reached_checkout").length,
    recovered: recoveredRows.length,
    recoveredRevenue: recoveredRows.reduce(
      (sum, row) => sum + (row.totalPrice ?? 0),
      0,
    ),
    converted: rows.filter((r) => r.status === "converted").length,
    contacted: rows.filter((r) => r.recoverySentAt !== null).length,
  };

  const filtered = (estado ? rows.filter((r) => r.status === estado) : rows)
    .slice()
    .sort((a, b) => (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0));

  const carts = filtered.slice(from, from + CARTS_PER_PAGE).map((r) => ({
    id: r.id,
    origin: r.origin as string,
    status: r.status as string,
    email: r.email,
    contact_id: r.contactId,
    line_items: r.lineItems,
    total_price: r.totalPrice,
    currency: r.currency,
    created_at: new Date(r.createdAt).toISOString(),
    abandoned_at: msToIso(r.abandonedAt ?? undefined),
    last_event_at: msToIso(r.lastEventAt ?? undefined),
    recovery_sent_at: msToIso(r.recoverySentAt ?? undefined),
    recovery_url: r.recoveryUrl,
    buyer_accepts_marketing: r.buyerAcceptsMarketing,
    contacts:
      r.contactId !== null ? { first_name: r.contactFirstName } : null,
    automation_enrollments: r.enrollments.map((e) => ({
      step: e.step,
      status: e.status as string,
      next_run_at: msToIso(e.nextRunAt ?? undefined),
    })),
    email_sends: r.sends.map((s) => ({
      id: s.id,
      subject: s.subject,
      status: s.status as string,
      sent_at: msToIso(s.sentAt ?? undefined),
      opened_at: msToIso(s.openedAt ?? undefined),
      clicked_at: msToIso(s.clickedAt ?? undefined),
    })),
  }));

  return {
    carts,
    total: filtered.length,
    page,
    perPage: CARTS_PER_PAGE,
    kpis,
  };
}
