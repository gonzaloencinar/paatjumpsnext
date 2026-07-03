import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from "lucide-react";
import { AddContactDialog } from "@/components/admin/add-contact-dialog";
import { ContactsToolbar } from "@/components/admin/contacts-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { ContactStatusBadge } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/crm/format";
import { listContacts } from "@/lib/crm/queries";

export const metadata = { title: "Contactos" };

const nf = new Intl.NumberFormat("es-ES");

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    tipo?: string;
    actividad?: string;
    fuente?: string;
    alta?: string;
    tag?: string;
  }>;
}) {
  const sp = await searchParams;
  const { contacts, total, page, perPage } = await listContacts({
    q: sp.q,
    status: sp.status,
    page: Number(sp.page) || 1,
    tipo: sp.tipo,
    actividad: sp.actividad,
    fuente: sp.fuente,
    alta_dias: Number(sp.alta) || undefined,
    tag: sp.tag,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const filtering = Boolean(
    sp.q || sp.status || sp.tipo || sp.actividad || sp.fuente || sp.alta ||
      sp.tag,
  );

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    for (const key of [
      "q",
      "status",
      "tipo",
      "actividad",
      "fuente",
      "alta",
      "tag",
    ] as const) {
      if (sp[key]) params.set(key, sp[key]!);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/contacts${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Contactos"
        description={`${nf.format(total)} ${filtering ? "resultados" : "en total"}`}
        actions={<AddContactDialog />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <ContactsToolbar />

        {contacts.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>
                {filtering ? "Sin resultados" : "Aún no hay contactos"}
              </EmptyTitle>
              <EmptyDescription>
                {filtering
                  ? "Prueba con otra búsqueda u otro estado."
                  : "La barra de captación del lanzamiento llenará esta lista; mientras tanto puedes añadir contactos a mano."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Origen
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Cliente
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Alta
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <Link
                          href={`/admin/contacts/${contact.id}`}
                          className="flex min-w-0 flex-col transition-colors hover:text-orange-400"
                        >
                          <span className="truncate font-medium">
                            {contact.email}
                          </span>
                          {contact.first_name ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {contact.first_name}
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ContactStatusBadge status={contact.status} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {contact.source ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                        {formatDate(contact.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
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
