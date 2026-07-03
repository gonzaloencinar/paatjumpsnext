"use client";

import { defaultLocale, type Locale } from "lib/i18n/config";
import { getDictionary, type Dictionary } from "lib/i18n/dictionaries";
import { createContext, useContext, useEffect, type ReactNode } from "react";

const LocaleContext = createContext<Locale>(defaultLocale);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  // The single root layout renders <html lang="es">; keep the attribute in
  // sync for the English tree (hreflang alternates carry the SEO signal).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useDictionary(): Dictionary {
  return getDictionary(useLocale());
}
