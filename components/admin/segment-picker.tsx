"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { UsersIcon } from "lucide-react";
import { countAudienceAction } from "@/lib/crm/actions";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ACTIVITY_DAYS,
  VIP_MIN_DEFAULT,
  type SegmentFacets,
} from "@/lib/crm/segments";

// Picker de segmento por facetas (§16.2) para el formulario de campaña.
// Serializa las facetas en un hidden input (segment_json) y muestra el
// recuento en vivo de la audiencia.

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const FUENTES = [
  ["", "Todas las fuentes"],
  ["sticky_bar", "Barra de captación"],
  ["checkout", "Checkout"],
  ["import", "Importación"],
  ["manual", "Manual"],
] as const;

export function SegmentPicker({
  defaultFacets,
}: {
  defaultFacets: SegmentFacets;
}) {
  const [facets, setFacets] = useState<SegmentFacets>(defaultFacets);
  const [count, setCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          setCount(await countAudienceAction(facets));
        } catch {
          setCount(null);
        }
      });
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [facets]);

  function patch(next: Partial<SegmentFacets>) {
    setFacets((prev) => {
      const merged = { ...prev, ...next };
      // limpiar claves vacías para que {} siga significando "todos"
      for (const key of Object.keys(merged) as (keyof SegmentFacets)[]) {
        const value = merged[key];
        if (value === undefined || value === "" || value === 0) {
          delete merged[key];
        }
      }
      return merged;
    });
  }

  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>Segmento</FieldLabel>
        <Badge variant="outline" className="gap-1.5">
          {pending ? (
            <Spinner className="size-3" />
          ) : (
            <UsersIcon className="size-3" aria-hidden />
          )}
          {count === null ? "—" : count}{" "}
          {count === 1 ? "destinatario" : "destinatarios"} ahora mismo
        </Badge>
      </div>

      <input type="hidden" name="segment_json" value={JSON.stringify(facets)} />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <select
          aria-label="Tipo de contacto"
          className={selectClass}
          value={facets.tipo ?? ""}
          onChange={(e) =>
            patch({
              tipo: (e.target.value || undefined) as SegmentFacets["tipo"],
            })
          }
        >
          <option value="">Todos (leads y clientes)</option>
          <option value="lead">Leads — sin pedidos</option>
          <option value="cliente">Clientes — ≥1 pedido</option>
          <option value="repetidor">Repetidores — ≥2 pedidos</option>
          <option value="vip">VIP — por gasto</option>
        </select>

        <select
          aria-label="Actividad de email"
          className={selectClass}
          value={facets.actividad ?? ""}
          onChange={(e) =>
            patch({
              actividad: (e.target.value || undefined) as
                | "activos"
                | "dormidos"
                | undefined,
            })
          }
        >
          <option value="">Cualquier actividad</option>
          <option value="activos">Activos — abren/clican ≤{ACTIVITY_DAYS} d</option>
          <option value="dormidos">Dormidos — nada en {ACTIVITY_DAYS} d</option>
        </select>

        <select
          aria-label="Fuente"
          className={selectClass}
          value={facets.fuente ?? ""}
          onChange={(e) => patch({ fuente: e.target.value || undefined })}
        >
          {FUENTES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label="Antigüedad del alta"
          className={selectClass}
          value={facets.alta_dias ? String(facets.alta_dias) : ""}
          onChange={(e) =>
            patch({
              alta_dias: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        >
          <option value="">Cualquier fecha de alta</option>
          <option value="7">Alta en los últimos 7 días</option>
          <option value="30">Alta en los últimos 30 días</option>
          <option value="90">Alta en los últimos 90 días</option>
        </select>

        <Input
          aria-label="Tag"
          placeholder="Tag (p. ej. club)"
          value={facets.tag ?? ""}
          onChange={(e) => patch({ tag: e.target.value || undefined })}
        />

        <Input
          aria-label="Compró con código"
          placeholder="Compró con código (p. ej. PAAT20)"
          value={facets.codigo ?? ""}
          onChange={(e) =>
            patch({ codigo: e.target.value.toUpperCase() || undefined })
          }
        />
      </div>

      {facets.tipo === "vip" ? (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Gasto mínimo VIP"
            type="number"
            min={1}
            className="w-28"
            value={facets.vip_min ?? VIP_MIN_DEFAULT}
            onChange={(e) =>
              patch({ vip_min: Number(e.target.value) || undefined })
            }
          />
          <span className="text-sm text-muted-foreground">
            € de gasto acumulado para contar como VIP
          </span>
        </div>
      ) : null}

      <FieldDescription>
        Las facetas se combinan entre sí. Los suprimidos quedan fuera siempre;
        la lista real se congela al enviar.
      </FieldDescription>
    </Field>
  );
}
