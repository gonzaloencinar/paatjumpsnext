import { getCollections } from "lib/shopify";
import type { RefineCategory } from "./refine-bar";

// Builds the "Tipo de comba" pills: a leading "Todas" entry plus the real
// product categories (mirrors the navbar's filtering of "All", `frontpage` and
// `hidden-*` collections).
export async function getRefineCategories(): Promise<RefineCategory[]> {
  const collections = await getCollections();
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

  return [{ title: "Todas", path: "/search", handle: "" }, ...categories];
}
