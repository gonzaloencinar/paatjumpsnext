import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { AutomationStepCard } from "@/components/admin/automation-step-card";
import { AutomationSwitch } from "@/components/admin/automation-switch";
import { DeleteAutomationButton } from "@/components/admin/delete-automation-button";
import { EnrollSubscribersButton } from "@/components/admin/enroll-subscribers-button";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addAutomationStep } from "@/lib/crm/actions";
import { effectiveSteps } from "@/lib/crm/automation-engine";
import { AUTOMATION_TRIGGER } from "@/lib/crm/format";
import {
  getAutomationDetail,
  getCampaignAudienceCount,
} from "@/lib/crm/queries";

export const metadata = { title: "Automatización" };

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getAutomationDetail(id);
  if (!detail) notFound();
  const { automation, steps, statsByStep, enrollmentCounts } = detail;

  const trigger = AUTOMATION_TRIGGER[automation.trigger] ?? {
    label: automation.trigger,
  };
  const active = effectiveSteps(steps);
  const audienceCount =
    automation.trigger === "manual" ? await getCampaignAudienceCount() : null;
  const structural =
    automation.key === "welcome" || automation.key === "cart_recovery";

  return (
    <div className="flex flex-col">
      <PageHeader
        title={automation.name}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant="outline">{trigger.label}</Badge>
            <AutomationSwitch
              automationId={automation.id}
              enabled={automation.enabled}
              name={automation.name}
            />
          </div>
        }
      />

      <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/automations" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Todas las automatizaciones
          </Button>
          {!structural ? (
            <DeleteAutomationButton automationId={automation.id} />
          ) : null}
        </div>

        {trigger.phase2 ? (
          <Alert>
            <AlertTitle>Este trigger se activa con la Fase 2</AlertTitle>
            <AlertDescription>
              Necesita los webhooks de Shopify (checkouts/pedidos). Los pasos ya
              se pueden dejar escritos.
            </AlertDescription>
          </Alert>
        ) : null}

        {automation.enabled && active.length === 0 && !trigger.phase2 ? (
          <Alert>
            <AlertTitle>Está activada pero no enviará nada</AlertTitle>
            <AlertDescription>
              Ningún paso está activo con asunto y contenido a la vez.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            Inscripciones — activas:{" "}
            <strong className="text-foreground">
              {enrollmentCounts.active}
            </strong>{" "}
            · completadas:{" "}
            <strong className="text-foreground">
              {enrollmentCounts.completed}
            </strong>{" "}
            · canceladas:{" "}
            <strong className="text-foreground">
              {enrollmentCounts.canceled}
            </strong>
          </p>
          {automation.trigger === "manual" && audienceCount !== null ? (
            <EnrollSubscribersButton
              automationId={automation.id}
              audienceCount={audienceCount}
            />
          ) : null}
          {automation.trigger === "signup" ? (
            <p className="text-xs text-muted-foreground">
              Cada alta nueva se inscribe sola; la serie empieza después del
              email de bienvenida.
            </p>
          ) : null}
        </div>

        {steps.map((step, index) => (
          <AutomationStepCard
            key={step.id}
            automationId={automation.id}
            step={step}
            stats={statsByStep.get(step.id) ?? null}
            index={index}
            total={steps.length}
          />
        ))}

        <form action={addAutomationStep.bind(null, automation.id)}>
          <Button type="submit" variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Añadir paso
          </Button>
        </form>
      </div>
    </div>
  );
}
