import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { CartsTable } from "@/components/admin/carts-table";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatMoney } from "@/lib/crm/format";
import { getCartsData } from "@/lib/crm/queries";

export const metadata = { title: "Carritos" };

const nf = new Intl.NumberFormat("es-ES");

const FILTERS: { key?: string; label: string }[] = [
  { label: "Todos" },
  { key: "abandoned", label: "Abandonados" },
  { key: "reached_checkout", label: "En checkout" },
  { key: "recovered", label: "Recuperados" },
  { key: "converted", label: "Convertidos" },
];

export default async function CartsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { carts, total, page, perPage, kpis } = await getCartsData({
    estado: sp.estado,
    page: Number(sp.page) || 1,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allCount =
    kpis.abandoned + kpis.reachedCheckout + kpis.recovered + kpis.converted;
  const recoveryRate =
    kpis.contacted > 0
      ? Math.round((kpis.recovered / kpis.contacted) * 100)
      : null;

  const countFor = (key?: string) =>
    key === "abandoned"
      ? kpis.abandoned
      : key === "reached_checkout"
        ? kpis.reachedCheckout
        : key === "recovered"
          ? kpis.recovered
          : key === "converted"
            ? kpis.converted
            : allCount;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (sp.estado) params.set("estado", sp.estado);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/carts${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Carritos"
        description={`${nf.format(total)} ${sp.estado ? "con este estado" : "en total"} · checkouts de Shopify y carritos de la web identificados`}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Abandonados ahora</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {nf.format(kpis.abandoned)}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">
              Contactados por email
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {nf.format(kpis.contacted)}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Recuperados</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {nf.format(kpis.recovered)}
              {kpis.recoveredRevenue > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {formatMoney(kpis.recoveredRevenue)}
                </span>
              ) : null}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">
              Tasa de recuperación
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {recoveryRate === null ? "—" : `${recoveryRate}%`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => {
            const active = (sp.estado ?? undefined) === filter.key;
            const href = filter.key
              ? `/admin/carts?estado=${filter.key}`
              : "/admin/carts";
            return (
              <Button
                key={filter.label}
                variant={active ? "secondary" : "outline"}
                size="sm"
                render={<Link href={href} />}
              >
                {filter.label}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {nf.format(countFor(filter.key))}
                </Badge>
              </Button>
            );
          })}
        </div>

        {carts.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingCartIcon />
              </EmptyMedia>
              <EmptyTitle>
                {sp.estado ? "Nada con este estado" : "Aún no hay carritos"}
              </EmptyTitle>
              <EmptyDescription>
                {sp.estado
                  ? "Prueba con otro filtro."
                  : "Aquí aparecen los checkouts de Shopify (webhook al instante) y los carritos de la web de visitantes identificados — quienes llegan desde un enlace de email del CRM o se suscriben. Los emails de recuperación salen de la automatización «Recuperación de carrito»."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <CartsTable carts={carts} />

            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    render={
                      page > 1 ? <Link href={pageUrl(page - 1)} /> : undefined
                    }
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    render={
                      page < totalPages ? (
                        <Link href={pageUrl(page + 1)} />
                      ) : undefined
                    }
                  >
                    Siguiente
                    <ChevronRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
