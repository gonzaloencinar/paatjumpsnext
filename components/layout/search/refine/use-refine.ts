"use client";

import {
  parseCsv,
  priceRangeToParam,
  RESERVED_PARAMS,
} from "lib/search/filtering";
import { createUrl } from "lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const isReserved = (key: string) =>
  (RESERVED_PARAMS as readonly string[]).includes(key);

/**
 * Central hook for reading and mutating the refinement state, which lives
 * entirely in the URL search params. Every mutation pushes a new URL (without
 * scrolling) so the result is shareable, server-rendered and back-navigable.
 */
export function useRefine() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (params: URLSearchParams) => {
      router.push(createUrl(pathname, params), { scroll: false });
    },
    [router, pathname],
  );

  const draft = useCallback(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  const getValues = useCallback(
    (key: string) => parseCsv(searchParams.get(key) ?? undefined),
    [searchParams],
  );

  const isActive = useCallback(
    (key: string, value: string) => getValues(key).includes(value),
    [getValues],
  );

  const toggleValue = useCallback(
    (key: string, value: string) => {
      const params = draft();
      const current = parseCsv(params.get(key) ?? undefined);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length) params.set(key, next.join(","));
      else params.delete(key);
      navigate(params);
    },
    [draft, navigate],
  );

  const removeFilter = useCallback(
    (key: string, value?: string | null) => {
      const params = draft();
      if (value == null) {
        params.delete(key);
      } else {
        const next = parseCsv(params.get(key) ?? undefined).filter(
          (v) => v !== value,
        );
        if (next.length) params.set(key, next.join(","));
        else params.delete(key);
      }
      navigate(params);
    },
    [draft, navigate],
  );

  const setPrice = useCallback(
    (min: number, max: number) => {
      const params = draft();
      params.set("price", priceRangeToParam(min, max));
      navigate(params);
    },
    [draft, navigate],
  );

  const setSort = useCallback(
    (slug: string | null) => {
      const params = draft();
      if (slug) params.set("sort", slug);
      else params.delete("sort");
      navigate(params);
    },
    [draft, navigate],
  );

  const clearAll = useCallback(() => {
    const params = new URLSearchParams();
    for (const key of RESERVED_PARAMS) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    navigate(params);
  }, [searchParams, navigate]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const [key, value] of searchParams.entries()) {
      if (isReserved(key)) continue;
      count += key === "price" ? 1 : parseCsv(value).length;
    }
    return count;
  }, [searchParams]);

  return {
    searchParams,
    pathname,
    getValues,
    isActive,
    toggleValue,
    removeFilter,
    setPrice,
    setSort,
    clearAll,
    activeFilterCount,
  };
}
