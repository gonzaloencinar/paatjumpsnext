import { LinkIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ShortLinkDialog } from "@/components/admin/short-link-dialog";
import {
  CopyShortLinkButton,
  ShortLinkRowActions,
} from "@/components/admin/short-link-row-actions";
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
import { timeAgo } from "@/lib/crm/format";
import { createClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/utils";

export const metadata = { title: "Enlaces" };

const nf = new Intl.NumberFormat("es-ES");

export default async function LinksPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("short_links")
    .select("*")
    .order("created_at", { ascending: false });
  const links = data ?? [];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Enlaces cortos"
        description="paatjumps.com/l/<slug> → destino con UTMs, con clics contados"
        actions={<ShortLinkDialog />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {links.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LinkIcon />
              </EmptyMedia>
              <EmptyTitle>Sin enlaces todavía</EmptyTitle>
              <EmptyDescription>
                Crea enlaces cortos con UTMs para la bio de Instagram, stories o
                anuncios: quedan bonitos y cada clic se cuenta aquí.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Enlace</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Destino
                    </TableHead>
                    <TableHead>UTMs</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className="flex min-w-0 flex-col">
                            <span className="font-medium">/l/{link.slug}</span>
                            {link.notes ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {link.notes}
                              </span>
                            ) : null}
                          </div>
                          <CopyShortLinkButton
                            url={`${baseUrl}/l/${link.slug}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-48 truncate text-muted-foreground md:table-cell">
                        {link.destination}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">
                            {[link.utm_source, link.utm_medium]
                              .filter(Boolean)
                              .join(" / ") || "—"}
                          </span>
                          {link.utm_campaign ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {link.utm_campaign}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex flex-col items-end">
                          <span className="font-medium">
                            {nf.format(link.clicks)}
                          </span>
                          {link.last_clicked_at ? (
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(link.last_clicked_at)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ShortLinkRowActions link={link} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              El enlace publicado no cambia aunque edites destino o UTMs — por
              eso la bio puede apuntar siempre a /l/bio. Cambiar el slug sí
              rompe el enlace ya publicado.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
