import { Carousel } from "components/carousel";
import Footer from "components/layout/footer";
import { Hero } from "components/layout/hero";
import { defaultLocale, isLocale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await props.params;
  const locale = isLocale(raw) ? raw : defaultLocale;
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
  const { locale: raw } = await props.params;
  const locale = isLocale(raw) ? raw : defaultLocale;

  return (
    <>
      <Hero locale={locale} />
      <Carousel locale={locale} />
      <Footer locale={locale} />
    </>
  );
}
