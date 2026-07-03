import Link from "next/link";
import { PlusIcon, SendIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CampaignStatusBadge } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
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
import { formatDate, formatDateTime } from "@/lib/crm/format";
import { listCampaigns } from "@/lib/crm/queries";

export const metadata = { title: "Campañas" };

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();

  const newButton = (
    <Button size="sm" render={<Link href="/admin/campaigns/new" />}>
      <PlusIcon data-icon="inline-start" />
      Nueva campaña
    </Button>
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Campañas"
        description="Blasts de email a segmentos de la lista"
        actions={campaigns.length > 0 ? newButton : undefined}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {campaigns.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SendIcon />
              </EmptyMedia>
              <EmptyTitle>Todavía no hay campañas</EmptyTitle>
              <EmptyDescription>
                Crea el primer borrador — por ejemplo, el anuncio del
                lanzamiento con el código -20%.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{newButton}</EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Asunto</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Creada
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Envío
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        href={`/admin/campaigns/${campaign.id}`}
                        className="font-medium transition-colors hover:text-orange-400"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell">
                      {campaign.subject ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {formatDate(campaign.created_at)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
                      {campaign.sent_at
                        ? formatDateTime(campaign.sent_at)
                        : campaign.status === "scheduled" &&
                            campaign.scheduled_at
                          ? `Prog. ${formatDateTime(campaign.scheduled_at)}`
                          : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
