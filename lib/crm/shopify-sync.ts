import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import type { FunctionArgs } from "convex/server";

// Sincronización Shopify → Convex (pedidos y clientes) vía Admin GraphQL.
// Complementa al webhook orders/create: hace el backfill histórico y
// reconcilia lo que el webhook no ve (reembolsos, cancelaciones, cambios de
// estado, clientes). Corre en /api/cron/shopify-sync cada 10 minutos con
// cursor incremental (sync_state) sobre updated_at; los upserts por id de
// Shopify (mutations batched en convex/shopifySync.ts) hacen todo idempotente.
//
// Requiere que la custom app tenga los scopes read_orders y read_customers
// además del write_discounts ya usado por las promociones.

const ADMIN_DOMAIN =
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-04";

const MAX_PAGES_PER_RUN = 20; // 20×50 pedidos por tick; el cursor continúa
const CURSOR_OVERLAP_MS = 60_000; // margen ante relojes/actualizaciones en vuelo

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

// El cursor sigue siendo el ISO de updated_at de Shopify (se compara con los
// strings de la API); vive en sync_state.value.updated_since como en el legacy
async function getCursor(key: string) {
  return await convexQuery(api.shopifySync.getCursor, { key });
}

async function setCursor(key: string, iso: string) {
  await convexMutation(api.shopifySync.setCursor, { key, iso });
}

const money = (set?: { shopMoney?: { amount?: string | null } } | null) => {
  const amount = set?.shopMoney?.amount;
  return amount != null && amount !== "" ? Number(amount) : null;
};

const isoToMs = (iso: string | null | undefined) => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
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
  shippingLine: { title: string } | null;
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
      discountAllocations: {
        allocatedAmountSet: { shopMoney: { amount: string } } | null;
        discountApplication: { __typename: string };
      }[];
    }[];
  };
  customerJourneySummary: {
    firstVisit: GqlVisit;
    lastVisit: GqlVisit;
  } | null;
};

