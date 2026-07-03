import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

// Sincronización Shopify → Supabase (pedidos y clientes) vía Admin GraphQL.
// Complementa al webhook orders/create: hace el backfill histórico y
// reconcilia lo que el webhook no ve (reembolsos, cancelaciones, cambios de
// estado, clientes). Corre en /api/cron/shopify-sync cada 10 minutos con
// cursor incremental (sync_state) sobre updated_at; los upserts por id de
// Shopify hacen todo idempotente.
//
// Requiere que la custom app tenga los scopes read_orders y read_customers
// además del write_discounts ya usado por las promociones.

const ADMIN_DOMAIN =
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-04";

const MAX_PAGES_PER_RUN = 20; // 20×50 pedidos por tick; el cursor continúa
const CURSOR_OVERLAP_MS = 60_000; // margen ante relojes/actualizaciones en vuelo

type Supabase = ReturnType<typeof createAdminClient>;

// A diferencia del adminFetch de promociones, aquí se toleran errores
// parciales si hay datos (p. ej. un campo protegido puntual) para que un
// pedido raro no pare el backfill entero.
async function syncFetch<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!token) throw new Error("SHOPIFY_ADMIN_API_TOKEN no configurado");

  const res = await fetch(
    `https://${ADMIN_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const json = await res.json();
  if (!res.ok || (json.errors && !json.data)) {
    throw new Error(
      `Shopify Admin API: ${JSON.stringify(json.errors ?? json).slice(0, 400)}`,
    );
  }
  if (json.errors) {
    console.warn(
      "[shopify-sync] errores parciales:",
      JSON.stringify(json.errors).slice(0, 400),
    );
  }
  return json.data as T;
}

// ───────────────────────────── cursores ─────────────────────────────

async function getCursor(supabase: Supabase, key: string) {
  const { data } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (
    (data?.value as { updated_since?: string } | null)?.updated_since ?? null
  );
}

async function setCursor(supabase: Supabase, key: string, iso: string) {
  await supabase.from("sync_state").upsert({
    key,
    value: { updated_since: iso },
    updated_at: new Date().toISOString(),
  });
}

const money = (set?: { shopMoney?: { amount?: string | null } } | null) => {
  const amount = set?.shopMoney?.amount;
  return amount != null && amount !== "" ? Number(amount) : null;
};

// ───────────────────────────── pedidos ─────────────────────────────

type GqlUtm = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
} | null;

type GqlVisit = {
  landingPage?: string | null;
  referrerUrl?: string | null;
  utmParameters?: GqlUtm;
} | null;

type GqlOrder = {
  legacyResourceId: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  processedAt: string | null;
  updatedAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  sourceName: string | null;
  currencyCode: string | null;
  currentSubtotalPriceSet: { shopMoney: { amount: string } } | null;
  currentTotalPriceSet: { shopMoney: { amount: string } } | null;
  currentTotalTaxSet: { shopMoney: { amount: string } } | null;
  currentTotalDiscountsSet: { shopMoney: { amount: string } } | null;
  totalShippingPriceSet: { shopMoney: { amount: string } } | null;
  totalRefundedSet: { shopMoney: { amount: string } } | null;
  customAttributes: { key: string; value: string | null }[];
  discountCodes: string[];
  customer: { legacyResourceId: string; email: string | null } | null;
  shippingAddress: {
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    zip: string | null;
    country: string | null;
    countryCodeV2: string | null;
  } | null;
  lineItems: {
    nodes: {
      title: string;
      quantity: number;
      sku: string | null;
      variantTitle: string | null;
      originalUnitPriceSet: { shopMoney: { amount: string } } | null;
      product: { legacyResourceId: string } | null;
    }[];
  };
  customerJourneySummary: {
    firstVisit: GqlVisit;
    lastVisit: GqlVisit;
  } | null;
};

const ORDERS_QUERY = /* GraphQL */ `
  query SyncOrders($cursor: String, $search: String) {
    orders(
      first: 50
      after: $cursor
      query: $search
      sortKey: UPDATED_AT
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        legacyResourceId
        name
        email
        createdAt
        processedAt
        updatedAt
        cancelledAt
        test
        displayFinancialStatus
        displayFulfillmentStatus
        sourceName
        currencyCode
        currentSubtotalPriceSet {
          shopMoney {
            amount
          }
        }
        currentTotalPriceSet {
          shopMoney {
            amount
          }
        }
        currentTotalTaxSet {
          shopMoney {
            amount
          }
        }
        currentTotalDiscountsSet {
          shopMoney {
            amount
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
          }
        }
        totalRefundedSet {
          shopMoney {
            amount
          }
        }
        customAttributes {
          key
          value
        }
        discountCodes
        customer {
          legacyResourceId
          email
        }
        shippingAddress {
          city
          province
          provinceCode
          zip
          country
          countryCodeV2
        }
        lineItems(first: 100) {
          nodes {
            title
            quantity
            sku
            variantTitle
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            product {
              legacyResourceId
            }
          }
        }
        customerJourneySummary {
          firstVisit {
            landingPage
            referrerUrl
            utmParameters {
              source
              medium
              campaign
              term
              content
            }
          }
          lastVisit {
            landingPage
            referrerUrl
            utmParameters {
              source
              medium
              campaign
              term
              content
            }
          }
        }
      }
    }
  }
