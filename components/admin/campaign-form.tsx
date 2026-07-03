"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  createCampaign,
  updateCampaign,
  type ActionState,
} from "@/lib/crm/actions";
import { SegmentPicker } from "@/components/admin/segment-picker";
import { parseFacets } from "@/lib/crm/segments";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Campaign } from "@/lib/crm/format";

export function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const action = campaign
    ? updateCampaign.bind(null, campaign.id)
    : createCampaign;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );
  const editable = !campaign || campaign.status === "draft";

  useEffect(() => {
    if (state?.ok) toast.success("Borrador guardado");
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {!editable ? (
        <Alert>
          <AlertTitle>
            Esta campaña ya no es un borrador y no se puede editar.
          </AlertTitle>
        </Alert>
      ) : null}

      <fieldset disabled={!editable || pending} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="campaign-name">Nombre interno</FieldLabel>
            <Input
              id="campaign-name"
              name="name"
              required
              defaultValue={campaign?.name ?? ""}
              placeholder="Lanzamiento -20%"
            />
            <FieldDescription>
              Solo se ve en el CRM, no en el email.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="campaign-subject">Asunto</FieldLabel>
            <Input
              id="campaign-subject"
              name="subject"
              defaultValue={campaign?.subject ?? ""}
              placeholder="Tu comba nueva con -20% te está esperando"
            />
            <FieldDescription>
              Admite <code className="font-mono">{"{{nombre}}"}</code> — se
              sustituye por el nombre del contacto (y se omite si no lo hay).
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="campaign-preheader">Preheader</FieldLabel>
            <Input
              id="campaign-preheader"
              name="preheader"
              defaultValue={campaign?.preheader ?? ""}
              placeholder="El texto que asoma junto al asunto en la bandeja de entrada"
            />
            <FieldDescription>
              Opcional. Es la segunda línea que muestran Gmail y compañía.
            </FieldDescription>
          </Field>

          <SegmentPicker defaultFacets={parseFacets(campaign?.segment)} />

          <Field>
            <FieldLabel htmlFor="campaign-body">Contenido (HTML)</FieldLabel>
            <Textarea
              id="campaign-body"
              name="body_html"
              rows={14}
              defaultValue={campaign?.body_html ?? ""}
              placeholder="<h1>Hola…</h1>"
              className="font-mono text-xs"
            />
            <FieldDescription>
              HTML directo (el editor de bloques llega en la sub-fase 3d). Se
              envuelve solo con la plantilla de marca: cabecera, fondo oscuro y
              footer con baja. Admite{" "}
              <code className="font-mono">{"{{nombre}}"}</code>.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </fieldset>

      {editable ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Guardar borrador
          </Button>
          <p className="text-xs text-muted-foreground">
            Guarda antes de enviar la prueba: el email sale con lo último
            guardado.
          </p>
        </div>
      ) : null}
    </form>
  );
}
