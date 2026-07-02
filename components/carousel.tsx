import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { getCollectionProducts } from "lib/shopify";
import Link from "next/link";
import { GridTileImage } from "./grid/tile";

export async function Carousel() {
  // Collections that start with `hidden-*` are hidden from the search page.
  const products = await getCollectionProducts({
    collection: "hidden-homepage-carousel",
  });

  if (!products?.length) return null;

  // Purposefully duplicating products to make the carousel loop and not run out of products on wide screens.
  const carouselProducts = [...products, ...products, ...products];

  return (
    <section className="w-full pt-12 pb-6 md:pt-16">
      <div className="mx-auto mb-8 flex w-full max-w-(--breakpoint-2xl) items-baseline justify-between gap-4 px-4">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Elige tu <span className="text-orange-600">comba.</span>
        </h2>
        <Link
          href="/search"
          prefetch={true}
          className="group inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-white transition hover:text-orange-400"
        >
          Ver todas
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="w-full overflow-x-auto">
        <ul className="flex gap-4 pr-4 motion-safe:animate-carousel">
          {carouselProducts.map((product, i) => (
            <li
              key={`${product.handle}${i}`}
              // Copies 2 and 3 only exist for the infinite scroll effect — hide
              // them from the accessibility tree and the tab order.
              aria-hidden={i >= products.length || undefined}
              className="relative aspect-square w-2/3 max-w-[350px] flex-none md:w-1/3"
            >
              <Link
                href={`/product/${product.handle}`}
                className="relative block h-full w-full"
                tabIndex={i >= products.length ? -1 : undefined}
              >
                <GridTileImage
                  alt={product.title}
                  label={{
                    title: product.title,
                    amount: product.priceRange.maxVariantPrice.amount,
                    currencyCode:
                      product.priceRange.maxVariantPrice.currencyCode,
                  }}
                  src={product.featuredImage?.url}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
