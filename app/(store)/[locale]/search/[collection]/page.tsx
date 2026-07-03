import { getCollection, getCollectionWithFilters } from "lib/shopify";
import { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlusIcon } from "@heroicons/react/24/outline";
import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { getRefineCategories } from "components/layout/search/refine/categories";
import { RefineBar } from "components/layout/search/refine/refine-bar";
import { defaultSort, sorting } from "lib/constants";
import { isLocale, type Locale } from "lib/i18n/config";
import { categoryPath, productPath } from "lib/i18n/routes";
import { fill, getDictionary } from "lib/i18n/dictionaries";
import { searchParamsToProductFilters } from "lib/search/filtering";
import { baseUrl } from "lib/utils";

// Colecciones técnicas de Shopify (frontpage, hidden-*): navegables pero fuera
// del índice y del sitemap — solo generan thin content con title basura.
function isIndexableCollection(handle: string) {
  return handle !== "frontpage" && !handle.startsWith("hidden");
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const collection = await getCollection(params.collection, locale);

  if (!collection) return notFound();

  const indexable = isIndexableCollection(params.collection);

  return {
    title: collection.seo?.title || collection.title,
    description:
      collection.seo?.description ||
      collection.description ||
      fill(t.collection.fallbackDescription, { title: collection.title }),
    alternates: {
      canonical: categoryPath(locale, params.collection),
      languages: {
        es: categoryPath("es", params.collection),
        en: categoryPath("en", params.collection),
        "x-default": categoryPath("es", params.collection),
      },
    },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function CategoryPage(props: {
  params: Promise<{ locale: string; collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const { sort } = searchParams as { [key: string]: string };
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;
  const filters = searchParamsToProductFilters(searchParams);

  const [collection, { products, filters: facets }, categories] =
    await Promise.all([
      getCollection(params.collection, locale),
      getCollectionWithFilters({
        collection: params.collection,
        sortKey,
        reverse,
        filters,
        locale,
      }),
      getRefineCategories(locale),
    ]);

  if (!collection) return notFound();

  const faqs = t.collectionFaqs[params.collection] ?? [];

  return (
    <section>
      <CollectionJsonLd
        locale={locale}
        collectionTitle={collection.title}
        collectionHandle={params.collection}
        faqs={faqs}
        productHandles={products.map((p) => p.handle)}
      />
      <header className="mt-2 mb-5 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          {collection.title}
        </h1>
        {collection.description ? (
          <p className="mt-2 text-white/70 text-pretty">
            {collection.description}
          </p>
        ) : null}
      </header>
      <RefineBar
        facets={facets}
        categories={categories}
        resultCount={products.length}
      />
      {products.length === 0 ? (
        <p className="py-3 text-lg">{t.search.noMatchFilters}</p>
      ) : (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      )}
      {faqs.length > 0 ? (
        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight">
            {t.collection.faqHeading}
          </h2>
          <div className="mt-4 border-y border-white/10">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group border-b border-white/10 py-4 last:border-b-0"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <PlusIcon
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-orange-400 transition-transform group-open:rotate-45"
                  />
                </summary>
                <p className="mt-2 pr-8 text-white/70 text-pretty">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

// FAQPage + BreadcrumbList + ItemList (el mismo trío que usan las colecciones
// de la competencia que sí rankean).
function CollectionJsonLd({
  locale,
  collectionTitle,
  collectionHandle,
  faqs,
  productHandles,
}: {
  locale: Locale;
  collectionTitle: string;
  collectionHandle: string;
  faqs: { q: string; a: string }[];
  productHandles: string[];
}) {
  const t = getDictionary(locale);
  const homeUrl = locale === "en" ? `${baseUrl}/en` : baseUrl;
  const blocks: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: t.collection.breadcrumbHome,
          item: homeUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: collectionTitle,
          item: `${baseUrl}${categoryPath(locale, collectionHandle)}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: productHandles.map((handle, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${baseUrl}${productPath(locale, handle)}`,
      })),
    },
  ];
  if (faqs.length > 0) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    });
  }
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
