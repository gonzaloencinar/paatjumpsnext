// Tickets de venta (sales receipts) en Holded a partir de pedidos de Shopify.
//
// El desglose fiscal NO sale de Supabase (orders solo guarda total_tax
// agregado): cada pedido se relee en vivo de la Admin API de Shopify con
// taxLines por línea + discountAllocations, y se traduce a líneas de Holded
// con precio sin IVA + tax key (s_iva_21, s_iva_export…). Tras crear el
// borrador se verifican los totales contra Shopify antes de aprobar; si no
// cuadran (±0,02 €) el borrador se elimina y el pedido queda en error para
// revisión manual.
//
// Estado por pedido en public.order_invoices (claim previo a crear, así el
// cron y el backfill son idempotentes y no duplican tickets).

import { createAdminClient } from "@/lib/supabase/admin";
import { hasHoldedKey, holdedFetch } from "./client";

// Los pedidos anteriores a esta fecha los emite el backfill (sin email);
// el cron solo factura pedidos nuevos a partir de aquí (con email).
export const HOLDED_AUTO_SINCE = "2026-08-06";

const MAX_ATTEMPTS = 3;

const ADMIN_DOMAIN =
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-04";

type Money = { shopMoney: { amount: string } };
type TaxLine = { ratePercentage: number | null; priceSet: Money };

type ShopifyOrderDetail = {
  name: string;
  processedAt: string;
  email: string | null;
  taxesIncluded: boolean;
  currencyCode: string;
  totalPriceSet: Money;
  totalTaxSet: Money;
  totalRefundedSet: Money;
  refunds: { id: string }[];
  customer: { firstName: string | null; lastName: string | null } | null;
  billingAddress: ShopifyAddress | null;
  shippingAddress: ShopifyAddress | null;
  lineItems: {
    nodes: {
      title: string;
      sku: string | null;
      quantity: number;
      originalTotalSet: Money;
      discountAllocations: { allocatedAmountSet: Money }[];
      taxLines: TaxLine[];
    }[];
  };
  shippingLine: {
    title: string | null;
    discountedPriceSet: Money;
    taxLines: TaxLine[];
  } | null;
};

const ORDER_QUERY = /* GraphQL */ `
  query OrderForInvoicing($id: ID!) {
    order(id: $id) {
      name
      processedAt
      email
      taxesIncluded
      currencyCode
      totalPriceSet {
        shopMoney {
          amount
        }
      }
      totalTaxSet {
        shopMoney {
          amount
        }
      }
      totalRefundedSet {
        shopMoney {
          amount
        }
      }
      refunds {
        id
      }
      customer {
        firstName
        lastName
      }
      billingAddress {
        firstName
        lastName
        company
        address1
        address2
        city
        zip
        province
        countryCodeV2
        phone
      }
      shippingAddress {
        firstName
        lastName
        company
        address1
        address2
        city
        zip
        province
        countryCodeV2
        phone
      }
      lineItems(first: 100) {
        nodes {
          title
          sku
          quantity
          originalTotalSet {
            shopMoney {
              amount
            }
          }
          discountAllocations {
            allocatedAmountSet {
              shopMoney {
                amount
              }
            }
          }
          taxLines {
            ratePercentage
            priceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
      shippingLine {
        title
        discountedPriceSet {
          shopMoney {
            amount
          }
        }
        taxLines {
          ratePercentage
          priceSet {
            shopMoney {
              amount
            }
          }
        }
      }
    }
  }
`;

type ShopifyAddress = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  zip: string | null;
  province: string | null;
  countryCodeV2: string | null;
  phone: string | null;
};

async function fetchShopifyOrder(
  orderId: number,
): Promise<ShopifyOrderDetail | null> {
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
      body: JSON.stringify({
        query: ORDER_QUERY,
        variables: { id: `gid://shopify/Order/${orderId}` },
      }),
    },
  );
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(
      `Shopify Admin API: ${JSON.stringify(json.errors ?? json).slice(0, 400)}`,
    );
  }
  return json.data.order as ShopifyOrderDetail | null;
}

const money = (m: Money) => Number(m.shopMoney.amount);

