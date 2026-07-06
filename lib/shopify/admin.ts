// Cliente Admin GraphQL para el sync de promociones CRM ↔ Shopify (plan §8)
// y para los envíos Packlink de /admin/orders (dirección completa del pedido
// y creación de fulfillments con tracking; requiere el scope
// write_merchant_managed_fulfillment_orders).
// Requiere SHOPIFY_ADMIN_API_TOKEN (custom app con write_discounts). Si falta,
// las acciones del CRM guardan en Supabase y marcan la promo "sin sincronizar".

const ADMIN_DOMAIN =
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-04";

export function hasAdminToken() {
  return Boolean(process.env.SHOPIFY_ADMIN_API_TOKEN);
}

async function adminFetch<T>(
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
  if (!res.ok || json.errors) {
    throw new Error(
      `Shopify Admin API: ${JSON.stringify(json.errors ?? json).slice(0, 400)}`,
    );
  }
  return json.data as T;
}

// Variante tolerante: devuelve data aunque haya errores parciales (p. ej. un
// campo sin scope aprobado aún) para que el llamante degrade con fallbacks.
async function adminFetchTolerant<T>(
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
      "[shopify-admin] errores parciales:",
      JSON.stringify(json.errors).slice(0, 300),
    );
  }
  return json.data as T;
}

function checkUserErrors(payload: {
  userErrors?: { field: string[] | null; message: string }[];
}) {
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map((e) => e.message).join("; "));
  }
}

export type DiscountFields = {
  title: string;
  code: string;
  percentage: number;
  startsAt: string;
  endsAt: string | null;
  oncePerCustomer: boolean;
  // Límite TOTAL de usos del código (1 = un solo uso real, aunque lo
  // compartan). Las promos generales no lo llevan (null/omitido).
  usageLimit?: number | null;
};

function basicCodeDiscountInput(fields: DiscountFields) {
  return {
    title: fields.title,
    code: fields.code,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
    appliesOncePerCustomer: fields.oncePerCustomer,
    usageLimit: fields.usageLimit ?? null,
    customerSelection: { all: true },
    customerGets: {
      value: { percentage: fields.percentage / 100 },
      items: { all: true },
    },
  };
}

