import { geist } from "lib/fonts";
import { cn } from "lib/utils";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "../globals.css";

// Root layout of the CRM tree (the store has its own under app/(store)/[locale]
// with a locale-driven `lang`; the CRM is Spanish-only).
export const metadata = {
  title: {
    default: "CRM",
    template: "%s · CRM Paat Jumps",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={cn("dark", "font-sans", geist.variable)}>
      <body className="bg-neutral-50 text-black selection:bg-orange-500 selection:text-white dark:bg-neutral-950 dark:text-white">
        {children}
        <Toaster closeButton />
      </body>
    </html>
  );
}
