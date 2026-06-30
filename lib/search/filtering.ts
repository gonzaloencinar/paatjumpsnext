import type {
  ProductFilterFacet,
  ProductFilterInput,
  ProductFilterValue,
} from "lib/shopify/types";

// Query params that are NOT facet filters and must be preserved as-is.
export const RESERVED_PARAMS = ["sort", "q"] as const;

// URL value used for each availability option (avoids leaking localized labels
// like "En existencia" into the URL).
export const AVAILABILITY_IN = "in-stock";
export const AVAILABILITY_OUT = "out-of-stock";

type RawParams = Record<string, string | string[] | undefined>;

const coerce = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value.join(",") : (value ?? "");

export const parseCsv = (value: string | string[] | undefined): string[] =>
  coerce(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

// ── URL key <-> facet identity ──────────────────────────────────────────────
// Each facet maps to a stable URL key that also encodes the attribute identity
// (e.g. the variant-option name or the metafield namespace/key), so the server
// can rebuild the Shopify `ProductFilter` input without needing the facet data.
export function facetToParamKey(
  facet: Pick<ProductFilterFacet, "id" | "label">,
): string {
  const { id, label } = facet;
  if (id === "filter.v.availability") return "availability";
  if (id === "filter.v.price") return "price";
  if (id.startsWith("filter.v.option.")) return `o.${label}`;
  if (id === "filter.p.product_type") return "pt";
  if (id === "filter.p.vendor") return "vendor";
  if (id === "filter.p.tag") return "tag";
  // Product metafield facets look like `filter.p.m.<namespace>.<key>`.
  if (id.startsWith("filter.p.m.")) return id.replace("filter.p.", "");
  // Fallback: a slug of the label.
  return label.toLowerCase().replace(/\s+/g, "-");
}

// The URL value for a single facet value, derived from its Shopify `input` so
// that encode/decode stay perfectly consistent.
export function paramValueForFacetValue(
  facet: Pick<ProductFilterFacet, "id">,
  value: Pick<ProductFilterValue, "input" | "label">,
): string {
  const input = parseFilterInput(value.input);
  if (!input) return value.label;
  if (typeof input.available === "boolean")
    return input.available ? AVAILABILITY_IN : AVAILABILITY_OUT;
  if (input.variantOption) return input.variantOption.value;
  if (input.productType) return input.productType;
  if (input.tag) return input.tag;
  if (input.productVendor) return input.productVendor;
  if (input.productMetafield) return input.productMetafield.value;
  return value.label;
}

export function parseFilterInput(json: string): ProductFilterInput | null {
  try {
    return JSON.parse(json) as ProductFilterInput;
  } catch {
    return null;
  }
}

// ── price <-> URL ───────────────────────────────────────────────────────────
export type PriceRange = { min: number; max: number };

export function parsePriceParam(
  value: string | string[] | undefined,
): PriceRange | null {
  const raw = coerce(value);
  if (!raw) return null;
  const [minRaw, maxRaw] = raw.split("-");
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  return { min, max };
}

export const priceRangeToParam = (min: number, max: number): string =>
  `${min}-${max}`;

// Reads the [min, max] bounds Shopify reports for a PRICE_RANGE facet.
export function priceBoundsFromFacet(
  facet: ProductFilterFacet,
): PriceRange | null {
  const first = facet.values[0];
  if (!first) return null;
  const input = parseFilterInput(first.input);
  if (!input?.price) return null;
  return {
    min: Math.floor(input.price.min ?? 0),
    max: Math.ceil(input.price.max ?? 0),
  };
}

// ── server: searchParams -> Shopify ProductFilter[] ─────────────────────────
export function searchParamsToProductFilters(
  params: RawParams,
): ProductFilterInput[] {
  const filters: ProductFilterInput[] = [];

  for (const [key, rawValue] of Object.entries(params)) {
    if ((RESERVED_PARAMS as readonly string[]).includes(key)) continue;

    if (key === "availability") {
      for (const v of parseCsv(rawValue)) {
        if (v === AVAILABILITY_IN) filters.push({ available: true });
        else if (v === AVAILABILITY_OUT) filters.push({ available: false });
      }
      continue;
    }

    if (key === "price") {
      const range = parsePriceParam(rawValue);
      if (range) filters.push({ price: { min: range.min, max: range.max } });
      continue;
    }

    if (key.startsWith("o.")) {
      const name = key.slice(2);
      for (const value of parseCsv(rawValue))
        filters.push({ variantOption: { name, value } });
      continue;
    }

    if (key === "pt") {
      for (const value of parseCsv(rawValue))
        filters.push({ productType: value });
      continue;
    }

    if (key === "vendor") {
      for (const value of parseCsv(rawValue))
        filters.push({ productVendor: value });
      continue;
    }

    if (key === "tag") {
      for (const value of parseCsv(rawValue)) filters.push({ tag: value });
      continue;
    }

    if (key.startsWith("m.")) {
      const [namespace, metafieldKey] = key.slice(2).split(".");
      if (namespace && metafieldKey) {
        for (const value of parseCsv(rawValue))
          filters.push({
            productMetafield: { namespace, key: metafieldKey, value },
          });
      }
      continue;
    }
  }

  return filters;
}

// ── active-filter chips ─────────────────────────────────────────────────────
export type ActiveFilter = {
  /** URL key, e.g. `availability`, `price`, `o.Color`. */
  key: string;
  /** URL value, e.g. `in-stock`, `Naranja`. `null` for whole-key filters (price). */
  value: string | null;
  /** Facet name shown before the value, e.g. "Color". */
  group: string;
  /** Human label shown in the chip, e.g. "Naranja" or "24 € – 30 €". */
  label: string;
};

const currencyFmt = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

// Builds the list of active-filter chips from the current params, using the
// available facets to resolve human labels.
export function describeActiveFilters(
  params: URLSearchParams,
  facets: ProductFilterFacet[],
): ActiveFilter[] {
  const chips: ActiveFilter[] = [];

  // Price is a single chip.
  const price = parsePriceParam(params.get("price") ?? undefined);
  if (price) {
    chips.push({
      key: "price",
      value: null,
      group: "Precio",
      label: `${currencyFmt(price.min)} – ${currencyFmt(price.max)}`,
    });
  }

  for (const facet of facets) {
    if (facet.type === "PRICE_RANGE") continue;
    const key = facetToParamKey(facet);
    const selected = new Set(parseCsv(params.get(key) ?? undefined));
    if (!selected.size) continue;
    for (const value of facet.values) {
      const paramValue = paramValueForFacetValue(facet, value);
      if (selected.has(paramValue)) {
        chips.push({
          key,
          value: paramValue,
          group: facet.label,
          label: value.label,
        });
      }
    }
  }

  return chips;
}
