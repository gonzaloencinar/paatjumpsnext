"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sorting } from "lib/constants";
import { facetToParamKey, parseCsv } from "lib/search/filtering";
import type { ProductFilterFacet } from "lib/shopify/types";
import { cn } from "lib/utils";
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { ActiveFilters } from "./active-filters";
import { FacetControl } from "./facet-control";
import { useRefine } from "./use-refine";

export type RefineCategory = {
  title: string;
  path: string;
  handle: string;
};

const SORT_LABELS: Record<string, string> = {
  relevance: "Relevancia",
  "trending-desc": "Lo más vendido",
  "latest-desc": "Novedades",
  "price-asc": "Precio: de menor a mayor",
  "price-desc": "Precio: de mayor a menor",
};

const sortOptions = sorting.map((item) => {
  const value = item.slug ?? "relevance";
  return { value, label: SORT_LABELS[value] ?? item.title };
});

function facetSelectionCount(
  facet: ProductFilterFacet,
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
): number {
  if (facet.type === "PRICE_RANGE") return searchParams.get("price") ? 1 : 0;
  return parseCsv(searchParams.get(facetToParamKey(facet)) ?? undefined).length;
}

// next/navigation's ReadonlyURLSearchParams – typed loosely to avoid the import.
type ReadonlyURLSearchParams = { get(name: string): string | null };

export function RefineBar({
  facets,
  categories,
  resultCount,
  noun = "comba",
  sortValues,
}: {
  facets: ProductFilterFacet[];
  categories: RefineCategory[];
  resultCount: number;
  noun?: string;
  /** Restrict the sort options to these values (e.g. search supports only RELEVANCE/PRICE). */
  sortValues?: string[];
}) {
  const { searchParams, pathname, setSort, clearAll, activeFilterCount } =
    useRefine();

  const sortValue = searchParams.get("sort") ?? "relevance";
  const sortChoices = sortValues
    ? sortOptions.filter((option) => sortValues.includes(option.value))
    : sortOptions;
  const hasFacets = facets.length > 0;
  const countLabel = `${resultCount} ${resultCount === 1 ? noun : `${noun}s`}`;

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border/80 bg-background/85 px-4 backdrop-blur-md">
      {/* Tipo de comba (categories) */}
      {categories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pt-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 pr-1 text-xs font-medium tracking-wide text-white/55 uppercase">
            Tipo
          </span>
          {categories.map((category) => {
            const active = pathname === category.path;
            return (
              <Button
                key={category.path}
                variant={active ? "default" : "outline"}
                size="sm"
                className="shrink-0 rounded-full"
                nativeButton={false}
                render={<Link href={category.path} scroll={false} />}
              >
                {category.title}
              </Button>
            );
          })}
        </div>
      )}

      {/* Count + controls */}
      <div className="flex items-center justify-between gap-3 py-3">
        <p className="text-sm text-white/60">
          <span className="font-semibold text-white tabular-nums">
            {resultCount}
          </span>{" "}
          {resultCount === 1 ? noun : `${noun}s`}
        </p>

        <div className="flex items-center gap-2">
          {/* Desktop: a popover per facet */}
          {hasFacets && (
            <div className="hidden items-center gap-2 md:flex">
              {facets.map((facet) => {
                const count = facetSelectionCount(facet, searchParams);
                return (
                  <Popover key={facet.id}>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "rounded-full",
                            count > 0 && "border-primary/60",
                          )}
                        />
                      }
                    >
                      {facet.label}
                      {count > 0 && (
                        <Badge className="ml-0.5 size-4 justify-center rounded-full p-0 tabular-nums">
                          {count}
                        </Badge>
                      )}
                      <ChevronDownIcon data-icon="inline-end" />
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className={cn(
                        "w-64",
                        facet.type === "PRICE_RANGE" && "w-72",
                      )}
                    >
                      <p className="px-1 pb-1 text-xs font-medium tracking-wide text-white/55 uppercase">
                        {facet.label}
                      </p>
                      <FacetControl facet={facet} />
                    </PopoverContent>
                  </Popover>
                );
              })}
              <span className="mx-1 h-5 w-px bg-border" />
            </div>
          )}

          {/* Sort (always visible) */}
          <Select
            value={sortValue}
            onValueChange={(value) =>
              setSort(value === "relevance" ? null : String(value))
            }
          >
            <SelectTrigger
              size="sm"
              className="rounded-full"
              aria-label="Ordenar"
            >
              <span className="text-white/55">Ordenar:</span>
              <SelectValue>
                {(value) =>
                  sortOptions.find((option) => option.value === value)?.label ??
                  "Relevancia"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {sortChoices.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mobile: open all facets in a sheet */}
          {hasFacets && (
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full md:hidden"
                  />
                }
              >
                <SlidersHorizontalIcon data-icon="inline-start" />
                Filtros
                {activeFilterCount > 0 && (
                  <Badge className="ml-0.5 size-4 justify-center rounded-full p-0 tabular-nums">
                    {activeFilterCount}
                  </Badge>
                )}
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
              >
                <SheetHeader className="border-b border-border px-5 py-4">
                  <SheetTitle>Filtros · {countLabel}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="min-h-0 flex-1 px-5">
                  <Accordion
                    multiple
                    defaultValue={facets.map((facet) => facet.id)}
                  >
                    {facets.map((facet) => {
                      const count = facetSelectionCount(facet, searchParams);
                      return (
                        <AccordionItem key={facet.id} value={facet.id}>
                          <AccordionTrigger>
                            <span className="flex items-center gap-2">
                              {facet.label}
                              {count > 0 && (
                                <Badge className="size-4 justify-center rounded-full p-0 tabular-nums">
                                  {count}
                                </Badge>
                              )}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <FacetControl facet={facet} />
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </ScrollArea>
                <SheetFooter className="flex-row gap-2 border-t border-border px-5 py-4">
                  <Button
                    variant="ghost"
                    onClick={clearAll}
                    disabled={activeFilterCount === 0}
                  >
                    Limpiar
                  </Button>
                  <SheetClose render={<Button className="flex-1" />}>
                    Ver {countLabel}
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      <ActiveFilters facets={facets} className="pb-4" />
    </div>
  );
}
