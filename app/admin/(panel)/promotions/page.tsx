import { TicketPercentIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import {
  CopyAffiliateLinkButton,
  DeletePromotionButton,
  PromotionActiveSwitch,
  PromotionAnnounceSwitch,
  PromotionDialog,
} from "@/components/admin/promotions";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/crm/format";
import { listPromotions } from "@/lib/crm/queries";
import { baseUrl } from "@/lib/utils";

export const metadata = { title: "Promociones" };

export default async function PromotionsPage() {
  const promotions = await listPromotions();

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Promociones"
        description="Códigos de descuento sincronizados con Shopify"
        actions={<PromotionDialog />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {promotions.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TicketPercentIcon />
              </EmptyMedia>
              <EmptyTitle>Sin promociones</EmptyTitle>
              <EmptyDescription>
                Crea una promoción general (con anuncio en la web) o un código
                de afiliado con comisión.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <PromotionDialog />
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promoción</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Dto.</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Vigencia
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Ventas
                  </TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead>Anuncio web</TableHead>
                  <TableHead className="w-20 text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions.map((promotion) => {
                  const commission =
                    promotion.type === "affiliate" &&
                    promotion.affiliate_commission_pct !== null
                      ? (promotion.stats.revenue *
                          promotion.affiliate_commission_pct) /
                        100
                      : null;
                  return (
                    <TableRow key={promotion.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">
                            {promotion.name}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <code className="font-mono text-xs text-orange-400">
                              {promotion.code}
                            </code>
                            {promotion.type === "affiliate" ? (
                              <CopyAffiliateLinkButton
                                url={`${baseUrl}/?code=${promotion.code}`}
                              />
                            ) : null}
                            {!promotion.shopify_discount_id ? (
                              <Badge variant="destructive">Sin sync</Badge>
                            ) : null}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {promotion.type === "affiliate" ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline">Afiliado</Badge>
                            <span className="text-xs text-muted-foreground">
                              {promotion.affiliate_name} ·{" "}
                              {promotion.affiliate_commission_pct}% com.
                            </span>
                          </div>
                        ) : (
                          <Badge variant="secondary">General</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        −{promotion.percentage}%
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground tabular-nums lg:table-cell">
                        {formatDate(promotion.starts_at)} →{" "}
                        {promotion.ends_at
                          ? formatDate(promotion.ends_at)
                          : "sin fin"}
                      </TableCell>
                      <TableCell className="hidden text-right md:table-cell">
                        <div className="flex flex-col items-end gap-0.5 tabular-nums">
                          <span className="text-sm">
                            {formatMoney(promotion.stats.revenue)} ·{" "}
                            {promotion.stats.orders} ped.
                          </span>
                          {commission !== null ? (
                            <span className="text-xs text-muted-foreground">
                              comisión {formatMoney(commission)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PromotionActiveSwitch promotion={promotion} />
                      </TableCell>
                      <TableCell>
                        {promotion.type === "general" ? (
                          <PromotionAnnounceSwitch promotion={promotion} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <PromotionDialog promotion={promotion} />
                          <DeletePromotionButton promotion={promotion} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Las ventas y comisiones se atribuyen por código cuando lleguen los
          webhooks de pedidos (Fase 2). El toggle &ldquo;Anuncio web&rdquo;
          muestra la barra de captación en la tienda con esa promoción.
        </p>
      </div>
    </div>
  );
}
