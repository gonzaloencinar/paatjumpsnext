import {
  HIDDEN_PRODUCT_TAG,
  SHOPIFY_GRAPHQL_API_ENDPOINT,
  TAGS,
} from "lib/constants";
import {
  COUNTRY_COOKIE,
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  localeToLanguage,
  type Locale,
} from "lib/i18n/config";
import { isShopifyError } from "lib/type-guards";
import { ensureStartsWith } from "lib/utils";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
  revalidateTag,
} from "next/cache";
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  addToCartMutation,
  applyDiscountMutation,
  createCartMutation,
  editCartItemsMutation,
  removeFromCartMutation,
} from "./mutations/cart";
import { getCartQuery } from "./queries/cart";
import {
  getCollectionProductsFilteredQuery,
  getCollectionProductsQuery,
  getCollectionQuery,
  getCollectionsQuery,
} from "./queries/collection";
import { getMenuQuery } from "./queries/menu";
import { getPageQuery, getPagesQuery } from "./queries/page";
import {
  getProductQuery,
  getProductRecommendationsQuery,
  getProductsQuery,
  getProductsSitemapQuery,
  getSearchProductsFilteredQuery,
} from "./queries/product";
import {
  Cart,
  Collection,
  Connection,
  Image,
  Menu,
  Page,
  Product,
  ShopifyAddToCartOperation,
  ShopifyApplyDiscountOperation,
  ShopifyCart,
  ShopifyCartOperation,
  ShopifyCollection,
  ProductFilterFacet,
  ProductFilterInput,
  ShopifyCollectionOperation,
  ShopifyCollectionProductsFilteredOperation,
  ShopifyCollectionProductsOperation,
  ShopifyCollectionsOperation,
  ShopifyCreateCartOperation,
  ShopifyMenuOperation,
  ShopifyPageOperation,
  ShopifyPagesOperation,
  ShopifyProduct,
  ShopifyProductOperation,
  ShopifyProductRecommendationsOperation,
  ShopifyProductsOperation,
  ShopifyProductsSitemapOperation,
  ShopifySearchProductsOperation,
  ShopifyRemoveFromCartOperation,
  ShopifyUpdateCartOperation,
} from "./types";

const domain = process.env.SHOPIFY_STORE_DOMAIN
  ? ensureStartsWith(process.env.SHOPIFY_STORE_DOMAIN, "https://")
  : "";
const endpoint = domain ? `${domain}${SHOPIFY_GRAPHQL_API_ENDPOINT}` : "";
const key = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!;

type ExtractVariables<T> = T extends { variables: object }
  ? T["variables"]
  : never;

export async function shopifyFetch<T>({
  headers,
  query,
  variables,
}: {
  headers?: HeadersInit;
  query: string;
  variables?: ExtractVariables<T>;
}): Promise<{ status: number; body: T } | never> {
  try {
    if (!endpoint) {
      throw new Error("SHOPIFY_STORE_DOMAIN environment variable is not set");
    }

    const result = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": key,
        ...headers,
      },
      body: JSON.stringify({
        ...(query && { query }),
        ...(variables && { variables }),
      }),
    });

    const body = await result.json();

    if (body.errors) {
      throw body.errors[0];
    }

    return {
      status: result.status,
      body,
    };
  } catch (e) {
    if (isShopifyError(e)) {
      throw {
        cause: e.cause?.toString() || "unknown",
        status: e.status || 500,
        message: e.message,
        query,
      };
    }

    throw {
      error: e,
      query,
    };
  }
}

const removeEdgesAndNodes = <T>(array: Connection<T>): T[] => {
  return array.edges.map((edge) => edge?.node);
};

// Buyer context for cart operations, from the cookies the middleware sets.
// Drives @inContext (checkout language, market pricing) and buyerIdentity.
async function cartBuyerContext(): Promise<{
  country: string;
  language: string;
}> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  return {
    country: cookieStore.get(COUNTRY_COOKIE)?.value || "ES",
    language: localeToLanguage(locale),
  };
}

const reshapeCart = (cart: ShopifyCart): Cart => {
  if (!cart.cost?.totalTaxAmount) {
    cart.cost.totalTaxAmount = {
      amount: "0.0",
      currencyCode: cart.cost.totalAmount.currencyCode,
    };
  }

  return {
    ...cart,
    lines: removeEdgesAndNodes(cart.lines),
  };
};

const reshapeCollection = (
  collection: ShopifyCollection,
): Collection | undefined => {
  if (!collection) {
    return undefined;
  }

  return { ...collection };
};

