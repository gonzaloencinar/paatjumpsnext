import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { logout } from "@/app/admin/login/actions";

export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  // El middleware ya refresca la sesión; aquí se re-verifica (no confiar solo
  // en middleware) y se aplica la allowlist de admin_users vía is_admin().
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/admin/login");

  const email = typeof claims.email === "string" ? claims.email : "";
  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (!isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlertIcon />
            </EmptyMedia>
            <EmptyTitle>Sin acceso al CRM</EmptyTitle>
            <EmptyDescription>
              La cuenta {email || "actual"} no está en la lista de
              administradores.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <form action={logout}>
              <Button variant="outline" type="submit">
                Cerrar sesión
              </Button>
            </form>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar email={email} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