// Números de la API de Holded: formato español ("1.234,56")
function parseEsNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value.replace(/\./g, "").replace(",", "."));
}

const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

// Códigos postales fuera del territorio de aplicación del IVA español:
// Canarias (35xxx/38xxx), Ceuta (51xxx), Melilla (52xxx).
function isSpainVatExcluded(zip: string | null | undefined) {
  const z = (zip ?? "").trim();
  return /^(35|38|51|52)/.test(z);
}

// Tax key de Holded según el IVA que Shopify aplicó realmente.
function taxKeyFor(
  rate: number,
  countryCode: string | null,
  zip: string | null,
): string | null {
  const byRate: Record<number, string> = {
    21: "s_iva_21",
    10: "s_iva_10",
    7.5: "s_iva_75",
    5: "s_iva_5",
    4: "s_iva_4",
    2: "s_iva_2",
  };
  if (rate > 0) return byRate[rate] ?? null;
  // Sin IVA: exportación (Canarias/Ceuta/Melilla o fuera de la UE) vs 0%
  if (countryCode === "ES" && isSpainVatExcluded(zip)) return "s_iva_export";
  if (countryCode && !EU_COUNTRIES.has(countryCode)) return "s_iva_export";
  return "s_iva_0";
}

type ReceiptItem = {
  name: string;
  units: number;
  price: number;
  taxes: string[];
  sku?: string;
};

export type MappedReceipt = {
  items: ReceiptItem[];
  date: string;
  language: string;
  currency: string;
  expectedTotal: number;
  expectedTax: number;
  email: string | null;
  contactName: string;
  address: ShopifyAddress | null;
  orderName: string;
};

function madridDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// Traduce el pedido a líneas de Holded. Lanza si aparece un tipo de IVA que
// no sabemos mapear (mejor fallar que contabilizar mal).
export function mapOrderToReceipt(order: ShopifyOrderDetail): MappedReceipt {
  const address = order.billingAddress ?? order.shippingAddress;
  const country = address?.countryCodeV2 ?? null;
  const zip = address?.zip ?? null;

  const items: ReceiptItem[] = [];

  for (const line of order.lineItems.nodes) {
    const gross =
      money(line.originalTotalSet) -
      line.discountAllocations.reduce(
        (sum, d) => sum + money(d.allocatedAmountSet),
        0,
      );
    if (gross <= 0 && line.taxLines.length === 0) continue;
    const tax = line.taxLines.reduce((sum, t) => sum + money(t.priceSet), 0);
    const rates = [
      ...new Set(line.taxLines.map((t) => t.ratePercentage ?? 0)),
    ].filter((r) => r > 0);
    if (rates.length > 1) {
      throw new Error(`Línea "${line.title}" con varios tipos de IVA`);
    }
    const rate = rates[0] ?? 0;
    const key = taxKeyFor(rate, country, zip);
    if (!key) {
      throw new Error(`Sin tax key para IVA ${rate}% (${country ?? "?"})`);
    }
    const base = order.taxesIncluded ? gross - tax : gross;
    items.push({
      name: line.title,
      units: line.quantity,
      price: round6(base / line.quantity),
      taxes: [key],
      ...(line.sku ? { sku: line.sku } : {}),
    });
  }

  if (order.shippingLine) {
    const gross = money(order.shippingLine.discountedPriceSet);
    const tax = order.shippingLine.taxLines.reduce(
      (sum, t) => sum + money(t.priceSet),
      0,
    );
    if (gross > 0) {
      const rate = order.shippingLine.taxLines[0]?.ratePercentage ?? 0;
      const key = taxKeyFor(rate, country, zip);
      if (!key) {
        throw new Error(`Sin tax key para IVA del envío (${rate}%)`);
      }
      const base = order.taxesIncluded ? gross - tax : gross;
      items.push({
        name: `Envío (${order.shippingLine.title ?? "estándar"})`,
        units: 1,
        price: round6(base),
        taxes: [key],
      });
    }
  }

  const contactName =
    [address?.firstName, address?.lastName].filter(Boolean).join(" ") ||
    [order.customer?.firstName, order.customer?.lastName]
      .filter(Boolean)
      .join(" ") ||
    order.email ||
    "Cliente Paat Jumps";

  return {
    items,
    date: madridDate(order.processedAt),
    language: country && country !== "ES" ? "en" : "es",
    currency: order.currencyCode,
    expectedTotal: money(order.totalPriceSet),
    expectedTax: money(order.totalTaxSet),
    email: order.email,
    contactName,
    address,
    orderName: order.name,
  };
}

