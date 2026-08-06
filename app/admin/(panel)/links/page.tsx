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
import { api } from "@/convex/_generated/api";
import { convexQuery, msToIso } from "@/lib/convex/server";
import { timeAgo } from "@/lib/crm/format";
import { baseUrl } from "@/lib/utils";

export const metadata = { title: "Enlaces" };

const nf = new Intl.NumberFormat("es-ES");

export default async function LinksPage() {
  const docs = await convexQuery(api.links.list, {});
  // Forma legacy (snake_case, ISO, null) que esperan los componentes
  const links = docs.map((doc) => ({
    id: doc._id,
    slug: doc.slug,
    aliases: doc.aliases,
    destination: doc.destination,
    utm_source: doc.utmSource ?? null,
    utm_medium: doc.utmMedium ?? null,
    utm_campaign: doc.utmCampaign ?? null,
    utm_term: doc.utmTerm ?? null,
    utm_content: doc.utmContent ?? null,
    notes: doc.notes ?? null,
    clicks: doc.clicks,
    last_clicked_at: msToIso(doc.lastClickedAt),
  }));

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
                            {link.aliases.length > 0 ? (
                              <span className="truncate text-xs text-muted-foreground">
                                también{" "}
                                {link.aliases.map((a) => `/l/${a}`).join(", ")}
                              </span>
                            ) : null}
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
