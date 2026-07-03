import { AutomationSwitch } from "@/components/admin/automation-switch";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listAutomations } from "@/lib/crm/queries";

export const metadata = { title: "Automatizaciones" };

type AutomationConfig = {
  steps?: { delay_minutes?: number; template?: string }[];
  template?: string;
};

function delayLabel(minutes: number) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "24 h" : `${days} días`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

function describe(key: string, config: AutomationConfig | null) {
  if (key === "welcome") {
    return "Envía la bienvenida con el código -20% justo después del alta.";
  }
  if (key === "cart_recovery") {
    const steps = config?.steps ?? [];
    if (steps.length === 0) return "Recupera checkouts abandonados por email.";
    const delays = steps
      .map((step) => delayLabel(step.delay_minutes ?? 0))
      .join(" y ");
    return `${steps.length} pasos tras abandonar el checkout: ${delays}.`;
  }
  return "Automatización personalizada.";
}

export default async function AutomationsPage() {
  const automations = await listAutomations();

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Automatizaciones"
        description="Flujos que se disparan solos según el comportamiento"
      />

      <div className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
        <Alert>
          <AlertTitle>Los flujos aún no envían emails</AlertTitle>
          <AlertDescription>
            El interruptor deja configurado el estado, pero el motor de envío
            (Resend + cron) llega con las Fases 1 y 2 del plan.
          </AlertDescription>
        </Alert>

        {automations.map((automation) => (
          <Card key={automation.id}>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{automation.name}</h2>
                  <Badge variant="secondary" className="font-mono">
                    {automation.key}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {describe(
                    automation.key,
                    automation.config as AutomationConfig | null,
                  )}
                </p>
              </div>
              <AutomationSwitch
                automationId={automation.id}
                enabled={automation.enabled}
                name={automation.name}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
