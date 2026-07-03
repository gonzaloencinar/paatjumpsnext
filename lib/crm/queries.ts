import { createClient } from "@/lib/supabase/server";

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
    supabase.from("orders").select("total_price, discount_code").limit(5000),
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
  const revenueTotal = orderRows.reduce(
    (sum, o) => sum + (o.total_price ?? 0),
    0,
  );
  const revenueWithCode = orderRows
    .filter((o) => o.discount_code)
    .reduce((sum, o) => sum + (o.total_price ?? 0), 0);

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
  return {
    contacts: data ?? [],
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

  const [events, codes, orders, sends] = await Promise.all([
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
  ]);

  return {
    contact,
    events: events.data ?? [],
    codes: codes.data ?? [],
    orders: orders.data ?? [],
    sends: sends.data ?? [],
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

// Segmento v1 = suscritos menos supresiones (RPC count_campaign_audience)
export async function getCampaignAudienceCount() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_campaign_audience");
  return data ?? 0;
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
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
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
