"use client";

import { QuickAddButton } from "components/cart/quick-add-button";
import Grid from "components/grid";
import { GridTileImage } from "components/grid/tile";
import { useLocale } from "components/i18n/locale-context";
import { localeHref } from "lib/i18n/config";
import { Product } from "lib/shopify/types";
import Link from "next/link";

export default function ProductGridItems({
  products,
}: {
  products: Product[];
}) {
  const locale = useLocale();

  return (
    <>
      {products.map((product) => (
        <Grid.Item key={product.handle} className="relative animate-fadeIn">
          <Link
            className="relative inline-block h-full w-full"
            href={localeHref(locale, `/product/${product.handle}`)}
            prefetch={true}
          >
            <GridTileImage
              alt={product.title}
              label={{
                title: product.title,
                amount: product.priceRange.maxVariantPrice.amount,
                currencyCode: product.priceRange.maxVariantPrice.currencyCode,
              }}
              src={product.featuredImage?.url}
              fill
              sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            />
          </Link>
          <QuickAddButton product={product} />
        </Grid.Item>
      ))}
    </>
  );
}
