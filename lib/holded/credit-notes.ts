// Rectificativas (credit notes / abonos) en Holded por devoluciones de
// pedidos YA facturados (tienen fila created en order_invoices).
//
// Disparadores: webhook refunds/create de Shopify (tiempo real) y una
// reconciliación de respaldo en el cron shopify-sync (por si el webhook se
// pierde o la devolución llega entre la facturación y el sync). Ambos acaban
// en issueCreditNotesForOrder(orderId), que relee TODOS los refunds del
// pedido en vivo de la Admin API y emite un abono por cada uno que falte
// (idempotente por refund_id en order_credit_notes).
//
// Importes: Shopify no documenta de forma estable si subtotalSet de un
// RefundLineItem incluye o no el IVA en tiendas taxesIncluded, así que se
// prueban ambas interpretaciones y se acepta la que cuadre con
// totalRefundedSet del refund; como red final, si el pedido tiene un único
// tipo de IVA se emite el abono como línea única por el importe devuelto.
// Igual que con los tickets: se crea en borrador, se verifica el total que
// calcula Holded (±0,02 €) y solo entonces se aprueba; si no cuadra se borra
// el borrador y queda en error para revisión manual.

import { createAdminClient } from "@/lib/supabase/admin";
import { hasHoldedKey, holdedFetch } from "./client";
import {
  ensureContact,
  ensureShopifyTreasury,
  madridDate,
  money,
  parseEsNumber,
  round6,
  taxKeyFor,
  type Money,
  type ShopifyAddress,
} from "./receipts";

const MAX_ATTEMPTS = 3;

const ADMIN_DOMAIN =
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-04";

type RefundDetail = {
  id: string;
  legacyResourceId: string;
  createdAt: string;
  totalRefundedSet: Money;
  refundLineItems: {
    nodes: {
      quantity: number;
      subtotalSet: Money;
      totalTaxSet: Money;
      lineItem: {
        title: string;
        sku: string | null;
        taxLines: { ratePercentage: number | null }[];
      };
    }[];
  };
  refundShippingLines: {
    nodes: {
      subtotalAmountSet: Money;
      taxAmountSet: Money;
      shippingLine: {
        title: string | null;
        taxLines: { ratePercentage: number | null }[];
      } | null;
    }[];
  };
};

type OrderRefundsDetail = {
  name: string;
  email: string | null;
  currencyCode: string;
  customer: { firstName: string | null; lastName: string | null } | null;
  billingAddress: ShopifyAddress | null;
  shippingAddress: ShopifyAddress | null;
  lineItems: {
    nodes: { taxLines: { ratePercentage: number | null }[] }[];
  };
  refunds: RefundDetail[];
};

