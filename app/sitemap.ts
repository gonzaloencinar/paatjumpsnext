import { browsePath, categoryPath, productPath } from "lib/i18n/routes";
import { getAllProductsForSitemap, getCollections, getPages } from "lib/shopify";
import { baseUrl, validateEnvironmentVariables } from "lib/utils";
import { MetadataRoute } from "next";

type Route = MetadataRoute.Sitemap[number];

// Regenerate hourly (ISR) instead of on every request. The underlying Shopify
// data is cached with `"use cache"` and invalidated by the product/collection
// webhooks, so new products still appear promptly — but a momentary Shopify
// hiccup no longer turns a live request into a 500 ("couldn't fetch" in GSC).
export const revalidate = 3600;

// Spanish lives at the root, English under /en. Home and static pages share the
// same slug in both languages, so /en is a plain prefix here.
function localized(path: string, lastModified: string): Route[] {
  const es = `${baseUrl}${path}`;
  const en = `${baseUrl}/en${path}`;
  const alternates = { languages: { es, en, "x-default": es } };
  return [
    { url: es, lastModified, alternates },
    { url: en, lastModified, alternates },
  ];
}

// Collections and products have fully translated slugs per language, so their
// two URLs are built from lib/i18n/routes rather than a plain /en prefix.
function altPair(
  esPath: string,
  enPath: string,
  lastModified: string,
): Route[] {
  const es = `${baseUrl}${esPath}`;
  const en = `${baseUrl}${enPath}`;
  const alternates = { languages: { es, en, "x-default": es } };
  return [
    { url: es, lastModified, alternates },
    { url: en, lastModified, alternates },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  validateEnvironmentVariables();

  const routesMap = localized("", new Date().toISOString());

  const collectionsPromise = getCollections().then((collections) =>
    collections
      // `frontpage` es una colección técnica de Shopify (thin content, va con
      // noindex); las `hidden-*` ya las filtra getCollections().
      .filter((collection) => collection.handle !== "frontpage")
      .flatMap((collection) =>
        // handle "" is the synthetic "All" entry → the browse hub.
        collection.handle === ""
          ? altPair(browsePath("es"), browsePath("en"), collection.updatedAt)
          : altPair(
              categoryPath("es", collection.handle),
              categoryPath("en", collection.handle),
              collection.updatedAt,
            ),
      ),
  );

  const productsPromise = getAllProductsForSitemap().then((products) =>
    products.flatMap((product) =>
      altPair(
        productPath("es", product.handle),
        productPath("en", product.handle),
        product.updatedAt,
      ),
    ),
  );

  const pagesPromise = getPages().then((pages) =>
    pages.flatMap((page) => localized(`/${page.handle}`, page.updatedAt)),
  );

  let fetchedRoutes: Route[] = [];

  try {
    fetchedRoutes = (
      await Promise.all([collectionsPromise, productsPromise, pagesPromise])
    ).flat();
  } catch (error) {
    throw JSON.stringify(error, null, 2);
  }

  return [...routesMap, ...fetchedRoutes];
}