const reshapeCollections = (collections: ShopifyCollection[]) => {
  const reshapedCollections = [];

  for (const collection of collections) {
    if (collection) {
      const reshapedCollection = reshapeCollection(collection);

      if (reshapedCollection) {
        reshapedCollections.push(reshapedCollection);
      }
    }
  }

  return reshapedCollections;
};

const reshapeImages = (images: Connection<Image>, productTitle: string) => {
  const flattened = removeEdgesAndNodes(images);

  return flattened.map((image) => {
    const filename = image.url.match(/.*\/(.*)\..*/)?.[1];
    return {
      ...image,
      altText: image.altText || `${productTitle} - ${filename}`,
    };
  });
};

const reshapeProduct = (
  product: ShopifyProduct,
  filterHiddenProducts: boolean = true,
) => {
  if (
    !product ||
    (filterHiddenProducts && product.tags.includes(HIDDEN_PRODUCT_TAG))
  ) {
    return undefined;
  }

  const { images, variants, ...rest } = product;

  return {
    ...rest,
    images: reshapeImages(images, product.title),
    variants: removeEdgesAndNodes(variants),
  };
};

const reshapeProducts = (products: ShopifyProduct[]) => {
  const reshapedProducts = [];

  for (const product of products) {
    if (product) {
      const reshapedProduct = reshapeProduct(product);

      if (reshapedProduct) {
        reshapedProducts.push(reshapedProduct);
      }
    }
  }

  return reshapedProducts;
};

export async function createCart(): Promise<Cart> {
  const context = await cartBuyerContext();
  const res = await shopifyFetch<ShopifyCreateCartOperation>({
    query: createCartMutation,
    variables: { ...context },
  });

  return reshapeCart(res.body.data.cartCreate.cart);
}

export async function addToCart(
  lines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cartId = (await cookies()).get("cartId")?.value!;
  const context = await cartBuyerContext();
  const res = await shopifyFetch<ShopifyAddToCartOperation>({
    query: addToCartMutation,
    variables: {
      cartId,
      lines,
      ...context,
    },
  });
  return reshapeCart(res.body.data.cartLinesAdd.cart);
}

export async function removeFromCart(lineIds: string[]): Promise<Cart> {
  const cartId = (await cookies()).get("cartId")?.value!;
  const context = await cartBuyerContext();
  const res = await shopifyFetch<ShopifyRemoveFromCartOperation>({
    query: removeFromCartMutation,
    variables: {
      cartId,
      lineIds,
      ...context,
    },
  });

  return reshapeCart(res.body.data.cartLinesRemove.cart);
}

export async function updateCart(
  lines: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cartId = (await cookies()).get("cartId")?.value!;
  const context = await cartBuyerContext();
  const res = await shopifyFetch<ShopifyUpdateCartOperation>({
    query: editCartItemsMutation,
    variables: {
      cartId,
      lines,
      ...context,
    },
  });

  return reshapeCart(res.body.data.cartLinesUpdate.cart);
}

// Aplica códigos de descuento al carrito (cartDiscountCodesUpdate). El
// descuento se refleja en los totales y se hereda en checkoutUrl (plan §8).
// Devuelve true si Shopify considera el código aplicable.
export async function applyCartDiscount(
  discountCodes: string[],
): Promise<boolean> {
  const cartId = (await cookies()).get("cartId")?.value;
  if (!cartId) return false;
  const context = await cartBuyerContext();
  const res = await shopifyFetch<ShopifyApplyDiscountOperation>({
    query: applyDiscountMutation,
    variables: { cartId, discountCodes, ...context },
  });
  const codes = res.body.data.cartDiscountCodesUpdate.cart?.discountCodes ?? [];
  return codes.some((entry) => entry.applicable);
}

export async function getCart(): Promise<Cart | undefined> {
  "use cache: private";
  cacheTag(TAGS.cart);
  cacheLife("seconds");

  const cartId = (await cookies()).get("cartId")?.value;

  if (!cartId) {
    return undefined;
  }

  const context = await cartBuyerContext();
  const res = await shopifyFetch<ShopifyCartOperation>({
    query: getCartQuery,
    variables: { cartId, ...context },
  });

  // Old carts becomes `null` when you checkout.
  if (!res.body.data.cart) {
    return undefined;
  }

  return reshapeCart(res.body.data.cart);
}

export async function getCollection(
  handle: string,
  locale: Locale = defaultLocale,
): Promise<Collection | undefined> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  const res = await shopifyFetch<ShopifyCollectionOperation>({
    query: getCollectionQuery,
    variables: {
      handle,
      language: localeToLanguage(locale),
    },
  });

  return reshapeCollection(res.body.data.collection);
}