export async function createShopifyDiscount(fields: DiscountFields) {
  const data = await adminFetch<{
    discountCodeBasicCreate: {
      codeDiscountNode: { id: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    { input: basicCodeDiscountInput(fields) },
  );
  checkUserErrors(data.discountCodeBasicCreate);
  const id = data.discountCodeBasicCreate.codeDiscountNode?.id;
  if (!id) throw new Error("Shopify no devolvió el id del descuento");
  return id;
}

export async function updateShopifyDiscount(
  discountId: string,
  fields: DiscountFields,
) {
  const data = await adminFetch<{
    discountCodeBasicUpdate: {
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation($id: ID!, $input: DiscountCodeBasicInput!) {
      discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
        userErrors { field message }
      }
    }`,
    { id: discountId, input: basicCodeDiscountInput(fields) },
  );
  checkUserErrors(data.discountCodeBasicUpdate);
}

export async function setShopifyDiscountActive(
  discountId: string,
  active: boolean,
) {
  const mutation = active ? "discountCodeActivate" : "discountCodeDeactivate";
  const data = await adminFetch<
    Record<
      string,
      { userErrors: { field: string[] | null; message: string }[] }
    >
  >(
    `mutation($id: ID!) {
      ${mutation}(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: discountId },
  );
  checkUserErrors(data[mutation]!);
}

export async function deleteShopifyDiscount(discountId: string) {
  const data = await adminFetch<{
    discountCodeDelete: {
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation($id: ID!) {
      discountCodeDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: discountId },
  );
  checkUserErrors(data.discountCodeDelete);
}

// ─────────────────────── envíos (Packlink) ───────────────────────

export type OrderShippingDetails = {
  name: string;
  email: string | null;
  total: number;
  shippingLineTitle: string | null;
  shippingAddress: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    zip: string | null;
    countryCodeV2: string | null;
    phone: string | null;
  } | null;
  lineItems: { title: string; quantity: number; weightKg: number | null }[];
};

const WEIGHT_TO_KG: Record<string, number> = {
  GRAMS: 0.001,
  KILOGRAMS: 1,
  OUNCES: 0.0283495,
  POUNDS: 0.453592,
};

// Dirección completa y pesos reales de las variantes: la tabla orders del CRM
// solo guarda ciudad/CP, así que el borrador de Packlink se monta con datos
// frescos de Shopify. Tolerante a errores parciales: sin read_products
// aprobado, variant llega null y el peso cae al fallback por unidad.
export async function getOrderShippingDetails(
  orderId: number,
): Promise<OrderShippingDetails | null> {
  const data = await adminFetchTolerant<{
    order: {
      name: string;
      email: string | null;
      currentTotalPriceSet: { shopMoney: { amount: string } } | null;
      shippingLine: { title: string } | null;
      shippingAddress: OrderShippingDetails["shippingAddress"];
      lineItems: {
        nodes: {
          title: string;
          quantity: number;
          variant: {
            inventoryItem: {
              measurement: {
                weight: { unit: string; value: number } | null;
              } | null;
            } | null;
          } | null;
        }[];
      };
    } | null;
  }>(
    `query($id: ID!) {
      order(id: $id) {
        name
        email
        currentTotalPriceSet { shopMoney { amount } }
        shippingLine { title }
        shippingAddress {
          firstName lastName company address1 address2 city zip countryCodeV2 phone
        }
        lineItems(first: 50) {
          nodes {
            title
            quantity
            variant {
              inventoryItem {
                measurement { weight { unit value } }
              }
            }
          }
        }
      }
    }`,
    { id: `gid://shopify/Order/${orderId}` },
  );
  if (!data.order) return null;
  return {
    name: data.order.name,
    email: data.order.email,
    total: Number(data.order.currentTotalPriceSet?.shopMoney.amount) || 0,
    shippingLineTitle: data.order.shippingLine?.title ?? null,
    shippingAddress: data.order.shippingAddress,
    lineItems: data.order.lineItems.nodes.map((item) => {
      const weight = item.variant?.inventoryItem?.measurement?.weight;
      const kg = weight ? weight.value * (WEIGHT_TO_KG[weight.unit] ?? 0) : 0;
      return {
        title: item.title,
        quantity: item.quantity,
        weightKg: kg || null,
      };
    }),
  };
}

// Crea el fulfillment del pedido (todas las fulfillment orders abiertas) con
// el tracking de Packlink y notifica al cliente con el email nativo de
// Shopify. Devuelve false si no había nada que fulfillear (ya enviado).
export async function createOrderFulfillment(
  orderId: number,
  tracking: { number: string; company: string | null; url: string | null },
): Promise<boolean> {
  const data = await adminFetch<{
    order: {
      fulfillmentOrders: { nodes: { id: string; status: string }[] };
    } | null;
  }>(
    `query($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          nodes { id status }
        }
      }
    }`,
    { id: `gid://shopify/Order/${orderId}` },
  );
  const open = (data.order?.fulfillmentOrders.nodes ?? []).filter((node) =>
    ["OPEN", "IN_PROGRESS"].includes(node.status),
  );
  if (open.length === 0) return false;

  const result = await adminFetch<{
    fulfillmentCreate: {
      fulfillment: { id: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment { id }
        userErrors { field message }
      }
    }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: open.map((node) => ({
          fulfillmentOrderId: node.id,
        })),
        notifyCustomer: true,
        trackingInfo: {
          number: tracking.number,
          company: tracking.company,
          url: tracking.url,
        },
      },
    },
  );
  checkUserErrors(result.fulfillmentCreate);
  return Boolean(result.fulfillmentCreate.fulfillment);
}
