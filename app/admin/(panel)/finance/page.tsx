import Link from "next/link";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ScaleIcon,
  WalletIcon,
} from "lucide-react";
import {
  DeleteFinanceEntryButton,
  DeleteRecurringButton,
  FinanceEntryDialog,
  FinanceRecurringDialog,
  IrpfDialog,
  RecurringActiveSwitch,
} from "@/components/admin/finance";
import { PageHeader } from "@/components/admin/page-header";
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
import {
  addMonths,
  getFinanceData,
  monthLabel,
  type Partner,
} from "@/lib/crm/finance";
import {
  FINANCE_FREQUENCIES,
  FINANCE_PARTNER_LABEL,
  formatDate,
  formatMoney,
} from "@/lib/crm/format";

export const metadata = { title: "Finanzas" };

const pctf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

function PartnerBadge({ partner }: { partner: string }) {
  const label = FINANCE_PARTNER_LABEL[partner as Partner] ?? partner;
  return (
    <Badge variant={partner === "gonzalo" ? "outline" : "secondary"}>
      {label}
    </Badge>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const data = await getFinanceData(sp.mes);
  const {
    month,
    currentMonth,
    irpfPct,
    globalIrpfPct,
    irpfOverridden,
    shopify,
    entries,
    projected,
    totals,
    packlink,
    genei,
  } = data;
  const shippingCost = packlink.cost + genei.cost;

  const isFuture = month > currentMonth;
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultDate = month === currentMonth ? todayIso : `${month}-01`;

  const movements = [
    ...entries.map((entry) => ({ entry, projected: false as const })),
    ...projected.map((occ) => ({
      entry: {
        id: `${occ.recurring_id}-${occ.period}`,
        type: occ.type,
        concept: occ.concept,
        amount: occ.amount,
        partner: occ.partner,
        entry_date: occ.entry_date,
        notes: null,
        recurring_id: occ.recurring_id,
        period: occ.period,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
      projected: true as const,
    })),
  ].sort((a, b) => a.entry.entry_date.localeCompare(b.entry.entry_date));

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Finanzas"
        description="Ingresos, gastos y cuadre mensual entre socios"
        actions={
          <>
            <FinanceRecurringDialog today={todayIso} />
            <FinanceEntryDialog defaultDate={defaultDate} />
          </>
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {/* Navegación de mes */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mes anterior"
            render={
              <Link href={`/admin/finance?mes=${addMonths(month, -1)}`} />
            }
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-36 text-center text-sm font-semibold">
            {monthLabel(month)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mes siguiente"
            render={<Link href={`/admin/finance?mes=${addMonths(month, 1)}`} />}
          >
            <ChevronRightIcon />
          </Button>
          {month !== currentMonth ? (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/admin/finance" />}
            >
              Hoy
            </Button>
          ) : null}
          {isFuture ? (
            <Badge variant="outline">Proyección con recurrentes</Badge>
          ) : null}
        </div>

        {/* KPIs del mes */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Ingresos</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatMoney(totals.income)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
                <div className="flex justify-between gap-2">
                  <dt>Shopify cobrado ({shopify.orders} ped., IVA incl.)</dt>
                  <dd>{formatMoney(shopify.gross)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>IVA</dt>
                  <dd>−{formatMoney(shopify.gross - shopify.net)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Shopify sin IVA</dt>
                  <dd>{formatMoney(shopify.net)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Ingresos manuales</dt>
                  <dd>{formatMoney(totals.manualIncome)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Gastos</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatMoney(totals.expenses)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
                <div className="flex justify-between gap-2">
                  <dt>
                    Envíos Packlink sin IVA ({packlink.count} env., Gonzalo)
                  </dt>
                  <dd>−{formatMoney(packlink.cost)}</dd>
                </div>
                {genei.count > 0 || genei.cost > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt>Envíos Genei sin IVA ({genei.count} env., Gonzalo)</dt>
                    <dd>−{formatMoney(genei.cost)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt>Otros gastos</dt>
                  <dd>−{formatMoney(totals.expenses - shippingCost)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Beneficio bruto</dt>
                  <dd>{formatMoney(totals.gross)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1">
                IRPF ({pctf.format(irpfPct)}%)
                {irpfOverridden && irpfPct !== globalIrpfPct ? (
                  <Badge variant="outline">fijado</Badge>
                ) : null}
                <IrpfDialog
                  month={month}
                  monthLabel={monthLabel(month)}
                  globalIrpfPct={globalIrpfPct}
                  monthIrpfPct={irpfPct}
                  irpfOverridden={irpfOverridden}
                />
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                −{formatMoney(totals.irpf)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Tipo marginal de Gonzalo; la reserva la retiene él
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Beneficio neto a repartir</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {formatMoney(totals.netProfit)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {formatMoney(totals.share)} por socio
            </CardContent>
          </Card>
        </div>

        {/* Cuadre */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScaleIcon className="size-4" aria-hidden />
              Cuadre del mes
            </CardTitle>
            <CardDescription>
              Cobrado − gastos adelantados − reserva IRPF − mitad del beneficio
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(totals.partners) as Partner[]).map((partner) => {
                const b = totals.partners[partner];
                return (
                  <div key={partner} className="rounded-xl border p-4">
                    <p className="mb-2 font-medium">
                      {FINANCE_PARTNER_LABEL[partner]}
                    </p>
                    <dl className="flex flex-col gap-1 text-sm tabular-nums">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Ha cobrado</dt>
                        <dd>{formatMoney(b.received)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Gastos que adelantó
                        </dt>
                        <dd>−{formatMoney(b.paidExpenses)}</dd>
                      </div>
                      {b.irpfReserve > 0 ? (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">
                            Reserva IRPF
                          </dt>
                          <dd>−{formatMoney(b.irpfReserve)}</dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Su mitad del beneficio
                        </dt>
                        <dd>−{formatMoney(b.share)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                        <dt>Saldo</dt>
                        <dd>{formatMoney(b.balance)}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <ArrowRightIcon className="size-4 text-orange-400" aria-hidden />
              {totals.transfer
                ? `${FINANCE_PARTNER_LABEL[totals.transfer.from]} transfiere ${formatMoney(totals.transfer.amount)} a ${FINANCE_PARTNER_LABEL[totals.transfer.to]}`
                : "Mes cuadrado: nadie debe nada."}
            </p>
          </CardContent>
        </Card>

        {/* Movimientos del mes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movimientos</CardTitle>
            <CardDescription>
              Gastos e ingresos manuales y recurrentes del mes (las ventas de
              Shopify se suman aparte)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {movements.length === 0 && shippingCost <= 0 ? (
              <Empty className="rounded-xl border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WalletIcon />
                  </EmptyMedia>
                  <EmptyTitle>Sin movimientos</EmptyTitle>
                  <EmptyDescription>
                    Añade un gasto o ingreso manual, o crea un recurrente para
                    que se genere solo cada mes.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Socio</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Fecha
                      </TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead className="w-20 text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        { label: "Envíos Packlink", summary: packlink },
                        { label: "Envíos Genei", summary: genei },
                      ] as const
                    ).map(({ label, summary }) =>
                      summary.cost > 0 ? (
                        <TableRow key={label}>
                          <TableCell>
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate font-medium">
                                {label}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Badge variant="outline">Automático</Badge>
                                <span className="truncate text-xs text-muted-foreground">
                                  {summary.count} envíos del mes, sin IVA
                                </span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Gasto</Badge>
                          </TableCell>
                          <TableCell>
                            <PartnerBadge partner="gonzalo" />
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                            Todo el mes
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            −{formatMoney(summary.cost)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      ) : null,
                    )}
                    {movements.map(({ entry, projected: isProjected }) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-medium">
                              {entry.concept}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {entry.recurring_id ? (
                                <Badge variant="outline">Recurrente</Badge>
                              ) : null}
                              {isProjected ? (
                                <Badge variant="secondary">Previsto</Badge>
                              ) : null}
                              {entry.notes ? (
                                <span className="truncate text-xs text-muted-foreground">
                                  {entry.notes}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.type === "income" ? (
                            <Badge>Ingreso</Badge>
                          ) : (
                            <Badge variant="secondary">Gasto</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <PartnerBadge partner={entry.partner} />
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground tabular-nums md:table-cell">
                          {formatDate(entry.entry_date)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {entry.type === "income" ? "+" : "−"}
                          {formatMoney(entry.amount)}
                        </TableCell>
                        <TableCell>
                          {!isProjected ? (
                            <div className="flex justify-end gap-1">
                              <FinanceEntryDialog
                                entry={entry}
                                defaultDate={defaultDate}
                              />
                              <DeleteFinanceEntryButton entry={entry} />
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recurrentes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recurrentes</CardTitle>
            <CardDescription>
              Se generan solos como movimiento del mes que toque, el día
              configurado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recurrings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin recurrentes. Crea uno con &ldquo;Nuevo recurrente&rdquo;
                (Shopify, dominio, gestoría…).
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Periodicidad</TableHead>
                      <TableHead>Socio</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Vigencia
                      </TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead className="w-20 text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recurrings.map((recurring) => (
                      <TableRow key={recurring.id}>
                        <TableCell>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-medium">
                              {recurring.concept}
                            </span>
                            {recurring.type === "income" ? (
                              <Badge className="w-fit">Ingreso</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {FINANCE_FREQUENCIES[recurring.frequency]?.label ??
                            recurring.frequency}{" "}
                          <span className="text-xs text-muted-foreground">
                            (día {recurring.day_of_month})
                          </span>
                        </TableCell>
                        <TableCell>
                          <PartnerBadge partner={recurring.partner} />
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground tabular-nums md:table-cell">
                          {formatDate(recurring.starts_on)} →{" "}
                          {recurring.ends_on
                            ? formatDate(recurring.ends_on)
                            : "sin fin"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(recurring.amount)}
                        </TableCell>
                        <TableCell>
                          <RecurringActiveSwitch recurring={recurring} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <FinanceRecurringDialog
                              recurring={recurring}
                              today={todayIso}
                            />
                            <DeleteRecurringButton recurring={recurring} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen del año */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Resumen {month.slice(0, 4)}
            </CardTitle>
            <CardDescription>
              Cuadre de cada mes con su tipo de IRPF (los pasados conservan el
              tipo que tenían)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      IRPF
                    </TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Cuadre
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.yearRows.map((row) => (
                    <TableRow
                      key={row.month}
                      className={
                        row.month === month ? "bg-muted/40" : undefined
                      }
                    >
                      <TableCell>
                        <Link
                          href={`/admin/finance?mes=${row.month}`}
                          className="font-medium hover:text-orange-400"
                        >
                          {monthLabel(row.month)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.income)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.expenses)}
                      </TableCell>
                      <TableCell className="hidden text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
                        {pctf.format(row.irpfPct)}%
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(row.netProfit)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {row.transfer
                          ? `${FINANCE_PARTNER_LABEL[row.transfer.from]} → ${FINANCE_PARTNER_LABEL[row.transfer.to]} ${formatMoney(row.transfer.amount)}`
                          : "Cuadrado"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Ingresos de Shopify: pedidos cobrados y no cancelados, sin IVA y
              netos de reembolsos, atribuidos a Gonzalo. Envíos: coste real sin
              IVA de las etiquetas compradas en Packlink (sync automático cada
              hora), imputado a Gonzalo. El % de IRPF se aplica solo a su base
              (sus ingresos − sus gastos deducibles) antes del reparto al 50%;
              lo de Patri entra ya limpio.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