export async function getCollectionProducts({
  collection,
  reverse,
  sortKey,
  locale = defaultLocale,
}: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
  locale?: Locale;
}): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.collections, TAGS.products);
  cacheLife("days");

  if (!endpoint) {
    console.log(
      `Skipping getCollectionProducts for '${collection}' - Shopify not configured`,
    );
    return [];
  }

  const res = await shopifyFetch<ShopifyCollectionProductsOperation>({
    query: getCollectionProductsQuery,
    variables: {
      handle: collection,
      reverse,
      sortKey: sortKey === "CREATED_AT" ? "CREATED" : sortKey,
      language: localeToLanguage(locale),
    },
  });

  if (!res.body.data.collection) {
    console.log(`No collection found for \`${collection}\``);
    return [];
  }

  return reshapeProducts(
    removeEdgesAndNodes(res.body.data.collection.products),
  );
}

// Faceted variant of `getCollectionProducts`: applies structured `filters` and
// returns both the products and the available facets for the (filtered) set.
export async function getCollectionWithFilters({
  collection,
  reverse,
  sortKey,
  filters,
  locale = defaultLocale,
}: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
  filters?: ProductFilterInput[];
  locale?: Locale;
}): Promise<{ products: Product[]; filters: ProductFilterFacet[] }> {
  "use cache";
  cacheTag(TAGS.collections, TAGS.products);
  cacheLife("days");

  if (!endpoint) {
    console.log(
      `Skipping getCollectionWithFilters for '${collection}' - Shopify not configured`,
    );
    return { products: [], filters: [] };
  }

  const res = await shopifyFetch<ShopifyCollectionProductsFilteredOperation>({
    query: getCollectionProductsFilteredQuery,
    variables: {
      handle: collection,
      reverse,
      sortKey: sortKey === "CREATED_AT" ? "CREATED" : sortKey,
      filters,
      language: localeToLanguage(locale),
    },
  });

  if (!res.body.data.collection) {
    console.log(`No collection found for \`${collection}\``);
    return { products: [], filters: [] };
  }

  return {
    products: reshapeProducts(
      removeEdgesAndNodes(res.body.data.collection.products),
    ),
    filters: res.body.data.collection.products.filters ?? [],
  };
}

export async function getCollections(
  locale: Locale = defaultLocale,
): Promise<Collection[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  if (!endpoint) {
    console.log("Skipping getCollections - Shopify not configured");
    return [
      {
        handle: "",
        title: "All",
        description: "All products",
        seo: {
          title: "All",
          description: "All products",
        },
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  const res = await shopifyFetch<ShopifyCollectionsOperation>({
    query: getCollectionsQuery,
    variables: { language: localeToLanguage(locale) },
  });
  const shopifyCollections = removeEdgesAndNodes(res.body?.data?.collections);
  const collections = [
    {
      handle: "",
      title: "All",
      description: "All products",
      seo: {
        title: "All",
        description: "All products",
      },
      updatedAt: new Date().toISOString(),
    },
    // Filter out the `hidden` collections.
    // Collections that start with `hidden-*` need to be hidden on the search page.
    ...reshapeCollections(shopifyCollections).filter(
      (collection) => !collection.handle.startsWith("hidden"),
    ),
  ];

  return collections;
}

export async function getMenu(
  handle: string,
  locale: Locale = defaultLocale,
): Promise<Menu[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  if (!endpoint) {
    console.log(`Skipping getMenu for '${handle}' - Shopify not configured`);
    return [];
  }

  const res = await shopifyFetch<ShopifyMenuOperation>({
    query: getMenuQuery,
    variables: {
      handle,
      language: localeToLanguage(locale),
    },
  });

  return (
    res.body?.data?.menu?.items.map((item: { title: string; url: string }) => ({
      title: item.title,
      path: item.url
        .replace(domain, "")
        .replace("/collections", "/search")
        .replace("/pages", ""),
    })) || []
  );
}

export async function getPage(
  handle: string,
  locale: Locale = defaultLocale,
): Promise<Page> {
  const res = await shopifyFetch<ShopifyPageOperation>({
    query: getPageQuery,
    variables: { handle, language: localeToLanguage(locale) },
  });

  return res.body.data.pageByHandle;
}

export async function getPages(
  locale: Locale = defaultLocale,
): Promise<Page[]> {
  const res = await shopifyFetch<ShopifyPagesOperation>({
    query: getPagesQuery,
    variables: { language: localeToLanguage(locale) },
  });

  return removeEdgesAndNodes(res.body.data.pages);
}

export async function getProduct(
  handle: string,
  locale: Locale = defaultLocale,
): Promise<Product | undefined> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  if (!endpoint) {
    console.log(`Skipping getProduct for '${handle}' - Shopify not configured`);
    return undefined;
  }

  const res = await shopifyFetch<ShopifyProductOperation>({
    query: getProductQuery,
    variables: {
      handle,
      language: localeToLanguage(locale),
    },
  });

  return reshapeProduct(res.body.data.product, false);
}

export async function getProductRecommendations(
  productId: string,
  locale: Locale = defaultLocale,
): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  const res = await shopifyFetch<ShopifyProductRecommendationsOperation>({
    query: getProductRecommendationsQuery,
    variables: {
      productId,
      language: localeToLanguage(locale),
    },
  });

  return reshapeProducts(res.body.data.productRecommendations);
}

export async function getProducts({
  query,
  reverse,
  sortKey,
  locale = defaultLocale,
}: {
  query?: string;
  reverse?: boolean;
  sortKey?: string;
  locale?: Locale;
}): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  const res = await shopifyFetch<ShopifyProductsOperation>({
    query: getProductsQuery,
    variables: {
      query,
      reverse,
      sortKey,
      language: localeToLanguage(locale),
    },
  });

  return reshapeProducts(removeEdgesAndNodes(res.body.data.products));
}

