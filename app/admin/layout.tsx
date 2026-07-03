import { ReactNode } from "react";

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
  return <>{children}</>;
}