const REFUNDS_QUERY = /* GraphQL */ `
  query OrderRefundsForCreditNotes($id: ID!) {
    order(id: $id) {
      name
      email
      currencyCode
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
          taxLines {
            ratePercentage
          }
        }
      }
      refunds {
        id
        legacyResourceId
        createdAt
        totalRefundedSet {
          shopMoney {
            amount
          }
        }
        refundLineItems(first: 100) {
          nodes {
            quantity
            subtotalSet {
              shopMoney {
                amount
              }
            }
            totalTaxSet {
              shopMoney {
                amount
              }
            }
            lineItem {
              title
              sku
              taxLines {
                ratePercentage
              }
            }
          }
        }
        refundShippingLines(first: 20) {
          nodes {
            subtotalAmountSet {
              shopMoney {
                amount
              }
            }
            taxAmountSet {
              shopMoney {
                amount
              }
            }
            shippingLine {
              title
              taxLines {
                ratePercentage
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchOrderRefunds(
  orderId: number,
): Promise<OrderRefundsDetail | null> {
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
        query: REFUNDS_QUERY,
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
  return json.data.order as OrderRefundsDetail | null;
}

type CreditNoteItem = {
  name: string;
  units: number;
  price: number;
  taxes: string[];
  sku?: string;
};

// Construye las líneas del abono a partir de un refund. Lanza si no consigue
// cuadrar con el importe realmente devuelto.
export function mapRefundToCreditNote(
  order: OrderRefundsDetail,
  refund: RefundDetail,
): { items: CreditNoteItem[]; expectedTotal: number; expectedTax: number } {
  const address = order.billingAddress ?? order.shippingAddress;
  const country = address?.countryCodeV2 ?? null;
  const zip = address?.zip ?? null;
  const expectedTotal = money(refund.totalRefundedSet);

  type Part = {
    name: string;
    units: number;
    subtotal: number;
    tax: number;
    rate: number;
    sku?: string;
  };
  const parts: Part[] = [];

  for (const rli of refund.refundLineItems.nodes) {
    const subtotal = money(rli.subtotalSet);
    const tax = money(rli.totalTaxSet);
    if (subtotal <= 0 && tax <= 0) continue;
    const rate = rli.lineItem.taxLines[0]?.ratePercentage ?? 0;
    parts.push({
      name: rli.lineItem.title,
      units: rli.quantity || 1,
      subtotal,
      tax,
      rate,
      ...(rli.lineItem.sku ? { sku: rli.lineItem.sku } : {}),
    });
  }
  for (const rsl of refund.refundShippingLines.nodes) {
    const subtotal = money(rsl.subtotalAmountSet);
    const tax = money(rsl.taxAmountSet);
    if (subtotal <= 0 && tax <= 0) continue;
    const rate = rsl.shippingLine?.taxLines[0]?.ratePercentage ?? 0;
    parts.push({
      name: `Envío (${rsl.shippingLine?.title ?? "estándar"})`,
      units: 1,
      subtotal,
      tax,
      rate,
    });
  }

  const sum = (f: (p: Part) => number) =>
    parts.reduce((acc, p) => acc + f(p), 0);
  const totalTax = sum((p) => p.tax);

  // ¿subtotal sin IVA (A) o con IVA (B)? La que cuadre con lo devuelto.
  const matches = (candidate: number) =>
    Math.abs(candidate - expectedTotal) <= 0.02;
  let baseOf: ((p: Part) => number) | null = null;
  if (parts.length > 0 && matches(sum((p) => p.subtotal + p.tax))) {
    baseOf = (p) => p.subtotal;
  } else if (parts.length > 0 && matches(sum((p) => p.subtotal))) {
    baseOf = (p) => p.subtotal - p.tax;
  }

  if (baseOf) {
    const items = parts.map((p) => {
      const key = taxKeyFor(p.rate, country, zip);
      if (!key) {
        throw new Error(`Sin tax key para IVA ${p.rate}% en la devolución`);
      }
      return {
        name: p.name,
        units: p.units,
        price: round6(baseOf(p) / p.units),
        taxes: [key],
        ...(p.sku ? { sku: p.sku } : {}),
      };
    });
    return { items, expectedTotal, expectedTax: totalTax };
  }

  // Red final (ajustes manuales del refund, importes personalizados…): línea
  // única si todo el pedido tiene un único tipo de IVA.
  const orderRates = [
    ...new Set(
      order.lineItems.nodes.flatMap((l) =>
        l.taxLines.map((t) => t.ratePercentage ?? 0),
      ),
    ),
  ];
  if (orderRates.length !== 1) {
    throw new Error(
      `no se puede desglosar la devolución (${expectedTotal} €) y el pedido mezcla tipos de IVA`,
    );
  }
  const rate = orderRates[0] ?? 0;
  const key = taxKeyFor(rate, country, zip);
  if (!key) throw new Error(`Sin tax key para IVA ${rate}%`);
  const base = round6(expectedTotal / (1 + rate / 100));
  return {
    items: [
      {
        name: `Abono devolución pedido ${order.name}`,
        units: 1,
        price: base,
        taxes: [key],
      },
    ],
    expectedTotal,
    expectedTax: Math.round((expectedTotal - base) * 100) / 100,
  };
}

export type CreditNoteResult = {
  orderId: number;
  refundId: string;
  orderName?: string;
  status: "created" | "skipped" | "error";
  documentNumber?: string | null;
  detail?: string;
};

type HoldedDoc = {
  id: string;
  document_number: string | null;
  total: string;
  tax: string;
};

function supa() {
  return createAdminClient();
}

// Emite las rectificativas que falten para un pedido (una por refund).
// Solo actúa sobre pedidos ya facturados (order_invoices.status = created).
export async function issueCreditNotesForOrder(
  orderId: number,
): Promise<CreditNoteResult[]> {
  if (!hasHoldedKey()) return [];
  const db = supa();

  const { data: invoice } = await db
    .from("order_invoices")
    .select("status, document_number")
    .eq("order_id", orderId)
    .maybeSingle();
  // Sin ticket emitido no hay nada que rectificar (si la devolución llegó
  // antes de facturar, el pedido queda skipped y no se factura).
  if (invoice?.status !== "created") return [];

  const order = await fetchOrderRefunds(orderId);
  if (!order || order.refunds.length === 0) return [];

  const results: CreditNoteResult[] = [];
  for (const refund of order.refunds) {
    const refundId = refund.legacyResourceId;
    const expectedTotal = money(refund.totalRefundedSet);
    if (expectedTotal <= 0) continue;

    const { data: existing } = await db
      .from("order_credit_notes")
      .select("status, holded_id, attempts")
      .eq("refund_id", refundId)
      .maybeSingle();
    if (existing?.status === "created" || existing?.status === "skipped") {
      continue;
    }
    if (existing && existing.attempts >= MAX_ATTEMPTS) continue;
    if (existing?.holded_id) continue; // creado a medias: revisar a mano
    if (!existing) {
      await db.from("order_credit_notes").insert({
        refund_id: refundId,
        order_id: orderId,
        status: "pending",
      });
    }

    try {
      const mapped = mapRefundToCreditNote(order, refund);
      const address = order.billingAddress ?? order.shippingAddress;
      const contactName =
        [address?.firstName, address?.lastName].filter(Boolean).join(" ") ||
        [order.customer?.firstName, order.customer?.lastName]
          .filter(Boolean)
          .join(" ") ||
        order.email ||
        "Cliente Paat Jumps";
      const contactId = await ensureContact({
        email: order.email,
        contactName,
        address,
      });
      if (!contactId) {
        throw new Error(
          "el abono requiere contacto y el pedido no tiene email",
        );
      }

      const created = await holdedFetch<{ id: string }>("/credit-notes", {
        method: "POST",
        body: {
          contact_id: contactId,
          contact_name: contactName,
          description: `Rectificativa del ticket ${invoice.document_number ?? "?"} — devolución pedido Shopify ${order.name}`,
          notes: `shopify_order_id:${orderId} shopify_refund_id:${refundId}`,
          date: madridDate(refund.createdAt),
          currency: order.currencyCode,
          language:
            address?.countryCodeV2 && address.countryCodeV2 !== "ES"
              ? "en"
              : "es",
          tags: ["shopify", "devolucion"],
          items: mapped.items,
        },
      });

      const doc = await holdedFetch<HoldedDoc>(`/credit-notes/${created.id}`);
      const total = parseEsNumber(doc.total);
      const tax = parseEsNumber(doc.tax);
      if (Math.abs(total - mapped.expectedTotal) > 0.02) {
        await holdedFetch(`/credit-notes/${created.id}`, { method: "DELETE" });
        throw new Error(
          `totales no cuadran: Holded ${total} vs devuelto ${mapped.expectedTotal}`,
        );
      }

      await holdedFetch(`/credit-notes/${created.id}/approve`, {
        method: "POST",
        body: {},
      });

      // Salida de dinero por la misma tesorería "Shopify" que los cobros
      const treasuryId = await ensureShopifyTreasury();
      await holdedFetch(`/credit-notes/${created.id}/payments`, {
        method: "POST",
        body: {
          amount: total.toFixed(2),
          date: madridDate(refund.createdAt),
          treasury_id: treasuryId,
          description: `Devolución Shopify ${order.name}`,
        },
      });

      const approved = await holdedFetch<HoldedDoc>(
        `/credit-notes/${created.id}`,
      );
      await db
        .from("order_credit_notes")
        .update({
          status: "created",
          holded_id: created.id,
          document_number: approved.document_number,
          total,
          tax,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("refund_id", refundId);
      results.push({
        orderId,
        refundId,
        orderName: order.name,
        status: "created",
        documentNumber: approved.document_number,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("order_credit_notes")
        .update({
          status: "error",
          error: message.slice(0, 500),
          attempts: (existing?.attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("refund_id", refundId);
      results.push({
        orderId,
        refundId,
        orderName: order.name,
        status: "error",
        detail: message,
      });
    }
  }
  return results;
}

// Respaldo para el cron: pedidos facturados cuyo total_refunded (reconciliado
// por el sync) sea > 0 y que aún no tengan todas sus rectificativas.
export async function reconcileRefundCreditNotes(
  limit = 10,
): Promise<CreditNoteResult[]> {
  if (!hasHoldedKey()) return [];
  const db = supa();

  const { data: invoiced } = await db
    .from("order_invoices")
    .select("order_id")
    .eq("status", "created");
  const invoicedIds = (invoiced ?? []).map((i) => i.order_id);
  if (invoicedIds.length === 0) return [];

  const { data: refunded } = await db
    .from("orders")
    .select("id, total_refunded")
    .in("id", invoicedIds)
    .gt("total_refunded", 0);
  if (!refunded || refunded.length === 0) return [];

  // Descarta pedidos cuyas rectificativas ya cubren lo devuelto
  const { data: notes } = await db
    .from("order_credit_notes")
    .select("order_id, status, total, attempts")
    .in(
      "order_id",
      refunded.map((o) => o.id),
    );
  const credited = new Map<number, number>();
  const exhausted = new Set<number>();
  for (const n of notes ?? []) {
    if (n.status === "created") {
      credited.set(
        n.order_id,
        (credited.get(n.order_id) ?? 0) + (n.total ?? 0),
      );
    } else if (n.status === "error" && n.attempts >= MAX_ATTEMPTS) {
      exhausted.add(n.order_id);
    }
  }
  const pending = refunded
    .filter(
      (o) =>
        !exhausted.has(o.id) &&
        (credited.get(o.id) ?? 0) < (o.total_refunded ?? 0) - 0.02,
    )
    .slice(0, limit);

  const results: CreditNoteResult[] = [];
  for (const o of pending) {
    results.push(...(await issueCreditNotesForOrder(o.id)));
  }
  return results;
}
