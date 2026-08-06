"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BanIcon,
  ChartSplineIcon,
  ChevronsUpDownIcon,
  ContactRoundIcon,
  LayoutDashboardIcon,
  LinkIcon,
  LogOutIcon,
  NewspaperIcon,
  PackageIcon,
  SendIcon,
  ShoppingCartIcon,
  StoreIcon,
  TicketPercentIcon,
  UsersIcon,
  WalletIcon,
  WorkflowIcon,
} from "lucide-react";
import LogoIcon from "components/icons/logo";
import { useAuthActions } from "@convex-dev/auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const NAV_GROUPS = [
  {
    label: "Tienda",
    items: [
      { title: "Dashboard", href: "/admin", icon: LayoutDashboardIcon },
      { title: "Analítica", href: "/admin/analytics", icon: ChartSplineIcon },
      { title: "Pedidos", href: "/admin/orders", icon: PackageIcon },
      { title: "Carritos", href: "/admin/carts", icon: ShoppingCartIcon },
      { title: "Clientes", href: "/admin/customers", icon: ContactRoundIcon },
      { title: "Finanzas", href: "/admin/finance", icon: WalletIcon },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Contactos", href: "/admin/contacts", icon: UsersIcon },
      { title: "Campañas", href: "/admin/campaigns", icon: SendIcon },
      { title: "Enlaces", href: "/admin/links", icon: LinkIcon },
      {
        title: "Promociones",
        href: "/admin/promotions",
        icon: TicketPercentIcon,
      },
      {
        title: "Automatizaciones",
        href: "/admin/automations",
        icon: WorkflowIcon,
      },
      { title: "Supresiones", href: "/admin/suppressions", icon: BanIcon },
    ],
  },
  {
    label: "Contenido",
    items: [{ title: "Blog", href: "/admin/blog", icon: NewspaperIcon }],
  },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <Link href="/admin" aria-label="Dashboard del CRM">
            <LogoIcon aria-hidden className="h-5 w-auto" />
          </Link>
          <Badge variant="secondary">CRM</Badge>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Atajos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a href="/" target="_blank" rel="noreferrer noopener" />
                  }
                >
                  <StoreIcon />
                  <span>Ver la tienda</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  // id explícito: el autogenerado de Base UI (useId) cambia
                  // entre SSR e hidratación y dispara el aviso de React
                  <SidebarMenuButton id="sidebar-user-menu" size="lg">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg uppercase">
                        {email.slice(0, 2) || "PJ"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col text-left leading-tight">
                      <span className="text-xs font-medium">Admin</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {email}
                      </span>
                    </div>
                    <ChevronsUpDownIcon className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-(--anchor-width)"
              >
                <DropdownMenuLabel className="truncate">
                  {email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      void signOut().then(() => router.push("/admin/login"))
                    }
                  >
                    <LogOutIcon />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
