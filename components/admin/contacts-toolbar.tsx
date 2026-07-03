"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";
import { createCampaignFromFacets } from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTACT_STATUS } from "@/lib/crm/format";
import { ACTIVITY_DAYS, type SegmentFacets } from "@/lib/crm/segments";

export function ContactsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "all";
  const tipo = searchParams.get("tipo") ?? "all";
  const actividad = searchParams.get("actividad") ?? "all";
  const fuente = searchParams.get("fuente") ?? "all";
  const alta = searchParams.get("alta") ?? "all";
  const tag = searchParams.get("tag") ?? "";

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

  // Facetas activas → campaña (el borrador nace con este segmento)
  function campaignFromFilter() {
    const facets: SegmentFacets = {};
    if (["lead", "cliente", "repetidor", "vip"].includes(tipo)) {
      facets.tipo = tipo as SegmentFacets["tipo"];
    }
    if (actividad === "activos" || actividad === "dormidos") {
      facets.actividad = actividad;
    }
    if (fuente !== "all") facets.fuente = fuente;
    if (alta !== "all") facets.alta_dias = Number(alta);
    if (tag) facets.tag = tag;
    startTransition(async () => {
      try {
        await createCampaignFromFacets(facets);
      } catch {
        toast.error("No se pudo crear la campaña");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="w-full sm:max-w-56"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("q");
          apply({ q: String(value ?? "").trim() });
        }}
      >
        <Input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Buscar por email o nombre…"
          aria-label="Buscar contactos"
        />
      </form>

      <Select
        value={status}
        onValueChange={(value) => apply({ status: String(value ?? "all") })}
      >
        <SelectTrigger className="w-40" aria-label="Filtrar por estado">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(CONTACT_STATUS).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={tipo}
        onValueChange={(value) => apply({ tipo: String(value ?? "all") })}
      >
        <SelectTrigger className="w-44" aria-label="Filtrar por tipo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Leads y clientes</SelectItem>
            <SelectItem value="lead">Leads — sin pedidos</SelectItem>
            <SelectItem value="cliente">Clientes — ≥1 pedido</SelectItem>
            <SelectItem value="repetidor">Repetidores — ≥2</SelectItem>
            <SelectItem value="vip">VIP — por gasto</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={actividad}
        onValueChange={(value) => apply({ actividad: String(value ?? "all") })}
      >
        <SelectTrigger className="w-44" aria-label="Filtrar por actividad">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Cualquier actividad</SelectItem>
            <SelectItem value="activos">
              Activos ≤{ACTIVITY_DAYS} d
            </SelectItem>
            <SelectItem value="dormidos">
              Dormidos &gt;{ACTIVITY_DAYS} d
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={fuente}
        onValueChange={(value) => apply({ fuente: String(value ?? "all") })}
      >
        <SelectTrigger className="w-40" aria-label="Filtrar por fuente">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Todas las fuentes</SelectItem>
            <SelectItem value="sticky_bar">Barra de captación</SelectItem>
            <SelectItem value="checkout">Checkout</SelectItem>
            <SelectItem value="import">Importación</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={alta}
        onValueChange={(value) => apply({ alta: String(value ?? "all") })}
      >
        <SelectTrigger className="w-40" aria-label="Filtrar por alta">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Cualquier alta</SelectItem>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <form
        className="w-32"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("tag");
          apply({ tag: String(value ?? "").trim() });
        }}
      >
        <Input
          key={tag}
          name="tag"
          defaultValue={tag}
          placeholder="Tag…"
          aria-label="Filtrar por tag"
        />
      </form>

      <Button
        variant="outline"
        size="sm"
        onClick={campaignFromFilter}
        disabled={pending}
        title="Crea un borrador de campaña con las facetas activas como segmento"
      >
        <SendIcon data-icon="inline-start" />
        Crear campaña con este filtro
      </Button>
    </div>
  );
}
