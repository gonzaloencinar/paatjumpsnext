import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ContactRoundIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "lucide-react";
import { EmailCustomerButton } from "@/components/admin/contact-actions";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/crm/format";
import { listCustomers, shopifyAdminUrl } from "@/lib/crm/store-queries";

export const metadata = { title: "Clientes" };

const nf = new Intl.NumberFormat("es-ES");

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { customers, lastOrderAt, total, page, perPage } = await listCustomers({
    q: sp.q,
    page: Number(sp.page) || 1,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const filtering = Boolean(sp.q);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/customers${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Clientes"
        description={`${nf.format(total)} ${filtering ? "resultados" : "en total"} · ordenados por gasto total`}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <form action="/admin/customers" className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <SearchIcon
              aria-hidden
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Buscar por email o nombre…"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
          {filtering ? (
            <Button variant="ghost" render={<Link href="/admin/customers" />}>
              Limpiar
            </Button>
          ) : null}
        </form>

        {customers.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ContactRoundIcon />
              </EmptyMedia>
              <EmptyTitle>
                {filtering ? "Sin resultados" : "Aún no hay clientes"}
              </EmptyTitle>
              <EmptyDescription>
                {filtering
                  ? "Prueba con otra búsqueda."
                  : "El cron shopify-sync trae los clientes de Shopify cada 10 minutos. Si la tabla sigue vacía, revisa que la custom app tenga el scope read_customers."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Gasto total</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Ticket medio
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Ubicación
                    </TableHead>
                    <TableHead className="hidden xl:table-cell">
                      Email mkt.
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Último pedido
                    </TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => {
                    const name = [customer.first_name, customer.last_name]
                      .filter(Boolean)
                      .join(" ");
                    const last = lastOrderAt.get(customer.id);
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <a
                            href={shopifyAdminUrl(`customers/${customer.id}`)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="flex min-w-0 flex-col transition-colors hover:text-orange-400"
                          >
                            <span className="inline-flex items-center gap-1 truncate font-medium">
                              {customer.email ?? (name || `#${customer.id}`)}
                              <ExternalLinkIcon
                                aria-hidden
                                className="size-3 text-muted-foreground"
                              />
                            </span>
                            {(name && customer.email) || customer.phone ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {[
                                  name && customer.email ? name : null,
                                  customer.phone,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            ) : null}
                          </a>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nf.format(customer.orders_count)}
                          {customer.orders_count >= 2 ? (
                            <Badge variant="outline" className="ml-2">
                              repite
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(
                            customer.total_spent,
                            customer.currency ?? "EUR",
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                          {customer.orders_count > 0
                            ? formatMoney(
                                customer.total_spent / customer.orders_count,
                                customer.currency ?? "EUR",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {[
                            customer.city,
                            customer.province,
                            customer.country_code === "ES"
                              ? null
                              : customer.country,
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {customer.accepts_email_marketing ? (
                            <Badge variant="outline">Suscrito</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                          {last ? formatDate(last) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {customer.email ? (
                            <EmailCustomerButton email={customer.email} />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

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