`;

function mapOrder(order: GqlOrder, contactId: string | null) {
  // Atribución: los atributos "_utm_*" que fijó la tienda mandan; el customer
  // journey de Shopify es el respaldo (para pedidos anteriores al sistema).
  const attrs = new Map(
    order.customAttributes.map((a) => [a.key, a.value ?? ""]),
  );
  const attr = (key: string) => {
    const value = (attrs.get(`_${key}`) ?? attrs.get(key))?.trim();
    return value || null;
  };
  const journeyFirst = order.customerJourneySummary?.firstVisit;
  const journeyLast = order.customerJourneySummary?.lastVisit;

  const email =
    (order.email ?? order.customer?.email ?? "").trim().toLowerCase() || null;

  return {
    id: Number(order.legacyResourceId),
    name: order.name,
    order_number: order.name
      ? Number(order.name.replace(/\D/g, "")) || null
      : null,
    // Siempre presente: el upsert masivo de PostgREST exige claves uniformes
    // en todas las filas. El lookup usa la misma fuente que el webhook
    // (contacts por email), así que null aquí = null allí.
    contact_id: contactId,
    customer_id: order.customer
      ? Number(order.customer.legacyResourceId)
      : null,
    email,
    total_price: money(order.currentTotalPriceSet),
    subtotal_price: money(order.currentSubtotalPriceSet),
    total_tax: money(order.currentTotalTaxSet),
    total_discounts: money(order.currentTotalDiscountsSet),
    total_shipping: money(order.totalShippingPriceSet),
    total_refunded: money(order.totalRefundedSet) ?? 0,
    currency: order.currencyCode,
    discount_code: order.discountCodes[0]?.toUpperCase() ?? null,
    financial_status: order.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillment_status: order.displayFulfillmentStatus?.toLowerCase() ?? null,
    cancelled_at: order.cancelledAt,
    test: order.test,
    source_name: order.sourceName,
    shipping_city: order.shippingAddress?.city ?? null,
    shipping_province: order.shippingAddress?.province ?? null,
    shipping_zip: order.shippingAddress?.zip ?? null,
    shipping_country: order.shippingAddress?.country ?? null,
    shipping_country_code: order.shippingAddress?.countryCodeV2 ?? null,
    line_items: order.lineItems.nodes.slice(0, 50).map((item) => ({
      title: item.title,
      variant: item.variantTitle,
      quantity: item.quantity,
      price: item.originalUnitPriceSet?.shopMoney?.amount ?? null,
      sku: item.sku,
      product_id: item.product ? Number(item.product.legacyResourceId) : null,
    })) as Json,
    utm_source: attr("utm_source") ?? journeyLast?.utmParameters?.source ?? null,
    utm_medium: attr("utm_medium") ?? journeyLast?.utmParameters?.medium ?? null,
    utm_campaign:
      attr("utm_campaign") ?? journeyLast?.utmParameters?.campaign ?? null,
    utm_term: attr("utm_term") ?? journeyLast?.utmParameters?.term ?? null,
    utm_content:
      attr("utm_content") ?? journeyLast?.utmParameters?.content ?? null,
    gclid: attr("gclid"),
    fbclid: attr("fbclid"),
    landing_page: attr("landing_page") ?? journeyLast?.landingPage ?? null,
    referrer: attr("referrer") ?? journeyLast?.referrerUrl ?? null,
    first_utm_source:
      attr("first_utm_source") ?? journeyFirst?.utmParameters?.source ?? null,
    first_utm_medium:
      attr("first_utm_medium") ?? journeyFirst?.utmParameters?.medium ?? null,
    first_utm_campaign:
      attr("first_utm_campaign") ??
      journeyFirst?.utmParameters?.campaign ??
      null,
    first_landing_page:
      attr("first_landing_page") ?? journeyFirst?.landingPage ?? null,
    first_referrer:
      attr("first_referrer") ?? journeyFirst?.referrerUrl ?? null,
    created_at: order.createdAt,
    processed_at: order.processedAt,
    synced_at: new Date().toISOString(),
  };
}

export async function syncShopifyOrders({ full = false } = {}) {
  const supabase = createAdminClient();
  const since = full ? null : await getCursor(supabase, "shopify_orders");
  const search = since ? `updated_at:>='${since}'` : null;

  // Mapa email → contacto para enlazar pedidos con el CRM (tabla pequeña)
  const { data: contactRows } = await supabase
    .from("contacts")
    .select("id, email")
    .limit(10_000);
  const contactByEmail = new Map(
    (contactRows ?? []).map((c) => [c.email, c.id]),
  );

  let cursor: string | null = null;
  let pages = 0;
  let upserted = 0;
  let maxUpdated = since ?? "";
  const touchedContacts = new Set<string>();

  while (pages < MAX_PAGES_PER_RUN) {
    const data: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GqlOrder[];
      };
    } = await syncFetch(ORDERS_QUERY, { cursor, search });

    const { nodes, pageInfo } = data.orders;
    if (nodes.length === 0) break;
    pages += 1;

    const rows = nodes.map((order) => {
      const email =
        (order.email ?? order.customer?.email ?? "").trim().toLowerCase() ||
        null;
      const contactId = email ? (contactByEmail.get(email) ?? null) : null;
      if (contactId) touchedContacts.add(contactId);
      if (order.updatedAt > maxUpdated) maxUpdated = order.updatedAt;
      return mapOrder(order, contactId);
    });

    const { error } = await supabase.from("orders").upsert(rows);
    if (error) throw new Error(`upsert orders: ${error.message}`);
    upserted += rows.length;

    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  // Derivados de contactos (mismo cálculo que el webhook, idempotente)
  for (const contactId of touchedContacts) {
    const { data: rows } = await supabase
      .from("orders")
      .select("total_price, created_at")
      .eq("contact_id", contactId)
      .limit(5000);
    const totals = rows ?? [];
    await supabase
      .from("contacts")
      .update({
        orders_count: totals.length,
        total_spent: totals.reduce((sum, o) => sum + (o.total_price ?? 0), 0),
        last_order_at: totals.reduce<string | null>(
          (max, o) => (max && max > o.created_at ? max : o.created_at),
          null,
        ),
      })
      .eq("id", contactId);
  }

  if (maxUpdated) {
    const next = new Date(
      new Date(maxUpdated).getTime() - CURSOR_OVERLAP_MS,
    ).toISOString();
    await setCursor(supabase, "shopify_orders", next);
  }

  return { upserted, pages };
}

// ───────────────────────────── clientes ─────────────────────────────

type GqlCustomer = {
  legacyResourceId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  note: string | null;
  verifiedEmail: boolean;
  createdAt: string;
  updatedAt: string;
  numberOfOrders: string;
  amountSpent: { amount: string; currencyCode: string } | null;
  tags: string[];
  emailMarketingConsent: { marketingState: string } | null;
  defaultAddress: {
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    zip: string | null;
    country: string | null;
    countryCodeV2: string | null;
  } | null;
};

const CUSTOMERS_QUERY = /* GraphQL */ `
  query SyncCustomers($cursor: String, $search: String) {
    customers(
      first: 100
      after: $cursor
      query: $search
      sortKey: UPDATED_AT
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        legacyResourceId
        email
        firstName
        lastName
        phone
        note
        verifiedEmail
        createdAt
        updatedAt
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        tags
        emailMarketingConsent {
          marketingState
        }
        defaultAddress {
          city
          province
          provinceCode
          zip
          country
          countryCodeV2
        }
      }
    }
  }
