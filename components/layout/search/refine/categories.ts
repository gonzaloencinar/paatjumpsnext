import { defaultLocale, type Locale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { getCollections } from "lib/shopify";
import type { RefineCategory } from "./refine-bar";

// Builds the "Tipo de comba" pills: a leading "Todas" entry plus the real
// product categories (mirrors the navbar's filtering of "All", `frontpage` and
// `hidden-*` collections). Paths stay locale-neutral; the RefineBar prefixes
// them with /en when needed.
export async function getRefineCategories(
  locale: Locale = defaultLocale,
): Promise<RefineCategory[]> {
  const t = getDictionary(locale);
  const collections = await getCollections(locale);
  const categories = collections
    .filter(
      (collection) =>
        collection.handle &&
        collection.handle !== "frontpage" &&
        !collection.handle.startsWith("hidden"),
    )
    .map((collection) => ({
      title: collection.title,
      path: collection.path,
      handle: collection.handle,
    }));

  return [{ title: t.search.all, path: "/search", handle: "" }, ...categories];
}
