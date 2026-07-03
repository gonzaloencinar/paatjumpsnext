import { QuickAddButton } from "components/cart/quick-add-button";
import { GridTileImage } from "components/grid/tile";
import { defaultLocale, type Locale } from "lib/i18n/config";
import { productPath } from "lib/i18n/routes";
import { getCollectionProducts } from "lib/shopify";
import type { Product } from "lib/shopify/types";
import Link from "next/link";

function ThreeItemGridItem({
  item,
  size,
  priority,
  locale,
}: {
  item: Product;
  size: "full" | "half";
  priority?: boolean;
  locale: Locale;
}) {
  return (
    <div
      className={
        size === "full"
          ? "relative md:col-span-4 md:row-span-2"
          : "relative md:col-span-2 md:row-span-1"
      }
    >
      <Link
        className="relative block aspect-square h-full w-full"
        href={productPath(locale, item.handle)}
        prefetch={true}
      >
        <GridTileImage
          src={item.featuredImage.url}
          fill
          sizes={
            size === "full"
              ? "(min-width: 768px) 66vw, 100vw"
              : "(min-width: 768px) 33vw, 100vw"
          }
          priority={priority}
          alt={item.title}
          label={{
            position: size === "full" ? "center" : "bottom",
            title: item.title as string,
            amount: item.priceRange.maxVariantPrice.amount,
            currencyCode: item.priceRange.maxVariantPrice.currencyCode,
          }}
        />
      </Link>
      <QuickAddButton product={item} />
    </div>
  );
}

export async function ThreeItemGrid({
  locale = defaultLocale,
}: {
  locale?: Locale;
}) {
  // Collections that start with `hidden-*` are hidden from the search page.
  const homepageItems = await getCollectionProducts({
    collection: "hidden-homepage-featured-items",
    locale,
  });

  if (!homepageItems[0] || !homepageItems[1] || !homepageItems[2]) return null;

  const [firstProduct, secondProduct, thirdProduct] = homepageItems;

  return (
    <section className="mx-auto grid max-w-(--breakpoint-2xl) gap-4 px-4 pb-4 md:grid-cols-6 md:grid-rows-2 lg:max-h-[calc(100vh-200px)]">
      <ThreeItemGridItem
        size="full"
        item={firstProduct}
        priority={true}
        locale={locale}
      />
      <ThreeItemGridItem
        size="half"
        item={secondProduct}
        priority={true}
        locale={locale}
      />
      <ThreeItemGridItem size="half" item={thirdProduct} locale={locale} />
    </section>
  );
}