// ---------------------------------------------------------------------------
// Holded: contacto, tesorería y emisión

type HoldedList<T> = { items: T[] };

async function ensureContact(mapped: MappedReceipt): Promise<string | null> {
  if (!mapped.email) return null;
  const existing = await holdedFetch<HoldedList<{ id: string }>>("/contacts", {
    query: { email: mapped.email, limit: "1" },
  });
  if (existing.items[0]) return existing.items[0].id;

  const created = await holdedFetch<{ id: string }>("/contacts", {
    method: "POST",
    body: {
      name: mapped.contactName,
      email: mapped.email,
      type: "client",
      is_person: true,
      ...(mapped.address?.phone ? { mobile: mapped.address.phone } : {}),
      ...(mapped.address
        ? {
            bill_address: {
              address: [mapped.address.address1, mapped.address.address2]
                .filter(Boolean)
                .join(", "),
              city: mapped.address.city,
              postal_code: mapped.address.zip,
              province: mapped.address.province,
              country_code: mapped.address.countryCodeV2,
            },
          }
        : {}),
    },
  });
  return created.id;
}

// Cuenta de tesorería "Shopify" (pasarela): ahí se registran los cobros de
// los tickets para que queden pagados sin ensuciar las cuentas bancarias.
let shopifyTreasuryId: string | null = null;

async function ensureShopifyTreasury(): Promise<string> {
  if (shopifyTreasuryId) return shopifyTreasuryId;
  const accounts =
    await holdedFetch<HoldedList<{ id: string; name: string }>>(
      "/treasury/accounts",
    );
  const found = accounts.items.find(
    (a) => a.name.trim().toLowerCase() === "shopify",
  );
  if (found) {
    shopifyTreasuryId = found.id;
    return found.id;
  }
  const created = await holdedFetch<{ id: string }>("/treasury/accounts", {
    method: "POST",
    body: { name: "Shopify", type: "gateway", currency: "EUR" },
  });
  shopifyTreasuryId = created.id;
  return created.id;
}

type HoldedReceipt = {
  id: string;
  document_number: string | null;
  subtotal: string;
  total: string;
  tax: string;
  status: string;
};

export type IssueResult = {
  orderId: number;
  orderName?: string;
  status: "created" | "skipped" | "error";
  documentNumber?: string | null;
  detail?: string;
  emailed?: boolean;
};

type OrderRow = {
  id: number;
  name: string | null;
  email: string | null;
  financial_status: string | null;
  cancelled_at: string | null;
  test: boolean | null;
  total_refunded: number | null;
  total_price: number | null;
  processed_at: string | null;
};

function supa() {
  return createAdminClient();
}

