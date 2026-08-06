import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { ShieldAlertIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { SignOutButton } from "@/components/admin/sign-out-button";

export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  // El proxy ya exige sesión; aquí se re-verifica (no confiar solo en
  // middleware) y se aplica la allowlist admin_users vía api.admins.isAdmin.
  const token = await convexAuthNextjsToken();
  if (!token) redirect("/admin/login");

  const [isAdmin, email] = await Promise.all([
    fetchQuery(api.admins.isAdmin, {}, { token }),
    fetchQuery(api.admins.me, {}, { token }),
  ]);

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
            <SignOutButton />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar email={email ?? ""} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
