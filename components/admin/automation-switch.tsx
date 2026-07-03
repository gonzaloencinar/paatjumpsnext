"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleAutomation } from "@/lib/crm/actions";
import { Switch } from "@/components/ui/switch";

export function AutomationSwitch({
  automationId,
  enabled,
  name,
}: {
  automationId: string;
  enabled: boolean;
  name: string;
}) {
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={`Activar ${name}`}
      onCheckedChange={(next) => {
        const value = Boolean(next);
        setChecked(value);
        startTransition(async () => {
          try {
            await toggleAutomation(automationId, value);
            toast.success(value ? `${name} activada` : `${name} desactivada`);
          } catch {
            setChecked(!value);
            toast.error("No se pudo guardar el cambio");
          }
        });
      }}
    />
  );
}
