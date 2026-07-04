// Cliente Admin GraphQL para el sync de promociones CRM ↔ Shopify (plan §8).
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
