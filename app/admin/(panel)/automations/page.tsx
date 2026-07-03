import Link from "next/link";
import { AutomationSwitch } from "@/components/admin/automation-switch";
import { NewAutomationDialog } from "@/components/admin/new-automation-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { effectiveSteps } from "@/lib/crm/automation-engine";
import { AUTOMATION_TRIGGER, delayLabel } from "@/lib/crm/format";
import { listAutomations } from "@/lib/crm/queries";

export const metadata = { title: "Automatizaciones" };

// "D+3 · D+6": posición acumulada de cada paso activo desde el inicio
function scheduleSummary(delays: number[]) {
  let cumulative = 0;
  return delays
    .map((delay) => {
      cumulative += delay;
      return delayLabel(cumulative);
    })
    .join(" · ");
}

export default async function AutomationsPage() {
  const automations = await listAutomations();

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Automatizaciones"
        description="Secuencias de email que se envían solas"
        actions={<NewAutomationDialog />}
      />

      <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
        {automations.map((automation) => {
          const trigger = AUTOMATION_TRIGGER[automation.trigger] ?? {
            label: automation.trigger,
          };
          const active = effectiveSteps(automation.automation_steps);
          const summary = trigger.phase2
            ? "Se activa con la Fase 2 (webhooks de Shopify); los pasos se pueden dejar escritos."
            : active.length === 0
              ? "Sin pasos con contenido todavía — no envía nada."
              : `${active.length} ${active.length === 1 ? "paso activo" : "pasos activos"}, tras el inicio: ${scheduleSummary(active.map((step) => step.delay_minutes))}.`;

          return (
            <Card key={automation.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/automations/${automation.id}`}
                      className="text-sm font-semibold transition-colors hover:text-orange-400"
                    >
                      {automation.name}
                    </Link>
                    <Badge variant="outline">{trigger.label}</Badge>
                    {trigger.phase2 ? (
                      <Badge variant="secondary">Fase 2</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
                <AutomationSwitch
                  automationId={automation.id}
                  enabled={automation.enabled}
                  name={automation.name}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
