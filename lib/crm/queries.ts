import {
  ACTIVITY_DAYS,
  countSegmentAudience,
  VIP_MIN_DEFAULT,
  type SegmentFacets,
} from "@/lib/crm/segments";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/convex/_generated/api";
import { convexQuery, msToIso } from "@/lib/convex/server";

export const CONTACTS_PER_PAGE = 25;

const DAY_MS = 86_400_000;

export async function getDashboardData() {
  const supabase = await createClient();
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY_MS).toISOString();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();

  const [
    subscribed,
    pending,
    new7,
    signups,
    sent,
    opened,
    clicked,
    abandoned,
    recovered,
    orders,
    recentEvents,
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "subscribed"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7),
    supabase
      .from("events")
      .select("created_at")
      .eq("type", "signup")
      .gte("created_at", since30)
      .limit(5000),
    supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .not("sent_at", "is", null),
    supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .not("opened_at", "is", null),
    supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .not("clicked_at", "is", null),
    supabase
      .from("checkouts")
      .select("id", { count: "exact", head: true })
      .eq("status", "abandoned"),
    supabase
      .from("checkouts")
      .select("id", { count: "exact", head: true })
      .in("status", ["recovered", "converted"]),
    supabase
      .from("orders")
      .select("total_price, total_refunded, discount_code")
      .eq("test", false)
      .is("cancelled_at", null)
      .limit(5000),
    supabase
      .from("events")
      .select("id, type, payload, created_at, contacts(email, first_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // Serie de altas por día (30 días, huecos a 0)
  const series: { date: string; altas: number }[] = [];
  const index = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    index.set(date, series.length);
    series.push({ date, altas: 0 });
  }
  for (const row of signups.data ?? []) {
    const i = index.get(row.created_at.slice(0, 10));
    if (i !== undefined) series[i]!.altas += 1;
  }

  const orderRows = orders.data ?? [];
  const net = (o: { total_price: number | null; total_refunded: number }) =>
    (o.total_price ?? 0) - (o.total_refunded ?? 0);
  const revenueTotal = orderRows.reduce((sum, o) => sum + net(o), 0);
  const revenueWithCode = orderRows
    .filter((o) => o.discount_code)
    .reduce((sum, o) => sum + net(o), 0);

  return {
    contacts: {
      subscribed: subscribed.count ?? 0,
      pending: pending.count ?? 0,
      newLast7: new7.count ?? 0,
    },
    email: {
      sent: sent.count ?? 0,
      opened: opened.count ?? 0,
      clicked: clicked.count ?? 0,
    },
    checkouts: {
      abandoned: abandoned.count ?? 0,
      recovered: recovered.count ?? 0,
    },
    revenue: {
      total: revenueTotal,
      withCode: revenueWithCode,
      orders: orderRows.length,
    },
    signupsSeries: series,
    recentEvents: recentEvents.data ?? [],
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
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * CONTACTS_PER_PAGE;

  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + CONTACTS_PER_PAGE - 1);

  if (params.status) query = query.eq("status", params.status);

  // Facetas §16.2 (mismas semánticas que lib/crm/segments.ts, pero sin fijar
  // status: aquí se combinan con el filtro de estado que elija el admin)
  if (params.tipo === "lead") query = query.eq("orders_count", 0);
  if (params.tipo === "cliente") query = query.gte("orders_count", 1);
  if (params.tipo === "repetidor") query = query.gte("orders_count", 2);
  if (params.tipo === "vip") {
    query = query.gte("total_spent", VIP_MIN_DEFAULT);
  }
  const activityIso = new Date(
    Date.now() - ACTIVITY_DAYS * 86_400_000,
  ).toISOString();
  if (params.actividad === "activos") {
    query = query.or(
      `last_open_at.gte.${activityIso},last_click_at.gte.${activityIso}`,
    );
  }
  if (params.actividad === "dormidos") {
    query = query
      .or(`last_open_at.is.null,last_open_at.lt.${activityIso}`)
      .or(`last_click_at.is.null,last_click_at.lt.${activityIso}`);
  }
  if (params.fuente) query = query.eq("source", params.fuente);
  if (params.alta_dias && params.alta_dias > 0) {
    query = query.gte(
      "created_at",
      new Date(Date.now() - params.alta_dias * 86_400_000).toISOString(),
    );
  }
  if (params.tag) query = query.contains("tags", [params.tag.toLowerCase()]);

  if (params.q) {
    // PostgREST usa comas como separador dentro de or(): sanear
    const q = params.q
      .replaceAll(",", " ")
      .replaceAll("(", " ")
      .replaceAll(")", " ")
      .trim();
    if (q) query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  const contacts = data ?? [];

  // Teléfonos de la página (viven en la ficha de cliente de Shopify, no en
  // contacts): un lookup por los contactos vinculados, mapeado por contact.id.
  const phones = new Map<string, string>();
  const linked = contacts.filter((c) => c.shopify_customer_id);
  if (linked.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, phone")
      .in(
        "id",
        linked.map((c) => Number(c.shopify_customer_id)),
      )
      .not("phone", "is", null);
    const byCustomer = new Map(
      (customers ?? []).map((c) => [String(c.id), c.phone!]),
    );
    for (const contact of linked) {
      const phone = byCustomer.get(contact.shopify_customer_id!);
      if (phone) phones.set(contact.id, phone);
    }
  }

  return {
    contacts,
    phones,
    total: count ?? 0,
    page,
    perPage: CONTACTS_PER_PAGE,
  };
}

