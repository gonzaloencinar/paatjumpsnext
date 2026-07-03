import { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { SignupsChart } from "@/components/admin/signups-chart";
import { eventIcon } from "@/components/admin/timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardData } from "@/lib/crm/queries";
import { eventLabel, formatMoney, timeAgo } from "@/lib/crm/format";

export const metadata = { title: "Dashboard" };

const nf = new Intl.NumberFormat("es-ES");

export default async function DashboardPage() {
  const data = await getDashboardData();

  const openRate = data.email.sent
    ? Math.round((data.email.opened / data.email.sent) * 100)
    : null;
  const isFresh =
    data.contacts.subscribed === 0 &&
    data.contacts.pending === 0 &&
    data.email.sent === 0;

  const stats: { label: string; value: string; hint: ReactNode }[] = [
    {
      label: "Suscriptores",
      value: nf.format(data.contacts.subscribed),
      hint:
        data.contacts.newLast7 > 0 ? (
          <span className="inline-flex items-center gap-1 text-orange-400">
            <ArrowUpRightIcon className="size-3.5" aria-hidden />+
            {nf.format(data.contacts.newLast7)} esta semana
          </span>
        ) : (
          "Sin altas esta semana"
        ),
    },
    {
      label: "Emails enviados",
      value: nf.format(data.email.sent),
      hint:
        openRate !== null
          ? `${openRate}% aperturas · ${nf.format(data.email.clicked)} clics`
          : "Aún sin envíos",
    },
    {
      label: "Checkouts abandonados",
      value: nf.format(data.checkouts.abandoned),
      hint: `${nf.format(data.checkouts.recovered)} recuperados`,
    },
    {
      label: "Ingresos con código",
      value: formatMoney(data.revenue.withCode),
      hint: `${nf.format(data.revenue.orders)} pedidos · ${formatMoney(
        data.revenue.total,
      )} en total`,
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Dashboard"
        description="Visión general del CRM de Paat Jumps"
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {isFresh ? (
          <Alert>
            <AlertTitle>El CRM está listo y esperando datos</AlertTitle>
            <AlertDescription>
              Los suscriptores llegarán con la barra de captación del
              lanzamiento (Fase 1 del plan) y los checkouts/pedidos con los
              webhooks de Shopify (Fase 2). Mientras tanto puedes añadir
              contactos a mano desde{" "}
              <Link
                href="/admin/contacts"
                className="font-medium text-orange-400 hover:text-orange-300"
              >
                Contactos
              </Link>
              .
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, i) => (
            <Card
              key={stat.label}
              className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl tracking-tight tabular-nums">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {stat.hint}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Altas de contactos</CardTitle>
              <CardDescription>Últimos 30 días</CardDescription>
            </CardHeader>
            <CardContent>
              <SignupsChart data={data.signupsSeries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actividad reciente</CardTitle>
              <CardDescription>Últimos eventos del timeline</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aquí aparecerán altas, pedidos, aperturas de email y demás
                  eventos según vayan ocurriendo.
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {data.recentEvents.map((event) => {
                    const Icon = eventIcon(event.type);
                    return (
                      <li key={event.id} className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <p className="truncate text-sm font-medium">
                            {eventLabel(event.type)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {event.contacts?.email ?? "—"} ·{" "}
                            {timeAgo(event.created_at)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
