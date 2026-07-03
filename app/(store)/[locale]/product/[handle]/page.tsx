import { QuickAddButton } from "components/cart/quick-add-button";
import { GridTileImage } from "components/grid/tile";
import Footer from "components/layout/footer";
import { Gallery } from "components/product/gallery";
import { ProductDescription } from "components/product/product-description";
import { HIDDEN_PRODUCT_TAG } from "lib/constants";
import { isLocale, localeHref, type Locale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { getProduct, getProductRecommendations } from "lib/shopify";
import type { Image } from "lib/shopify/types";
import { baseUrl, truncateForMeta } from "lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const product = await getProduct(params.handle, locale);

  if (!product) return notFound();

  const { url, width, height, altText: alt } = product.featuredImage || {};
  const indexable = !product.tags.includes(HIDDEN_PRODUCT_TAG);
  const path = `/product/${params.handle}`;

  return {
    title: product.seo.title || product.title,
    // Sin seo.description escrita en Shopify, recorta la descripción larga en
    // vez de volcarla entera (Google trunca en ~155 chars).
    description:
      product.seo.description || truncateForMeta(product.description),
    alternates: {
      canonical: localeHref(locale, path),
      languages: { es: path, en: `/en${path}`, "x-default": path },
    },
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: {
        index: indexable,
        follow: indexable,
      },
    },
    openGraph: url
      ? {
          images: [
            {
              url,
              width,
              height,
              alt,
            },
          ],
        }
      : null,
  };
}

export default async function ProductPage(props: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const product = await getProduct(params.handle, locale);

  if (!product) return notFound();

  const t = getDictionary(locale);
  const productUrl = `${baseUrl}${localeHref(locale, `/product/${product.handle}`)}`;
  const availability = product.availableForSale
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const { minVariantPrice, maxVariantPrice } = product.priceRange;
  // El precio en el JSON-LD es lo que habilita el rich snippet de precio.
  // 1 producto = 1 color con precio único: Offer con `price`; AggregateOffer
  // (low/high) solo si algún día hay rango real entre variantes.
  const singlePrice = minVariantPrice.amount === maxVariantPrice.amount;
  const priceValidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: truncateForMeta(product.description, 5000),
    image: product.images.slice(0, 5).map((image: Image) => image.url),
    url: productUrl,
    brand: { "@type": "Brand", name: "Paat Jumps" },
    offers: singlePrice
      ? {
          "@type": "Offer",
          url: productUrl,
          price: minVariantPrice.amount,
          priceCurrency: minVariantPrice.currencyCode,
          availability,
          itemCondition: "https://schema.org/NewCondition",
          priceValidUntil,
        }
      : {
          "@type": "AggregateOffer",
          availability,
          priceCurrency: minVariantPrice.currencyCode,
          highPrice: maxVariantPrice.amount,
          lowPrice: minVariantPrice.amount,
          offerCount: product.variants.length,
        },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: t.collection.breadcrumbHome,
        item: locale === "en" ? `${baseUrl}/en` : baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: t.collection.breadcrumbCatalog,
        item: `${baseUrl}${localeHref(locale, "/search")}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.title,
        item: productUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) px-4">
        <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-8 md:p-12 lg:flex-row lg:gap-8 dark:border-neutral-800 dark:bg-black">
          <div className="h-full w-full basis-full lg:basis-4/6">
            <Suspense
              fallback={
                <div className="relative aspect-square h-full max-h-[550px] w-full overflow-hidden" />
              }
            >
              <Gallery
                images={product.images.slice(0, 5).map((image: Image) => ({
                  src: image.url,
                  altText: image.altText,
                }))}
              />
            </Suspense>
          </div>

          <div className="basis-full lg:basis-2/6">
            <Suspense fallback={null}>
              <ProductDescription product={product} />
            </Suspense>
          </div>
        </div>
        <RelatedProducts id={product.id} locale={locale} />
      </div>
      <Footer locale={locale} />
      {/* Deja sitio a la barra sticky de "Añadir al carrito" en móvil */}
      <div aria-hidden className="h-20 md:hidden" />
    </>
  );
}

async function RelatedProducts({ id, locale }: { id: string; locale: Locale }) {
  const relatedProducts = await getProductRecommendations(id, locale);

  if (!relatedProducts.length) return null;

  const t = getDictionary(locale);

  return (
    <div className="py-8">
      <h2 className="mb-4 text-2xl font-bold">{t.product.related}</h2>
      <ul className="flex w-full gap-4 overflow-x-auto pt-1">
        {relatedProducts.map((product) => (
          <li
            key={product.handle}
            className="relative aspect-square w-full flex-none min-[475px]:w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5"
          >
            <Link
              className="relative h-full w-full"
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
                sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, (min-width: 475px) 50vw, 100vw"
              />
            </Link>
            <QuickAddButton product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}