export async function getContactDetail(id: string) {
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!contact) return null;

  const [events, codes, orders, sends, customer] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("discount_codes")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_sends")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    // Teléfono: vive en la ficha de cliente sincronizada de Shopify (lo dan
    // al comprar), no en contacts.
    contact.shopify_customer_id
      ? supabase
          .from("customers")
          .select("phone")
          .eq("id", Number(contact.shopify_customer_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    contact,
    events: events.data ?? [],
    codes: codes.data ?? [],
    orders: orders.data ?? [],
    sends: sends.data ?? [],
    phone: customer.data?.phone ?? null,
  };
}

export async function listCampaigns() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCampaign(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// Recuento de la audiencia de un segmento (facetas §16.2; {} = todos los
// suscritos). Se usa en la ficha de campaña y en el editor de secuencias.
export async function getCampaignAudienceCount(facets: SegmentFacets = {}) {
  const supabase = await createClient();
  return countSegmentAudience(supabase, facets);
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
  const supabase = await createClient();
  const [recipients, opened, clicked] = await Promise.all([
    supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", campaignId)
      .limit(10000),
    supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .not("opened_at", "is", null),
    supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .not("clicked_at", "is", null),
  ]);

  const rows = recipients.data ?? [];
  const by = (status: string) => rows.filter((r) => r.status === status).length;
  return {
    total: rows.length,
    sent: by("sent"),
    inFlight: by("pending") + by("sending"),
    skipped: by("skipped"),
    failed: by("failed"),
    opened: opened.count ?? 0,
    clicked: clicked.count ?? 0,
  };
}

export async function listAutomations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automations")
    .select("*, automation_steps(*)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((automation) => ({
    ...automation,
    automation_steps: [...automation.automation_steps].sort(
      (a, b) => a.position - b.position,
    ),
  }));
}

export type StepStats = { sent: number; opened: number; clicked: number };

