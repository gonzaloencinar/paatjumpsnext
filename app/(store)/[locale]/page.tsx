import { Carousel } from "components/carousel";
import Footer from "components/layout/footer";
import { Hero } from "components/layout/hero";
import { isLocale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return notFound();
  const t = getDictionary(locale);

  return {
    description: t.home.metaDescription,
    alternates: {
      canonical: locale === "en" ? "/en" : "/",
      languages: { es: "/", en: "/en", "x-default": "/" },
    },
    openGraph: {
      type: "website",
    },
  };
}

export default async function HomePage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  // Junk one-segment URLs (e.g. /favicon.ico with no file) land here with an
  // invalid "locale" — 404 them instead of serving the home page.
  if (!isLocale(locale)) return notFound();

  return (
    <>
      <Hero locale={locale} />
      <Carousel locale={locale} />
      <Footer locale={locale} />
    </>
  );
}
