import { ShieldCheckIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import {
  AddSuppressionDialog,
  RemoveSuppressionButton,
} from "@/components/admin/suppressions-actions";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
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
import { SUPPRESSION_REASON, formatDateTime } from "@/lib/crm/format";
import { listSuppressions } from "@/lib/crm/queries";

export const metadata = { title: "Supresiones" };

export default async function SuppressionsPage() {
  const suppressions = await listSuppressions();

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Supresiones"
        description="Emails a los que no se envía nada: bajas, rebotes y quejas"
        actions={<AddSuppressionDialog />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {suppressions.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheckIcon />
              </EmptyMedia>
              <EmptyTitle>Lista de supresión vacía</EmptyTitle>
              <EmptyDescription>
                Aquí caerán automáticamente las bajas, los rebotes duros y las
                quejas de spam. Toda función de envío consulta esta lista antes
                de enviar.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Fecha
                  </TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressions.map((suppression) => (
                  <TableRow key={suppression.email}>
                    <TableCell className="font-mono text-xs">
                      {suppression.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          suppression.reason === "manual"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {SUPPRESSION_REASON[suppression.reason] ??
                          suppression.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {formatDateTime(suppression.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RemoveSuppressionButton email={suppression.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
