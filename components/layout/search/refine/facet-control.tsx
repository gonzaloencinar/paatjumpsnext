"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { swatchColors } from "lib/search/colors";
import {
  facetToParamKey,
  paramValueForFacetValue,
  parsePriceParam,
  priceBoundsFromFacet,
} from "lib/search/filtering";
import type { ProductFilterFacet, ProductFilterValue } from "lib/shopify/types";
import { cn } from "lib/utils";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useRefine } from "./use-refine";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Render swatches for any LIST facet that looks like a color, regardless of
// whether the merchant models color as a variant option or a metafield.
const isColorFacet = (facet: ProductFilterFacet) =>
  facet.type === "LIST" && /colou?r/i.test(facet.label);

export function FacetControl({ facet }: { facet: ProductFilterFacet }) {
  if (facet.type === "PRICE_RANGE") return <PriceControl facet={facet} />;
  if (isColorFacet(facet)) return <ColorControl facet={facet} />;
  return <CheckboxControl facet={facet} />;
}

function CheckboxControl({ facet }: { facet: ProductFilterFacet }) {
  const { isActive, toggleValue } = useRefine();
  const key = facetToParamKey(facet);

  return (
    <div className="flex flex-col gap-0.5">
      {facet.values.map((value) => {
        const paramValue = paramValueForFacetValue(facet, value);
        const active = isActive(key, paramValue);
        const empty = value.count === 0 && !active;
        return (
          <label
            key={value.id}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted",
              empty && "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
          >
            <Checkbox
              checked={active}
              disabled={empty}
              onCheckedChange={() => toggleValue(key, paramValue)}
            />
            <span className="flex-1 text-sm">{value.label}</span>
            <span className="text-xs text-white/55 tabular-nums">
              {value.count}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ColorControl({ facet }: { facet: ProductFilterFacet }) {
  const { isActive, toggleValue } = useRefine();
  const key = facetToParamKey(facet);

  return (
    <div className="flex flex-wrap gap-3 py-1">
      {facet.values.map((value) => (
        <ColorSwatch
          key={value.id}
          value={value}
          active={isActive(key, paramValueForFacetValue(facet, value))}
          onToggle={() =>
            toggleValue(key, paramValueForFacetValue(facet, value))
          }
        />
      ))}
    </div>
  );
}

function ColorSwatch({
  value,
  active,
  onToggle,
}: {
  value: ProductFilterValue;
  active: boolean;
  onToggle: () => void;
}) {
  const colors = swatchColors(value.label);
  const empty = value.count === 0 && !active;
  const background =
    colors.length === 2
      ? `linear-gradient(135deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)`
      : colors[0];

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={empty}
      aria-pressed={active}
      title={`${value.label} · ${value.count}`}
      className={cn(
        "group flex w-14 flex-col items-center gap-1.5 outline-none disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <span
        style={background ? { background } : undefined}
        className={cn(
          "relative flex size-8 items-center justify-center rounded-full ring-1 ring-foreground/15 ring-offset-2 ring-offset-popover transition-all group-hover:ring-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-ring",
          !background && "bg-muted text-[10px] font-medium text-white/55",
          active && "ring-2 ring-primary group-hover:ring-primary",
        )}
      >
        {!background && value.label.slice(0, 2)}
        {active && (
          <CheckIcon
            className={cn(
              "size-4 drop-shadow",
              colors[0] && isLight(colors[0]) ? "text-black" : "text-white",
            )}
          />
        )}
      </span>
      <span className="line-clamp-1 text-center text-[11px] leading-tight text-white/55">
        {value.label}
      </span>
    </button>
  );
}

function PriceControl({ facet }: { facet: ProductFilterFacet }) {
  const { searchParams, setPrice } = useRefine();
  const bounds = priceBoundsFromFacet(facet);
  const priceParam = searchParams.get("price");

  const initial = parsePriceParam(priceParam ?? undefined) ?? bounds;
  const [range, setRange] = useState<[number, number]>([
    initial?.min ?? 0,
    initial?.max ?? 0,
  ]);

  // Re-sync local slider state when the URL price (or facet bounds) changes.
  useEffect(() => {
    const next = parsePriceParam(priceParam ?? undefined) ?? bounds;
    if (next) setRange([next.min, next.max]);
  }, [priceParam, bounds?.min, bounds?.max]);

  if (!bounds) return null;

  if (bounds.min === bounds.max) {
    return (
      <p className="px-1 py-1 text-sm text-white/55">
        Todas las combas cuestan {eur.format(bounds.min)}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1 pt-2 pb-1">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{eur.format(range[0])}</span>
        <span className="text-white/55">—</span>
        <span>{eur.format(range[1])}</span>
      </div>
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={range}
        onValueChange={(value) => {
          if (Array.isArray(value)) setRange([value[0] ?? 0, value[1] ?? 0]);
        }}
        onValueCommitted={(value) => {
          if (Array.isArray(value)) setPrice(value[0] ?? 0, value[1] ?? 0);
        }}
      />
    </div>
  );
}

// Rough perceived-lightness check to pick a contrasting check-mark color.
function isLight(hex: string): boolean {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
