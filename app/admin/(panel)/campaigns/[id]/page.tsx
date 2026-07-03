import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { CampaignForm } from "@/components/admin/campaign-form";
import { CampaignSendPanel } from "@/components/admin/campaign-send-panel";
import { DeleteCampaignButton } from "@/components/admin/delete-campaign-button";
import { PageHeader } from "@/components/admin/page-header";
import { CampaignStatusBadge } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import { parseFacets } from "@/lib/crm/segments";
import {
  getCampaign,
  getCampaignAudienceCount,
  getCampaignSendStats,
} from "@/lib/crm/queries";

export const metadata = { title: "Campaña" };

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const needsAudience =
    campaign.status === "draft" || campaign.status === "scheduled";
  const [stats, audienceCount] = await Promise.all([
    getCampaignSendStats(id),
    needsAudience
      ? getCampaignAudienceCount(parseFacets(campaign.segment))
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={campaign.name}
        actions={
          <div className="flex items-center gap-2">
            <CampaignStatusBadge status={campaign.status} />
            {campaign.status === "draft" ? (
              <DeleteCampaignButton campaignId={campaign.id} />
            ) : null}
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/campaigns" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Todas las campañas
          </Button>
        </div>
        <div className="max-w-3xl">
          <CampaignSendPanel
            campaign={campaign}
            stats={stats}
            audienceCount={audienceCount}
          />
        </div>
        <CampaignForm campaign={campaign} />
      </div>
    </div>
  );
}
