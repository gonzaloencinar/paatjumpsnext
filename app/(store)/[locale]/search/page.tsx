import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { getRefineCategories } from "components/layout/search/refine/categories";
import { RefineBar } from "components/layout/search/refine/refine-bar";
import { defaultSort, sorting } from "lib/constants";
import { defaultLocale, isLocale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { searchParamsToProductFilters } from "lib/search/filtering";
import { getSearchWithFilters } from "lib/shopify";
import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await props.params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const t = getDictionary(locale);

  return {
    title: t.search.metaTitle,
    description: t.search.metaDescription,
    alternates: {
      canonical: locale === "en" ? "/en/search" : "/search",
      languages: { es: "/search", en: "/en/search", "x-default": "/search" },
    },
  };
}

// `search` only supports RELEVANCE and PRICE sorting.
const SEARCH_SORTS = ["relevance", "price-asc", "price-desc"];

export default async function SearchPage(props: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale: raw } = await props.params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const t = getDictionary(locale);
  const searchParams = (await props.searchParams) ?? {};
  const { sort, q: searchValue } = searchParams as { [key: string]: string };
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;
  const filters = searchParamsToProductFilters(searchParams);

  const [{ products, filters: facets }, categories] = await Promise.all([
    getSearchWithFilters({
      query: searchValue,
      sortKey,
      reverse,
      filters,
      locale,
    }),
    getRefineCategories(locale),
  ]);

  return (
    <>
      <RefineBar
        facets={facets}
        categories={categories}
        resultCount={products.length}
        sortValues={SEARCH_SORTS}
      />
      {searchValue ? (
        <p className="mb-4 text-sm text-white/60">
          {products.length === 0
            ? `${t.search.noResultsFor} `
            : `${t.search.showingPrefix} ${products.length} ${
                products.length === 1
                  ? t.search.resultOne
                  : t.search.resultOther
              } ${t.search.forWord} `}
          <span className="font-semibold text-white">
            &quot;{searchValue}&quot;
          </span>
        </p>
      ) : null}
      {products.length > 0 ? (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      ) : (
        <p className="py-3 text-lg">{t.search.noMatchFilters}</p>
      )}
    </>
  );
}
