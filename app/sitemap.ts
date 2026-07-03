import { getCollections, getPages, getProducts } from "lib/shopify";
import { baseUrl, validateEnvironmentVariables } from "lib/utils";
import { MetadataRoute } from "next";

type Route = MetadataRoute.Sitemap[number];

export const dynamic = "force-dynamic";

// Spanish lives at the root, English under /en — emit both with hreflang
// alternates so each language tree gets indexed for its market.
function localized(path: string, lastModified: string): Route[] {
  const es = `${baseUrl}${path}`;
  const en = `${baseUrl}/en${path}`;
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
        localized(collection.path, collection.updatedAt),
      ),
  );

  const productsPromise = getProducts({}).then((products) =>
    products.flatMap((product) =>
      localized(`/product/${product.handle}`, product.updatedAt),
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