// Every published product's handle + updatedAt for the sitemap, paginated past
// the 250-per-page Storefront cap so it never silently truncates as the catalog
// grows. Hidden products (HIDDEN_PRODUCT_TAG) are dropped to mirror getProducts.
export async function getAllProductsForSitemap(): Promise<
  { handle: string; updatedAt: string }[]
> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  if (!endpoint) {
    return [];
  }

  const products: { handle: string; updatedAt: string }[] = [];
  let after: string | undefined;

  do {
    const res = await shopifyFetch<ShopifyProductsSitemapOperation>({
      query: getProductsSitemapQuery,
      variables: { after },
    });
    const connection = res.body.data.products;

    for (const { node } of connection.edges) {
      if (node.tags.includes(HIDDEN_PRODUCT_TAG)) continue;
      products.push({ handle: node.handle, updatedAt: node.updatedAt });
    }

    after = connection.pageInfo.hasNextPage
      ? (connection.pageInfo.endCursor ?? undefined)
      : undefined;
  } while (after);

  return products;
}

// Faceted variant of `getProducts` for the search / "Todas" page. Uses the
// `search` query so facets (`productFilters`) are available across all products.
// SearchSortKeys only supports RELEVANCE and PRICE; other sort keys collapse to
// RELEVANCE. An empty `query` returns every product.
export async function getSearchWithFilters({
  query,
  reverse,
  sortKey,
  filters,
  locale = defaultLocale,
}: {
  query?: string;
  reverse?: boolean;
  sortKey?: string;
  filters?: ProductFilterInput[];
  locale?: Locale;
}): Promise<{ products: Product[]; filters: ProductFilterFacet[] }> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  if (!endpoint) {
    return { products: [], filters: [] };
  }

  const isPrice = sortKey === "PRICE";

  const res = await shopifyFetch<ShopifySearchProductsOperation>({
    query: getSearchProductsFilteredQuery,
    variables: {
      query: query ?? "",
      sortKey: isPrice ? "PRICE" : "RELEVANCE",
      reverse: isPrice ? reverse : false,
      filters,
      language: localeToLanguage(locale),
    },
  });

  return {
    products: reshapeProducts(removeEdgesAndNodes(res.body.data.search)),
    filters: res.body.data.search.productFilters ?? [],
  };
}

// This is called from `app/api/revalidate.ts` so providers can control revalidation logic.
export async function revalidate(req: NextRequest): Promise<NextResponse> {
  // We always need to respond with a 200 status code to Shopify,
  // otherwise it will continue to retry the request.
  const collectionWebhooks = [
    "collections/create",
    "collections/delete",
    "collections/update",
  ];
  const productWebhooks = [
    "products/create",
    "products/delete",
    "products/update",
  ];
  const topic = (await headers()).get("x-shopify-topic") || "unknown";
  const secret = req.nextUrl.searchParams.get("secret");
  const isCollectionUpdate = collectionWebhooks.includes(topic);
  const isProductUpdate = productWebhooks.includes(topic);

  if (!secret || secret !== process.env.SHOPIFY_REVALIDATION_SECRET) {
    console.error("Invalid revalidation secret.");
    return NextResponse.json({ status: 401 });
  }

  if (!isCollectionUpdate && !isProductUpdate) {
    // We don't need to revalidate anything for any other topics.
    return NextResponse.json({ status: 200 });
  }

  if (isCollectionUpdate) {
    revalidateTag(TAGS.collections, "seconds");
  }

  if (isProductUpdate) {
    revalidateTag(TAGS.products, "seconds");
  }

  return NextResponse.json({ status: 200, revalidated: true, now: Date.now() });
}