async function saveInvoiceRow(orderId: number, patch: Record<string, unknown>) {
  await supa()
    .from("order_invoices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("order_id", orderId);
}

// Emite el ticket de un pedido: borrador → verificación de totales →
// aprobación → cobro (tesorería Shopify) → email opcional.
export async function issueReceiptForOrder(
  row: OrderRow,
  opts: { sendEmail: boolean },
): Promise<IssueResult> {
  const orderId = row.id;
  const db = supa();

  // Guardas: solo pedidos cobrados, sin devoluciones, reales
  let skipReason: string | null = null;
  if (row.test) skipReason = "pedido de prueba";
  else if (row.cancelled_at) skipReason = "pedido cancelado";
  else if (row.financial_status !== "paid")
    skipReason = `financial_status=${row.financial_status}`;
  else if ((row.total_refunded ?? 0) > 0) skipReason = "tiene devoluciones";
  else if ((row.total_price ?? 0) <= 0) skipReason = "total 0";

  // Reclamar la fila (idempotencia): si ya existe y está creada/omitida, fuera
  const { data: existing } = await db
    .from("order_invoices")
    .select("status, holded_id, attempts")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing?.status === "created" || existing?.status === "skipped") {
    return { orderId, status: "skipped", detail: `ya ${existing.status}` };
  }
  if (existing && existing.attempts >= MAX_ATTEMPTS) {
    return { orderId, status: "skipped", detail: "máximo de intentos" };
  }
  if (existing?.holded_id) {
    return {
      orderId,
      status: "skipped",
      detail: "ya tiene ticket en Holded (revisar a mano)",
    };
  }
  if (!existing) {
    await db.from("order_invoices").insert({
      order_id: orderId,
      order_name: row.name,
      status: "pending",
    });
  }

  if (skipReason) {
    await saveInvoiceRow(orderId, { status: "skipped", error: skipReason });
    return {
      orderId,
      orderName: row.name ?? undefined,
      status: "skipped",
      detail: skipReason,
    };
  }

  try {
    const order = await fetchShopifyOrder(orderId);
    if (!order) throw new Error("pedido no encontrado en Shopify");
    if (order.refunds.length > 0 || money(order.totalRefundedSet) > 0) {
      await saveInvoiceRow(orderId, {
        status: "skipped",
        error: "tiene devoluciones (Shopify)",
      });
      return {
        orderId,
        orderName: order.name,
        status: "skipped",
        detail: "tiene devoluciones",
      };
    }

    const mapped = mapOrderToReceipt(order);
    const contactId = await ensureContact(mapped);

    const created = await holdedFetch<{ id: string }>("/sales-receipts", {
      method: "POST",
      body: {
        ...(contactId ? { contact_id: contactId } : {}),
        contact_name: mapped.contactName,
        description: `Pedido Shopify ${mapped.orderName}`,
        notes: `shopify_order_id:${orderId}`,
        date: mapped.date,
        currency: mapped.currency,
        language: mapped.language,
        tags: ["shopify"],
        items: mapped.items,
      },
    });

    // Verificar totales contra lo cobrado realmente en Shopify
    const receipt = await holdedFetch<HoldedReceipt>(
      `/sales-receipts/${created.id}`,
    );
    const total = parseEsNumber(receipt.total);
    const tax = parseEsNumber(receipt.tax);
    if (
      Math.abs(total - mapped.expectedTotal) > 0.02 ||
      Math.abs(tax - mapped.expectedTax) > 0.02
    ) {
      await holdedFetch(`/sales-receipts/${created.id}`, { method: "DELETE" });
      throw new Error(
        `totales no cuadran: Holded ${total}/${tax} vs Shopify ${mapped.expectedTotal}/${mapped.expectedTax}`,
      );
    }

    await holdedFetch(`/sales-receipts/${created.id}/approve`, {
      method: "POST",
      body: {},
    });

    // Registrar el cobro en la tesorería "Shopify"
    const treasuryId = await ensureShopifyTreasury();
    await holdedFetch(`/sales-receipts/${created.id}/payments`, {
      method: "POST",
      body: {
        amount: total.toFixed(2),
        date: mapped.date,
        treasury_id: treasuryId,
        description: `Cobro Shopify ${mapped.orderName}`,
      },
    });

    const approved = await holdedFetch<HoldedReceipt>(
      `/sales-receipts/${created.id}`,
    );

    let emailed = false;
    if (opts.sendEmail && mapped.email) {
      const es = mapped.language === "es";
      await holdedFetch(`/sales-receipts/${created.id}/send`, {
        method: "POST",
        body: {
          emails: [mapped.email],
          subject: es
            ? `Tu ticket de compra ${mapped.orderName} — Paat Jumps`
            : `Your receipt ${mapped.orderName} — Paat Jumps`,
          message: es
            ? `¡Hola! Te adjuntamos el ticket de tu pedido ${mapped.orderName}. Gracias por saltar con Paat Jumps 🧡`
            : `Hi! Attached is the receipt for your order ${mapped.orderName}. Thanks for jumping with Paat Jumps 🧡`,
        },
      });
      emailed = true;
    }

    await saveInvoiceRow(orderId, {
      status: "created",
      holded_id: created.id,
      document_number: approved.document_number,
      total,
      tax,
      error: null,
      ...(emailed ? { emailed_at: new Date().toISOString() } : {}),
    });
    return {
      orderId,
      orderName: order.name,
      status: "created",
      documentNumber: approved.document_number,
      emailed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supa()
      .from("order_invoices")
      .update({
        status: "error",
        error: message.slice(0, 500),
        attempts: (existing?.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);
    return {
      orderId,
      orderName: row.name ?? undefined,
      status: "error",
      detail: message,
    };
  }
}

// Pedidos cobrados sin ticket todavía, en un rango de fechas.
async function pendingOrders(range: {
  before?: string;
  since?: string;
  limit: number;
}): Promise<OrderRow[]> {
  const db = supa();
  let query = db
    .from("orders")
    .select(
      "id, name, email, financial_status, cancelled_at, test, total_refunded, total_price, processed_at",
    )
    .eq("financial_status", "paid")
    .is("cancelled_at", null)
    .order("processed_at", { ascending: true });
  if (range.before) query = query.lt("processed_at", range.before);
  if (range.since) query = query.gte("processed_at", range.since);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  const rows = (data ?? []).filter((o) => !o.test);
  if (rows.length === 0) return [];

  const { data: invoiced } = await db
    .from("order_invoices")
    .select("order_id, status, attempts")
    .in(
      "order_id",
      rows.map((o) => o.id),
    );
  const done = new Set(
    (invoiced ?? [])
      .filter(
        (i) =>
          i.status === "created" ||
          i.status === "skipped" ||
          i.attempts >= MAX_ATTEMPTS,
      )
      .map((i) => i.order_id),
  );
  return rows.filter((o) => !done.has(o.id)).slice(0, range.limit);
}

// Para el cron: factura (y envía por email) los pedidos nuevos.
export async function invoiceNewOrders(limit = 5): Promise<IssueResult[]> {
  if (!hasHoldedKey()) return [];
  const rows = await pendingOrders({ since: HOLDED_AUTO_SINCE, limit });
  const results: IssueResult[] = [];
  for (const row of rows) {
    results.push(await issueReceiptForOrder(row, { sendEmail: true }));
  }
  return results;
}

// Para el backfill: pedidos históricos, sin email.
export async function backfillOldOrders(limit = 30): Promise<IssueResult[]> {
  if (!hasHoldedKey()) throw new Error("HOLDED_API_KEY no configurada");
  const rows = await pendingOrders({ before: HOLDED_AUTO_SINCE, limit });
  const results: IssueResult[] = [];
  for (const row of rows) {
    results.push(await issueReceiptForOrder(row, { sendEmail: false }));
  }
  return results;
}

// Vista previa sin tocar Holded (dry run del backfill).
export async function previewOldOrders(limit = 30) {
  const rows = await pendingOrders({ before: HOLDED_AUTO_SINCE, limit });
  const previews = [];
  for (const row of rows) {
    const order = await fetchShopifyOrder(row.id);
    if (!order) {
      previews.push({ orderId: row.id, error: "no encontrado en Shopify" });
      continue;
    }
    try {
      const mapped = mapOrderToReceipt(order);
      const computedTotal = mapped.items.reduce((sum, it) => {
        const rate = Number(
          (it.taxes[0]?.match(/_(\d+)$/)?.[1] ?? "0").replace("75", "7.5"),
        );
        return sum + it.units * it.price * (1 + rate / 100);
      }, 0);
      previews.push({
        orderId: row.id,
        orderName: order.name,
        date: mapped.date,
        refunds: order.refunds.length,
        items: mapped.items,
        expectedTotal: mapped.expectedTotal,
        expectedTax: mapped.expectedTax,
        computedTotal: Math.round(computedTotal * 100) / 100,
        email: mapped.email,
        contactName: mapped.contactName,
      });
    } catch (error) {
      previews.push({
        orderId: row.id,
        orderName: order.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return previews;
}
