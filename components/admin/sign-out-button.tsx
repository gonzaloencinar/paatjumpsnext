"use client";

import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      type="button"
      onClick={() => void signOut().then(() => router.push("/admin/login"))}
    >
      Cerrar sesión
    </Button>
  );
}
