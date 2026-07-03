"use client";

import { LOCALE_COOKIE, isLocale, type Locale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { useEffect, useState } from "react";

// Root-level boundary renders outside the store's LocaleProvider, so the
// locale comes from the middleware cookie (client-side) instead of context.
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

export default function Error({ reset }: { reset: () => void }) {
  const t = getDictionary(useCookieLocale());

  return (
    <div className="mx-auto my-4 flex max-w-xl flex-col rounded-lg border border-neutral-200 bg-white p-8 md:p-12 dark:border-neutral-800 dark:bg-black">
      <h2 className="text-xl font-bold">{t.error.title}</h2>
      <p className="my-2">{t.error.message}</p>
      <button
        className="mx-auto mt-4 flex w-full items-center justify-center rounded-full bg-orange-600 p-4 tracking-wide text-white hover:opacity-90"
        onClick={() => reset()}
      >
        {t.error.retry}
      </button>
    </div>
  );
}
