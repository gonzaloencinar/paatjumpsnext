"use client";

import { GlobeAltIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useDictionary, useLocale } from "components/i18n/locale-context";
import { LOCALE_COOKIE, locales, type Locale } from "lib/i18n/config";
import { translatePath } from "lib/i18n/routes";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LOCALE_CODE: Record<Locale, string> = { es: "ES", en: "EN" };

// 180 days, matching the cookie the proxy sets on first visit.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * ES/EN language toggle. Persists the choice in the `pj_locale` cookie *before*
 * navigating: the proxy resolves the visitor's locale from that cookie ahead of
 * the URL, so without it a soft nav to the other locale gets redirected right
 * back (see proxy.ts). `translatePath` keeps the visitor on the same page in the
 * target language instead of dumping them on the home page.
 */
export default function LanguageSwitcher({
  onSelect,
  className,
}: {
  onSelect?: () => void;
  className?: string;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useDictionary();

  const persist = (target: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${target};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    onSelect?.();
  };

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-full border border-white/15 py-0.5 pl-2 pr-0.5",
        className,
      )}
      role="group"
      aria-label={t.nav.language}
    >
      <GlobeAltIcon className="mr-0.5 h-4 w-4 text-white/50" aria-hidden />
      {locales.map((loc) => {
        const code = LOCALE_CODE[loc];
        const name = loc === "es" ? t.nav.spanish : t.nav.english;
        if (loc === locale) {
          return (
            <span
              key={loc}
              aria-current="true"
              className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white"
            >
              {code}
            </span>
          );
        }
        return (
          <Link
            key={loc}
            href={translatePath(locale, loc, pathname)}
            prefetch={false}
            hrefLang={loc}
            aria-label={name}
            onClick={() => persist(loc)}
            className="rounded-full px-2 py-1 text-xs font-medium text-white/60 transition-colors hover:text-orange-400"
          >
            {code}
          </Link>
        );
      })}
    </div>
  );
}
