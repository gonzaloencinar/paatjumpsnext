"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useDictionary, useLocale } from "components/i18n/locale-context";
import { localeHref } from "lib/i18n/config";
import Form from "next/form";
import { useSearchParams } from "next/navigation";

export default function Search() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useDictionary();

  return (
    <Form
      action={localeHref(locale, "/search")}
      className="w-max-[550px] relative w-full lg:w-80 xl:w-full"
    >
      <input
        key={searchParams?.get("q")}
        type="text"
        name="q"
        placeholder={t.nav.searchPlaceholder}
        autoComplete="off"
        defaultValue={searchParams?.get("q") || ""}
        className="text-md w-full rounded-lg border bg-white px-4 py-2 text-black placeholder:text-white/50 md:text-sm dark:border-white/15 dark:bg-transparent dark:text-white"
      />
      <div className="absolute right-0 top-0 mr-3 flex h-full items-center">
        <MagnifyingGlassIcon className="h-4" />
      </div>
    </Form>
  );
}

export function SearchSkeleton() {
  const t = useDictionary();

  return (
    <form className="w-max-[550px] relative w-full lg:w-80 xl:w-full">
      <input
        placeholder={t.nav.searchPlaceholder}
        className="w-full rounded-lg border bg-white px-4 py-2 text-sm text-black placeholder:text-white/50 dark:border-white/15 dark:bg-transparent dark:text-white"
      />
      <div className="absolute right-0 top-0 mr-3 flex h-full items-center">
        <MagnifyingGlassIcon className="h-4" />
      </div>
    </form>
  );
}
