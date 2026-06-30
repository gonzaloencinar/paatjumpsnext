import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { getRefineCategories } from "components/layout/search/refine/categories";
import { RefineBar } from "components/layout/search/refine/refine-bar";
import { defaultSort, sorting } from "lib/constants";
import { searchParamsToProductFilters } from "lib/search/filtering";
import { getSearchWithFilters } from "lib/shopify";

export const metadata = {
  title: "Search",
  description: "Search for products in the store.",
};

// `search` only supports RELEVANCE and PRICE sorting.
const SEARCH_SORTS = ["relevance", "price-asc", "price-desc"];

export default async function SearchPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const { sort, q: searchValue } = searchParams as { [key: string]: string };
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;
  const filters = searchParamsToProductFilters(searchParams);

  const [{ products, filters: facets }, categories] = await Promise.all([
    getSearchWithFilters({ query: searchValue, sortKey, reverse, filters }),
    getRefineCategories(),
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
            ? "No hay combas que coincidan con "
            : `Mostrando ${products.length} ${
                products.length === 1 ? "resultado" : "resultados"
              } para `}
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
        <p className="py-3 text-lg">
          No hay combas que coincidan con estos filtros.
        </p>
      )}
    </>
  );
}