`;

export async function syncShopifyCustomers({ full = false } = {}) {
  const supabase = createAdminClient();
  const since = full ? null : await getCursor(supabase, "shopify_customers");
  const search = since ? `updated_at:>='${since}'` : null;

  let cursor: string | null = null;
  let pages = 0;
  let upserted = 0;
  let maxUpdated = since ?? "";

  while (pages < MAX_PAGES_PER_RUN) {
    const data: {
      customers: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GqlCustomer[];
      };
    } = await syncFetch(CUSTOMERS_QUERY, { cursor, search });

    const { nodes, pageInfo } = data.customers;
    if (nodes.length === 0) break;
    pages += 1;

    const rows = nodes.map((customer) => {
      if (customer.updatedAt > maxUpdated) maxUpdated = customer.updatedAt;
      return {
        id: Number(customer.legacyResourceId),
        email: customer.email?.trim().toLowerCase() || null,
        first_name: customer.firstName,
        last_name: customer.lastName,
        phone: customer.phone,
        note: customer.note,
        verified_email: customer.verifiedEmail,
        orders_count: Number(customer.numberOfOrders) || 0,
        total_spent: customer.amountSpent
          ? Number(customer.amountSpent.amount)
          : 0,
        currency: customer.amountSpent?.currencyCode ?? null,
        accepts_email_marketing:
          customer.emailMarketingConsent?.marketingState === "SUBSCRIBED",
        tags: customer.tags,
        city: customer.defaultAddress?.city ?? null,
        province: customer.defaultAddress?.province ?? null,
        province_code: customer.defaultAddress?.provinceCode ?? null,
        zip: customer.defaultAddress?.zip ?? null,
        country: customer.defaultAddress?.country ?? null,
        country_code: customer.defaultAddress?.countryCodeV2 ?? null,
        shopify_created_at: customer.createdAt,
        shopify_updated_at: customer.updatedAt,
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from("customers").upsert(rows);
    if (error) throw new Error(`upsert customers: ${error.message}`);
    upserted += rows.length;

    // Enlazar contactos del CRM con su cliente de Shopify (por email)
    for (const row of rows) {
      if (!row.email) continue;
      await supabase
        .from("contacts")
        .update({ shopify_customer_id: String(row.id) })
        .eq("email", row.email)
        .is("shopify_customer_id", null);
    }

    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  if (maxUpdated) {
    const next = new Date(
      new Date(maxUpdated).getTime() - CURSOR_OVERLAP_MS,
    ).toISOString();
    await setCursor(supabase, "shopify_customers", next);
  }

  return { upserted, pages };
}
