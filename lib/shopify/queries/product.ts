import productFragment from "../fragments/product";

// Every query runs @inContext(language: ...) so titles, descriptions, SEO and
// facet labels come back in the storefront language (translations managed in
// Shopify via Translate & Adapt; untranslated content falls back to Spanish).

export const getProductQuery = /* GraphQL */ `
  query getProduct($handle: String!, $language: LanguageCode)
  @inContext(language: $language) {
    product(handle: $handle) {
      ...product
    }
  }
  ${productFragment}
`;

export const getProductsQuery = /* GraphQL */ `
  query getProducts(
    $sortKey: ProductSortKeys
    $reverse: Boolean
    $query: String
    $language: LanguageCode
  ) @inContext(language: $language) {
    products(sortKey: $sortKey, reverse: $reverse, query: $query, first: 100) {
      edges {
        node {
          ...product
        }
      }
    }
  }
  ${productFragment}
`;

// Faceted search across all products (used by the "Todas" / search page). Unlike
// the root `products` query, `search` exposes `productFilters` (facets) and
// accepts a structured `productFilters` argument. SearchSortKeys only supports
// RELEVANCE and PRICE. An empty `query` returns every product.
export const getSearchProductsFilteredQuery = /* GraphQL */ `
  query getSearchProductsFiltered(
    $query: String!
    $sortKey: SearchSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
    $language: LanguageCode
  ) @inContext(language: $language) {
    search(
      query: $query
      types: PRODUCT
      first: 100
      sortKey: $sortKey
      reverse: $reverse
      productFilters: $filters
    ) {
      productFilters {
        id
        label
        type
        values {
          id
          label
          count
          input
        }
      }
      edges {
        node {
          ... on Product {
            ...product
          }
        }
      }
    }
  }
  ${productFragment}
`;

export const getProductRecommendationsQuery = /* GraphQL */ `
  query getProductRecommendations($productId: ID!, $language: LanguageCode)
  @inContext(language: $language) {
    productRecommendations(productId: $productId) {
      ...product
    }
  }
  ${productFragment}
`;
