import { CampaignForm } from "@/components/admin/campaign-form";
import { PageHeader } from "@/components/admin/page-header";

export const metadata = { title: "Nueva campaña" };

export default function NewCampaignPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nueva campaña"
        description="Se guarda como borrador; desde su ficha se prueba, programa o envía"
      />
      <div className="p-4 md:p-6">
        <CampaignForm />
      </div>
    </div>
  );
}