export async function getAutomationDetail(id: string) {
  const supabase = await createClient();
  const { data: automation } = await supabase
    .from("automations")
    .select("*, automation_steps(*)")
    .eq("id", id)
    .maybeSingle();
  if (!automation) return null;

  const [sends, enrollments] = await Promise.all([
    supabase
      .from("email_sends")
      .select("automation_step_id, opened_at, clicked_at")
      .eq("automation_id", id)
      .limit(10000),
    supabase
      .from("automation_enrollments")
      .select("status")
      .eq("automation_id", id)
      .limit(10000),
  ]);

  const statsByStep = new Map<string, StepStats>();
  for (const send of sends.data ?? []) {
    if (!send.automation_step_id) continue;
    const entry = statsByStep.get(send.automation_step_id) ?? {
      sent: 0,
      opened: 0,
      clicked: 0,
    };
    entry.sent += 1;
    if (send.opened_at) entry.opened += 1;
    if (send.clicked_at) entry.clicked += 1;
    statsByStep.set(send.automation_step_id, entry);
  }

  const enrollmentCounts = { active: 0, completed: 0, canceled: 0 };
  for (const enrollment of enrollments.data ?? []) {
    if (enrollment.status === "active") enrollmentCounts.active += 1;
    else if (enrollment.status === "completed") enrollmentCounts.completed += 1;
    else if (enrollment.status === "canceled") enrollmentCounts.canceled += 1;
  }

  return {
    automation,
    steps: [...automation.automation_steps].sort(
      (a, b) => a.position - b.position,
    ),
    statsByStep,
    enrollmentCounts,
  };
}

export async function listPromotions() {
  const supabase = await createClient();
  const { data: promotions, error } = await supabase
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Atribución por código (orders llega con los webhooks de Fase 2).
  const stats = new Map<string, { revenue: number; orders: number }>();
  const codes = (promotions ?? []).map((p) => p.code);
  if (codes.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("discount_code, total_price")
      .in("discount_code", codes)
      .limit(5000);
    for (const order of orders ?? []) {
      if (!order.discount_code) continue;
      const entry = stats.get(order.discount_code) ?? { revenue: 0, orders: 0 };
      entry.revenue += order.total_price ?? 0;
      entry.orders += 1;
      stats.set(order.discount_code, entry);
    }
  }

  return (promotions ?? []).map((promotion) => ({
    ...promotion,
    stats: stats.get(promotion.code) ?? { revenue: 0, orders: 0 },
  }));
}

export async function listSuppressions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppressions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
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
// los filtros.
export async function getCartsData(params: { estado?: string; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * CARTS_PER_PAGE;
  const estado = (CART_STATUSES as readonly string[]).includes(
    params.estado ?? "",
  )
    ? params.estado
    : undefined;

  // OJO: el select va en UNA línea — PostgREST rechaza saltos de línea (PGRST100)
  let listQuery = supabase
    .from("checkouts")
    .select(
      "id, origin, status, email, contact_id, line_items, total_price, currency, created_at, abandoned_at, last_event_at, recovery_sent_at, recovery_url, buyer_accepts_marketing, contacts(first_name), automation_enrollments(step, status, next_run_at), email_sends(id, subject, status, sent_at, opened_at, clicked_at)",
      { count: "exact" },
    )
    .order("last_event_at", { ascending: false })
    .range(from, from + CARTS_PER_PAGE - 1);
  if (estado) listQuery = listQuery.eq("status", estado);

  const countByStatus = (status: string) =>
    supabase
      .from("checkouts")
      .select("id", { count: "exact", head: true })
      .eq("status", status);

  const [list, abandoned, reached, recoveredRows, converted, contacted] =
    await Promise.all([
      listQuery,
      countByStatus("abandoned"),
      countByStatus("reached_checkout"),
      supabase
        .from("checkouts")
        .select("total_price")
        .eq("status", "recovered"),
      countByStatus("converted"),
      supabase
        .from("checkouts")
        .select("id", { count: "exact", head: true })
        .not("recovery_sent_at", "is", null),
    ]);
  if (list.error) throw list.error;

  const recoveredCount = (recoveredRows.data ?? []).length;
  const recoveredRevenue = (recoveredRows.data ?? []).reduce(
    (sum, row) => sum + (row.total_price ?? 0),
    0,
  );

  return {
    carts: list.data ?? [],
    total: list.count ?? 0,
    page,
    perPage: CARTS_PER_PAGE,
    kpis: {
      abandoned: abandoned.count ?? 0,
      reachedCheckout: reached.count ?? 0,
      recovered: recoveredCount,
      recoveredRevenue,
      converted: converted.count ?? 0,
      contacted: contacted.count ?? 0,
    },
  };
}
