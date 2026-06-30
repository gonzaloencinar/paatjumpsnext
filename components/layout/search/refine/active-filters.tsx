"use client";

import { Button } from "@/components/ui/button";
import { describeActiveFilters } from "lib/search/filtering";
import type { ProductFilterFacet } from "lib/shopify/types";
import { cn } from "lib/utils";
import { XIcon } from "lucide-react";
import { useRefine } from "./use-refine";

export function ActiveFilters({
  facets,
  className,
}: {
  facets: ProductFilterFacet[];
  className?: string;
}) {
  const { searchParams, removeFilter, clearAll } = useRefine();
  const params = new URLSearchParams(searchParams.toString());
  const chips = describeActiveFilters(params, facets);

  if (!chips.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((chip) => (
        <button
          key={`${chip.key}:${chip.value ?? ""}`}
          type="button"
          onClick={() => removeFilter(chip.key, chip.value)}
          className="group inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card pr-1.5 pl-2.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-muted"
        >
          <span className="text-white/55">{chip.group}:</span>
          <span>{chip.label}</span>
          <span className="flex size-4 items-center justify-center rounded-full text-white/55 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <XIcon className="size-3" />
          </span>
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={clearAll}
        className="h-7 text-white/55 hover:text-foreground"
      >
        Limpiar todo
      </Button>
    </div>
  );
}