const ORDERS_QUERY = /* GraphQL */ `
  query SyncOrders($cursor: String, $search: String) {
    orders(first: 50, after: $cursor, query: $search, sortKey: UPDATED_AT) {
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
        shippingLine {
          title
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
            discountAllocations {
              allocatedAmountSet {
                shopMoney {
                  amount
                }
              }
              discountApplication {
                __typename
              }
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

type GqlLineItem = GqlOrder["lineItems"]["nodes"][number];

// Upsell post-compra (ReConvert): el descuento del changeset llega como
// ManualDiscountApplication sobre la línea añadida; los códigos promo son
// DiscountCodeApplication y no se confunden con esto. Mismo criterio que el
// webhook (app/api/webhooks/shopify/route.ts).
function isUpsellLine(item: GqlLineItem) {
  return item.discountAllocations.some(
    (a) => a.discountApplication.__typename === "ManualDiscountApplication",
  );
}

function upsellRevenue(order: GqlOrder) {
  let total = 0;
  for (const item of order.lineItems.nodes) {
    if (!isUpsellLine(item)) continue;
    const discounted = item.discountAllocations.reduce(
      (sum, a) => sum + (Number(a.allocatedAmountSet?.shopMoney?.amount) || 0),
      0,
    );
    total +=
      (Number(item.originalUnitPriceSet?.shopMoney?.amount) || 0) *
        item.quantity -
      discounted;
  }
  return Math.round(total * 100) / 100;
}

type SyncedOrderRow = FunctionArgs<
  typeof api.shopifySync.upsertSyncedOrders
>["rows"][number];

function mapOrder(order: GqlOrder, contactId: string | null): SyncedOrderRow {
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
    orderId: Number(order.legacyResourceId),
    name: order.name,
    orderNumber: order.name
      ? Number(order.name.replace(/\D/g, "")) || null
      : null,
    // El lookup usa la misma fuente que el webhook (contacts por email),
    // así que null aquí = null allí.
    contactId,
    customerId: order.customer
      ? Number(order.customer.legacyResourceId)
      : null,
    email,
    totalPrice: money(order.currentTotalPriceSet),
    subtotalPrice: money(order.currentSubtotalPriceSet),
    totalTax: money(order.currentTotalTaxSet),
    totalDiscounts: money(order.currentTotalDiscountsSet),
    totalShipping: money(order.totalShippingPriceSet),
    totalRefunded: money(order.totalRefundedSet) ?? 0,
    currency: order.currencyCode,
    discountCode: order.discountCodes[0]?.toUpperCase() ?? null,
    financialStatus: order.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillmentStatus: order.displayFulfillmentStatus?.toLowerCase() ?? null,
    cancelledAt: isoToMs(order.cancelledAt),
    test: order.test,
    sourceName: order.sourceName,
    shippingCity: order.shippingAddress?.city ?? null,
    shippingProvince: order.shippingAddress?.province ?? null,
    shippingZip: order.shippingAddress?.zip ?? null,
    shippingCountry: order.shippingAddress?.country ?? null,
    shippingCountryCode: order.shippingAddress?.countryCodeV2 ?? null,
    shippingLineTitle: order.shippingLine?.title ?? null,
    lineItems: order.lineItems.nodes.slice(0, 50).map((item) => ({
      title: item.title,
      variant: item.variantTitle,
      quantity: item.quantity,
      price: item.originalUnitPriceSet?.shopMoney?.amount ?? null,
      sku: item.sku,
      product_id: item.product ? Number(item.product.legacyResourceId) : null,
      ...(isUpsellLine(item) ? { upsell: true } : {}),
    })),
    upsellRevenue: upsellRevenue(order),
    utmSource:
      attr("utm_source") ?? journeyLast?.utmParameters?.source ?? null,
    utmMedium:
      attr("utm_medium") ?? journeyLast?.utmParameters?.medium ?? null,
    utmCampaign:
      attr("utm_campaign") ?? journeyLast?.utmParameters?.campaign ?? null,
    utmTerm: attr("utm_term") ?? journeyLast?.utmParameters?.term ?? null,
    utmContent:
      attr("utm_content") ?? journeyLast?.utmParameters?.content ?? null,
    gclid: attr("gclid"),
    fbclid: attr("fbclid"),
    landingPage: attr("landing_page") ?? journeyLast?.landingPage ?? null,
    referrer: attr("referrer") ?? journeyLast?.referrerUrl ?? null,
    firstUtmSource:
      attr("first_utm_source") ?? journeyFirst?.utmParameters?.source ?? null,
    firstUtmMedium:
      attr("first_utm_medium") ?? journeyFirst?.utmParameters?.medium ?? null,
    firstUtmCampaign:
      attr("first_utm_campaign") ??
      journeyFirst?.utmParameters?.campaign ??
      null,
    firstLandingPage:
      attr("first_landing_page") ?? journeyFirst?.landingPage ?? null,
    firstReferrer: attr("first_referrer") ?? journeyFirst?.referrerUrl ?? null,
    createdAt: isoToMs(order.createdAt) ?? Date.now(),
    processedAt: isoToMs(order.processedAt),
    syncedAt: Date.now(),
  };
}

export async function syncShopifyOrders({ full = false } = {}) {
  const since = full ? null : await getCursor("shopify_orders");
  const search = since ? `updated_at:>='${since}'` : null;

  // Mapa email → contacto para enlazar pedidos con el CRM (tabla pequeña)
  const contactRows = await convexQuery(api.shopifySync.contactEmailIndex, {});
  const contactByEmail = new Map(contactRows.map((c) => [c.email, c.id]));

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

    await convexMutation(api.shopifySync.upsertSyncedOrders, { rows });
    upserted += rows.length;

    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  // Derivados de contactos (mismo cálculo que el webhook, idempotente)
  if (touchedContacts.size > 0) {
    await convexMutation(api.shopifySync.recomputeContactsOrders, {
      contactIds: [...touchedContacts],
    });
  }

  if (maxUpdated) {
    const next = new Date(
      new Date(maxUpdated).getTime() - CURSOR_OVERLAP_MS,
    ).toISOString();
    await setCursor("shopify_orders", next);
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
    phone: string | null;
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
    customers(first: 100, after: $cursor, query: $search, sortKey: UPDATED_AT) {
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
          phone
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
  const since = full ? null : await getCursor("shopify_customers");
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
        customerId: Number(customer.legacyResourceId),
        email: customer.email?.trim().toLowerCase() || null,
        firstName: customer.firstName,
        lastName: customer.lastName,
        // El teléfono del checkout suele quedar en la dirección, no en el
        // campo phone del cliente — nos vale cualquiera de los dos.
        phone: customer.phone ?? customer.defaultAddress?.phone ?? null,
        note: customer.note,
        verifiedEmail: customer.verifiedEmail,
        ordersCount: Number(customer.numberOfOrders) || 0,
        totalSpent: customer.amountSpent
          ? Number(customer.amountSpent.amount)
          : 0,
        currency: customer.amountSpent?.currencyCode ?? null,
        acceptsEmailMarketing:
          customer.emailMarketingConsent?.marketingState === "SUBSCRIBED",
        tags: customer.tags,
        city: customer.defaultAddress?.city ?? null,
        province: customer.defaultAddress?.province ?? null,
        provinceCode: customer.defaultAddress?.provinceCode ?? null,
        zip: customer.defaultAddress?.zip ?? null,
        country: customer.defaultAddress?.country ?? null,
        countryCode: customer.defaultAddress?.countryCodeV2 ?? null,
        shopifyCreatedAt: isoToMs(customer.createdAt),
        shopifyUpdatedAt: isoToMs(customer.updatedAt),
        syncedAt: Date.now(),
      };
    });

    // Upsert + enlace contactos ↔ cliente de Shopify (por email) en la mutation
    await convexMutation(api.shopifySync.upsertSyncedCustomers, { rows });
    upserted += rows.length;

    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  if (maxUpdated) {
    const next = new Date(
      new Date(maxUpdated).getTime() - CURSOR_OVERLAP_MS,
    ).toISOString();
    await setCursor("shopify_customers", next);
  }

  return { upserted, pages };
}
