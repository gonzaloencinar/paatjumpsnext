"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarIcon,
  CopyIcon,
  MailIcon,
  PauseIcon,
  PlayIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelCampaign,
  duplicateCampaign,
  pauseCampaign,
  resumeCampaign,
  scheduleCampaign,
  sendCampaignNow,
  sendTestCampaign,
  unscheduleCampaign,
} from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, type Campaign } from "@/lib/crm/format";
import type { CampaignSendStats } from "@/lib/crm/queries";

// Valor para <input type="datetime-local"> en la hora local del navegador
// (el dueño opera desde Madrid; el server lo interpreta como Madrid).
function localInputValue(date: Date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function defaultScheduleValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return localInputValue(d);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function CampaignSendPanel({
  campaign,
  stats,
  audienceCount,
}: {
  campaign: Campaign;
  stats: CampaignSendStats;
  audienceCount: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sendOpen, setSendOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Mientras hay envío en marcha (o programado), refrescar solo el estado
  const live = campaign.status === "sending" || campaign.status === "scheduled";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [live, router]);

  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    scheduleCampaign.bind(null, campaign.id),
    null,
  );
  useEffect(() => {
    if (scheduleState?.ok) {
      setScheduleOpen(false);
      toast.success("Campaña programada");
    }
    if (scheduleState?.error) toast.error(scheduleState.error);
  }, [scheduleState]);

  function run(action: () => Promise<unknown>, okMessage?: string) {
    startTransition(async () => {
      try {
        await action();
        if (okMessage) toast.success(okMessage);
      } catch {
        toast.error("No se pudo completar la acción");
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestCampaign(campaign.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Prueba enviada a tu email");
    });
  }

  function confirmSendNow() {
    startTransition(async () => {
      const result = await sendCampaignNow(campaign.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setSendOpen(false);
        toast.success("Enviando: empieza en menos de un minuto");
      }
    });
  }

  const processed = stats.sent + stats.skipped + stats.failed;
  const progressPct =
    stats.total > 0 ? Math.round((processed / stats.total) * 100) : 0;

  const testButton = (
    <Button variant="outline" size="sm" onClick={sendTest} disabled={pending}>
      <MailIcon data-icon="inline-start" />
      Enviarme una prueba
    </Button>
  );

  const duplicateButton = (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => run(() => duplicateCampaign(campaign.id))}
    >
      <CopyIcon data-icon="inline-start" />
      Duplicar
    </Button>
  );

  const cancelDialog = (
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" disabled={pending}>
            <XIcon data-icon="inline-start" />
            Cancelar envío
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Cancelar esta campaña?</DialogTitle>
          <DialogDescription>
            Los destinatarios pendientes se omiten. Lo ya enviado no se puede
            deshacer{stats.sent > 0 ? ` (${stats.sent} ya han salido)` : ""}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Volver
              </Button>
            }
          />
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              run(() => cancelCampaign(campaign.id), "Campaña cancelada");
              setCancelOpen(false);
            }}
          >
            Cancelar envío
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const statsGrid = (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Destinatarios" value={stats.total} />
        <Stat label="Enviados" value={stats.sent} />
        <Stat label="Aperturas" value={stats.opened} />
        <Stat label="Clics" value={stats.clicked} />
      </div>
      {stats.skipped > 0 || stats.failed > 0 ? (
        <p className="text-xs text-muted-foreground">
          Omitidos (supresiones/cancelación): {stats.skipped} · Fallidos:{" "}
          {stats.failed}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      {campaign.status === "draft" || campaign.status === "scheduled" ? (
        <>
          {campaign.status === "scheduled" ? (
            <p className="text-sm">
              <CalendarIcon
                className="mr-1.5 inline size-4 text-orange-400"
                aria-hidden
              />
              Programada para el{" "}
              <strong>{formatDateTime(campaign.scheduled_at)}</strong> (hora de
              Madrid)
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {testButton}

            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm" disabled={pending}>
                    <CalendarIcon data-icon="inline-start" />
                    {campaign.status === "scheduled"
                      ? "Reprogramar"
                      : "Programar"}
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Programar el envío</DialogTitle>
                  <DialogDescription>
                    Se enviará a {audienceCount ?? "los"} contactos suscritos en
                    ese momento (menos supresiones).
                  </DialogDescription>
                </DialogHeader>
                <form action={scheduleAction} className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel htmlFor="scheduled_local">
                      Fecha y hora
                    </FieldLabel>
                    <Input
                      id="scheduled_local"
                      name="scheduled_local"
                      type="datetime-local"
                      required
                      defaultValue={defaultScheduleValue()}
                      min={localInputValue(new Date())}
                    />
                    <FieldDescription>
                      Hora de Madrid, entre las 9:00 y las 22:00 (quiet hours).
                    </FieldDescription>
                  </Field>
                  <DialogFooter>
                    <DialogClose
                      render={
                        <Button type="button" variant="outline">
                          Volver
                        </Button>
                      }
                    />
                    <Button type="submit" disabled={schedulePending}>
                      {schedulePending && <Spinner data-icon="inline-start" />}
                      Programar
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={sendOpen} onOpenChange={setSendOpen}>
              <DialogTrigger
                render={
                  <Button size="sm" disabled={pending}>
                    <SendIcon data-icon="inline-start" />
                    Enviar ahora
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>¿Enviar la campaña ahora?</DialogTitle>
                  <DialogDescription>
                    Se enviará a <strong>{audienceCount ?? 0}</strong>{" "}
                    {audienceCount === 1
                      ? "contacto suscrito"
                      : "contactos suscritos"}
                    . Empieza con el próximo tick del cron (menos de un minuto)
                    y sale por lotes. ¿Has hecho una prueba?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button type="button" variant="outline">
                        Volver
                      </Button>
                    }
                  />
                  <Button onClick={confirmSendNow} disabled={pending}>
                    {pending && <Spinner data-icon="inline-start" />}
                    Enviar ahora
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {campaign.status === "scheduled" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => unscheduleCampaign(campaign.id),
                    "Programación quitada — vuelve a ser borrador",
                  )
                }
              >
                Quitar programación
              </Button>
            ) : (
              duplicateButton
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            El envío pasa siempre por la lista de supresiones y sale por lotes
            (~2 emails/s) desde el cron. Usa{" "}
            <code className="font-mono">{"{{nombre}}"}</code> en asunto o
            contenido para personalizar.
          </p>
        </>
      ) : null}

      {campaign.status === "sending" || campaign.status === "paused" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              {campaign.status === "sending" ? (
                <>
                  <Spinner className="size-4" />
                  Enviando: {processed} de {stats.total} procesados
                </>
              ) : (
                <>
                  <PauseIcon className="size-4 text-orange-400" aria-hidden />
                  Pausada: quedan {stats.inFlight} por enviar
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              {campaign.status === "sending" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => pauseCampaign(campaign.id), "Campaña pausada")
                  }
                >
                  <PauseIcon data-icon="inline-start" />
                  Pausar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => resumeCampaign(campaign.id),
                      "Envío reanudado — continúa con el próximo tick",
                    )
                  }
                >
                  <PlayIcon data-icon="inline-start" />
                  Reanudar
                </Button>
              )}
              {cancelDialog}
            </div>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-orange-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {statsGrid}
        </>
      ) : null}

      {campaign.status === "sent" || campaign.status === "canceled" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {campaign.status === "sent" ? (
                <>
                  Enviada el <strong>{formatDateTime(campaign.sent_at)}</strong>
                </>
              ) : (
                "Cancelada — los pendientes se omitieron."
              )}
            </p>
            {duplicateButton}
          </div>
          {statsGrid}
        </>
      ) : null}
    </div>
  );
}
