import { getCollection, getCollectionWithFilters } from "lib/shopify";
import { Metadata } from "next";
import { notFound } from "next/navigation";

import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { getRefineCategories } from "components/layout/search/refine/categories";
import { RefineBar } from "components/layout/search/refine/refine-bar";
import { defaultSort, sorting } from "lib/constants";
import { defaultLocale, isLocale, localeHref } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { searchParamsToProductFilters } from "lib/search/filtering";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const collection = await getCollection(params.collection, locale);

  if (!collection) return notFound();

  const path = `/search/${params.collection}`;

  return {
    title: collection.seo?.title || collection.title,
    description:
      collection.seo?.description ||
      collection.description ||
      `${collection.title} products`,
    alternates: {
      canonical: localeHref(locale, path),
      languages: { es: path, en: `/en${path}`, "x-default": path },
    },
  };
}

export default async function CategoryPage(props: {
  params: Promise<{ locale: string; collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const params = await props.params;
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const t = getDictionary(locale);
  const { sort } = searchParams as { [key: string]: string };
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;
  const filters = searchParamsToProductFilters(searchParams);

  const [{ products, filters: facets }, categories] = await Promise.all([
    getCollectionWithFilters({
      collection: params.collection,
      sortKey,
      reverse,
      filters,
      locale,
    }),
    getRefineCategories(locale),
  ]);

  return (
    <section>
      <RefineBar
        facets={facets}
        categories={categories}
        resultCount={products.length}
      />
      {products.length === 0 ? (
        <p className="py-3 text-lg">{t.search.noMatchFilters}</p>
      ) : (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      )}
    </section>
  );
}
