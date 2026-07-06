"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { PACKLINK_PHASE } from "@/lib/crm/format";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Toolbar de /admin/orders: los filtros se aplican al cambiar (router.push →
// re-render del server component), sin botón de "Filtrar". Mismo patrón que
// ContactsToolbar.

export function OrdersToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const envio = searchParams.get("envio") ?? "all";
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";
  const recogida = searchParams.get("recogida") ?? "";
  const rdesde = searchParams.get("rdesde") ?? "";
  const rhasta = searchParams.get("rhasta") ?? "";
  const urgente = searchParams.get("urgente") === "1";

  // "rango" se mantiene abierto aunque aún no haya fechas elegidas
  const [rangeMode, setRangeMode] = useState(Boolean(rdesde || rhasta));
  const recogidaValue =
    rdesde || rhasta || rangeMode ? "rango" : recogida ? recogida : "all";

  function apply(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative w-full sm:max-w-52"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("q");
          apply({ q: String(value ?? "").trim() || undefined });
        }}
      >
        <SearchIcon
          aria-hidden
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          key={q}
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Email o nº de pedido…"
          aria-label="Buscar pedidos"
          className="pl-8"
        />
      </form>

      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Pedido
        <Input
          type="date"
          value={desde}
          onChange={(event) =>
            apply({ desde: event.target.value || undefined })
          }
          aria-label="Fecha de pedido desde"
          className="w-34"
        />
        –
        <Input
          type="date"
          value={hasta}
          onChange={(event) =>
            apply({ hasta: event.target.value || undefined })
          }
          aria-label="Fecha de pedido hasta"
          className="w-34"
        />
      </label>

      <Select
        value={envio}
        onValueChange={(value) => apply({ envio: String(value ?? "all") })}
      >
        <SelectTrigger className="w-44" aria-label="Estado del envío">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Envío: todos</SelectItem>
            <SelectItem value="sin">Sin envío</SelectItem>
            {Object.entries(PACKLINK_PHASE).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={recogidaValue}
        onValueChange={(value) => {
          const next = String(value ?? "all");
          if (next === "rango") {
            setRangeMode(true);
            if (recogida) apply({ recogida: undefined });
          } else {
            setRangeMode(false);
            apply({
              recogida: next === "all" ? undefined : next,
              rdesde: undefined,
              rhasta: undefined,
            });
          }
        }}
      >
        <SelectTrigger className="w-44" aria-label="Fecha de recogida">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Recogida: todas</SelectItem>
            <SelectItem value="hoy">Recogida hoy</SelectItem>
            <SelectItem value="manana">Recogida mañana</SelectItem>
            <SelectItem value="rango">Recogida: rango…</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {recogidaValue === "rango" ? (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <Input
            type="date"
            value={rdesde}
            onChange={(event) =>
              apply({
                rdesde: event.target.value || undefined,
                recogida: undefined,
              })
            }
            aria-label="Recogida desde"
            className="w-34"
          />
          –
          <Input
            type="date"
            value={rhasta}
            onChange={(event) =>
              apply({
                rhasta: event.target.value || undefined,
                recogida: undefined,
              })
            }
            aria-label="Recogida hasta"
            className="w-34"
          />
        </label>
      ) : null}

      <label className="flex cursor-pointer items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={urgente}
          onChange={(event) =>
            apply({ urgente: event.target.checked ? "1" : undefined })
          }
          className="size-3.5 accent-orange-400"
        />
        Urgente 24h
      </label>
    </div>
  );
}
