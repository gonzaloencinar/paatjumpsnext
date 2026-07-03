import type { Metadata } from "next";

import Prose from "components/prose";
import { isLocale, localeTag } from "lib/i18n/config";
import { pagePath } from "lib/i18n/routes";
import { getDictionary } from "lib/i18n/dictionaries";
import { getPage } from "lib/shopify";
import { notFound } from "next/navigation";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; page: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const page = await getPage(params.page, locale);

  if (!page) return notFound();

  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description || page.bodySummary,
    alternates: {
      canonical: pagePath(locale, params.page),
      languages: {
        es: pagePath("es", params.page),
        en: pagePath("en", params.page),
        "x-default": pagePath("es", params.page),
      },
    },
    openGraph: {
      publishedTime: page.createdAt,
      modifiedTime: page.updatedAt,
      type: "article",
    },
  };
}

export default async function Page(props: {
  params: Promise<{ locale: string; page: string }>;
}) {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const page = await getPage(params.page, locale);

  if (!page) return notFound();

  return (
    <>
      <h1 className="mb-8 text-5xl font-bold">{page.title}</h1>
      <Prose className="mb-8" html={page.body} />
      <p className="text-sm italic">
        {`${t.page.lastUpdatedPrefix} ${new Intl.DateTimeFormat(
          localeTag(locale),
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          },
        ).format(new Date(page.updatedAt))}.`}
      </p>
    </>
  );
}
