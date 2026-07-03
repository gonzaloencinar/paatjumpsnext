import Link from "next/link";
import { notFound } from "next/navigation";
import { ReactNode } from "react";
import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";
import { ContactActions } from "@/components/admin/contact-actions";
import { PageHeader } from "@/components/admin/page-header";
import {
  ContactStatusBadge,
  EmailSendStatusBadge,
} from "@/components/admin/status-badges";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  contactDisplayName,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/crm/format";
import { getContactDetail } from "@/lib/crm/queries";

export const metadata = { title: "Contacto" };

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) notFound();
  const { contact, events, codes, orders, sends } = detail;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={contactDisplayName(contact)}
        description={contact.first_name ? contact.email : undefined}
        actions={
          <ContactActions contactId={contact.id} status={contact.status} />
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/contacts" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Todos los contactos
          </Button>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>
                  Historial de eventos del contacto
                </CardDescription>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay eventos registrados.
                  </p>
                ) : (
                  <Timeline events={events} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Emails</CardTitle>
                <CardDescription>Envíos a este contacto</CardDescription>
              </CardHeader>
              <CardContent>
                {sends.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no se le ha enviado ningún email.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {sends.map((send) => (
                      <li
                        key={send.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">
                            {send.subject ?? send.template ?? "Email"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(send.sent_at ?? send.created_at)}
                            {send.opened_at ? " · abierto" : ""}
                            {send.clicked_at ? " · con clic" : ""}
                          </span>
                        </div>
                        <EmailSendStatusBadge status={send.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Datos</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  <InfoRow label="Estado">
                    <ContactStatusBadge status={contact.status} />
                  </InfoRow>
                  <InfoRow label="Email">
                    <span className="font-mono text-xs break-all">
                      {contact.email}
                    </span>
                  </InfoRow>
                  <InfoRow label="Nombre">{contact.first_name ?? "—"}</InfoRow>
                  <InfoRow label="Origen">{contact.source ?? "—"}</InfoRow>
                  <InfoRow label="Alta">
                    {formatDateTime(contact.created_at)}
                  </InfoRow>
                  <InfoRow label="Cliente Shopify">
                    {contact.shopify_customer_id ? (
                      <span className="font-mono text-xs">
                        {contact.shopify_customer_id}
                      </span>
                    ) : (
                      "—"
                    )}
                  </InfoRow>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Consentimiento</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {contact.consent ? (
                    <>
                      <CheckIcon className="size-4 text-primary" aria-hidden />
                      Con consentimiento
                    </>
                  ) : (
                    <>
                      <XIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      Sin consentimiento registrado
                    </>
                  )}
                </p>
                {contact.consent_text ? (
                  <p className="border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground">
                    &ldquo;{contact.consent_text}&rdquo;
                  </p>
                ) : null}
                <dl className="flex flex-col gap-2">
                  <InfoRow label="Fecha">
                    {formatDateTime(contact.consent_at)}
                  </InfoRow>
                  <InfoRow label="IP">
                    {contact.consent_ip ? (
                      <span className="font-mono text-xs">
                        {contact.consent_ip}
                      </span>
                    ) : (
                      "—"
                    )}
                  </InfoRow>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Código de descuento</CardTitle>
              </CardHeader>
              <CardContent>
                {codes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin código asignado todavía.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {codes.map((code) => (
                      <li
                        key={code.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 flex-col">
                          <code className="truncate font-mono text-sm font-semibold">
                            {code.code}
                          </code>
                          <span className="text-xs text-muted-foreground">
                            -{code.percentage}%
                            {code.expires_at
                              ? ` · caduca ${formatDate(code.expires_at)}`
                              : ""}
                          </span>
                        </div>
                        <Badge
                          variant={code.redeemed ? "default" : "secondary"}
                        >
                          {code.redeemed ? "Canjeado" : "Sin canjear"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pedidos</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin pedidos atribuidos.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {orders.map((order) => (
                      <li
                        key={order.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium tabular-nums">
                            {formatMoney(
                              order.total_price ?? 0,
                              order.currency ?? "EUR",
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(order.created_at)}
                            {order.discount_code
                              ? ` · ${order.discount_code}`
                              : ""}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          #{order.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
