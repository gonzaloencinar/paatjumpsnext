import { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChartSplineIcon,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/crm/format";
import { getStoreAnalytics, type BreakdownRow } from "@/lib/crm/store-queries";

export const metadata = { title: "Analítica" };

const nf = new Intl.NumberFormat("es-ES");
const nf1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

const PERIODS = [
  { key: "30", label: "30 días", days: 30 },
  { key: "90", label: "90 días", days: 90 },
  { key: "365", label: "12 meses", days: 365 },
  { key: "all", label: "Todo", days: null },
] as const;

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  const up = pct > 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={`inline-flex items-center gap-1 ${up ? "text-orange-400" : "text-muted-foreground"}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {nf.format(pct)}% vs periodo anterior
    </span>
  );
}

// Tabla de desglose con barra de proporción (la barra es refuerzo visual; el
// dato siempre está en texto)
function BreakdownTable({
  rows,
  totalRevenue,
  keyHeader,
  emptyLabel,
}: {
  rows: BreakdownRow[];
  totalRevenue: number;
  keyHeader: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{keyHeader}</TableHead>
          <TableHead className="text-right">Pedidos</TableHead>
          <TableHead className="text-right">Ingresos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const share = totalRevenue > 0 ? row.revenue / totalRevenue : 0;
          return (
            <TableRow key={row.key}>
              <TableCell>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate">
                    {row.key}
                    {row.detail ? (
                      <span className="text-muted-foreground">
                        {" "}
                        / {row.detail}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className="h-1 rounded-full bg-primary/25"
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {nf.format(row.orders)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <div className="flex flex-col items-end">
                  <span>{formatMoney(row.revenue)}</span>
                  <span className="text-xs text-muted-foreground">
                    {nf.format(Math.round(share * 100))}%
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const period = PERIODS.find((p) => p.key === (sp.p ?? "30")) ?? PERIODS[0];
  const data = await getStoreAnalytics(period.days);

  const kpis: { label: string; value: string; hint: ReactNode }[] = [
    {
      label: "Ingresos netos",
      value: formatMoney(data.period.revenue),
      hint: (
        <Delta
          current={data.period.revenue}
          previous={data.period.prevRevenue}
        />
      ),
    },
    {
      label: "Pedidos",
      value: nf.format(data.period.orders),
      hint: (
        <span className="inline-flex flex-wrap gap-x-2">
          <Delta
            current={data.period.orders}
            previous={data.period.prevOrders}
          />
          {data.period.withDiscount > 0 ? (
            <span>
              {nf.format(data.period.withDiscount)} con código
            </span>
          ) : null}
        </span>
      ),
    },
    {
      label: "Pedido medio (AOV)",
      value: data.period.orders ? formatMoney(data.period.aov) : "—",
      hint: "Ingresos netos / pedidos del periodo",
    },
    {
      label: "Upsell post-compra",
      value: formatMoney(data.period.upsellRevenue),
      hint:
        data.period.upsellOrders > 0 ? (
          <span className="inline-flex flex-wrap gap-x-2">
            <span>
              {nf.format(data.period.upsellOrders)}{" "}
              {data.period.upsellOrders === 1 ? "pedido" : "pedidos"} ·{" "}
              {nf1.format(
                (data.period.upsellOrders / data.period.orders) * 100,
              )}
              % de aceptación
            </span>
            <Delta
              current={data.period.upsellRevenue}
              previous={data.period.prevUpsellRevenue}
            />
          </span>
        ) : (
          "Oferta 1-clic tras el pago (ReConvert)"
        ),
    },
    {
      label: "Clientes del periodo",
      value: nf.format(data.period.newCustomers + data.period.returningCustomers),
      hint: `${nf.format(data.period.newCustomers)} nuevos · ${nf.format(
        data.period.returningCustomers,
      )} recurrentes`,
    },
    {
      label: "LTV medio",
      value: data.lifetime.customers ? formatMoney(data.lifetime.avgLtv) : "—",
      hint: `Histórico · ${nf.format(data.lifetime.customers)} clientes`,
    },
    {
      label: "Clientes que repiten",
      value: `${nf.format(Math.round(data.lifetime.repeatRate * 100))}%`,
      hint: "Con 2+ pedidos sobre el total histórico",
    },
    {
      label: "Pedidos por cliente",
      value: nf1.format(data.lifetime.ordersPerCustomer || 0),
      hint: "Media histórica (recurrencia)",
    },
    {
      label: "Días hasta recompra",
      value:
        data.lifetime.medianDaysFirstToSecond !== null
          ? nf.format(Math.round(data.lifetime.medianDaysFirstToSecond))
          : "—",
      hint: "Mediana entre 1º y 2º pedido",
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Analítica"
        description="Ventas, clientes y atribución UTM de la tienda"
        actions={
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={p.key === period.key ? "secondary" : "ghost"}
                render={<Link href={`/admin/analytics?p=${p.key}`} />}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {data.totalOrdersEver === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartSplineIcon />
              </EmptyMedia>
              <EmptyTitle>Sin pedidos que analizar todavía</EmptyTitle>
              <EmptyDescription>
                En cuanto el cron shopify-sync traiga pedidos (necesita los
                scopes read_orders y read_customers en la custom app) esta
                página se llena sola: ingresos, AOV, LTV, recurrencia,
                geografía y atribución UTM.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((stat, i) => (
                <Card
                  key={stat.label}
                  className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <CardHeader>
                    <CardDescription>{stat.label}</CardDescription>
                    <CardTitle className="text-3xl tracking-tight tabular-nums">
                      {stat.value}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {stat.hint}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Ingresos</CardTitle>
                <CardDescription>
                  {period.days
                    ? `Últimos ${period.label}`
                    : "Todo el histórico"}{" "}
                  · netos de reembolsos, por{" "}
                  {data.series.daily ? "día" : "mes"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueChart data={data.series.points} />
              </CardContent>
            </Card>

            <div className="grid items-start gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Fuente de los pedidos</CardTitle>
                  <CardDescription>
                    Último clic (UTM source / medium) del periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownTable
                    rows={data.sources}
                    totalRevenue={data.period.revenue}
                    keyHeader="Fuente"
                    emptyLabel="Sin datos de atribución en el periodo."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Campañas (UTM)</CardTitle>
                  <CardDescription>
                    utm_campaign de los pedidos del periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownTable
                    rows={data.campaigns}
                    totalRevenue={data.period.revenue}
                    keyHeader="Campaña"
                    emptyLabel="Ningún pedido con utm_campaign en el periodo."
                  />
                  {data.firstTouchSources.length > 0 ? (
                    <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                      <p className="mb-1 font-medium text-foreground">
                        Primer touch (descubrimiento)
                      </p>
                      <p className="flex flex-wrap gap-x-3 gap-y-1">
                        {data.firstTouchSources.map((row) => (
                          <span key={row.key}>
                            {row.key}{" "}
                            <span className="tabular-nums">
                              ({nf.format(row.orders)})
                            </span>
                          </span>
                        ))}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Provincias (España)</CardTitle>
                  <CardDescription>
                    Según dirección de envío del periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownTable
                    rows={data.provinces}
                    totalRevenue={data.period.revenue}
                    keyHeader="Provincia"
                    emptyLabel="Sin pedidos con envío a España en el periodo."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Países</CardTitle>
                  <CardDescription>
                    Según dirección de envío del periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownTable
                    rows={data.countries}
                    totalRevenue={data.period.revenue}
                    keyHeader="País"
                    emptyLabel="Sin direcciones de envío en el periodo."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top productos</CardTitle>
                  <CardDescription>
                    Por ingresos de línea del periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin líneas de pedido en el periodo.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-right">
                            Unidades
                          </TableHead>
                          <TableHead className="text-right">
                            Ingresos
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.products.map((product) => (
                          <TableRow key={product.title}>
                            <TableCell className="max-w-64 truncate">
                              {product.title}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {nf.format(product.units)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatMoney(product.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Códigos de descuento</CardTitle>
                  <CardDescription>
                    Usos e ingresos asociados en el periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.discountCodes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Ningún pedido con código en el periodo.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {data.discountCodes.map((code) => (
                        <div
                          key={code.key}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <Badge variant="outline">{code.key}</Badge>
                          <span className="text-muted-foreground tabular-nums">
                            {nf.format(code.orders)}{" "}
                            {code.orders === 1 ? "pedido" : "pedidos"} ·{" "}
                            {formatMoney(code.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
