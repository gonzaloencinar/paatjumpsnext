"use client";

import {
  LOCALE_COOKIE,
  isLocale,
  localeHref,
  type Locale,
} from "lib/i18n/config";
import Link from "next/link";
import { useEffect, useState } from "react";

// Root boundary: renders outside the store's LocaleProvider (it also covers
// junk URLs that never resolve a locale), so the language comes from the
// middleware cookie read client-side — same approach as app/error.tsx.
function useCookieLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("es");
  useEffect(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${LOCALE_COOKIE}=(\\w+)`),
    );
    const value = match?.[1];
    if (isLocale(value)) setLocale(value);
  }, []);
  return locale;
}

const COPY = {
  es: {
    title: "Página no encontrada",
    message: "La página que buscas no existe o ha cambiado de sitio.",
    cta: "Volver a la tienda",
  },
  en: {
    title: "Page not found",
    message: "The page you're looking for doesn't exist or has moved.",
    cta: "Back to the store",
  },
} as const;

export default function NotFound() {
  const locale = useCookieLocale();
  const t = COPY[locale];

  return (
    <div className="mx-auto my-12 flex max-w-xl flex-col rounded-lg border border-neutral-200 bg-white p-8 md:p-12 dark:border-neutral-800 dark:bg-black">
      <h2 className="text-xl font-bold">{t.title}</h2>
      <p className="my-2">{t.message}</p>
      <Link
        href={localeHref(locale, "/")}
        className="mx-auto mt-4 flex w-full items-center justify-center rounded-full bg-orange-600 p-4 tracking-wide text-white hover:opacity-90"
      >
        {t.cta}
      </Link>
    </div>
  );
}
