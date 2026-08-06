"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Login con Convex Auth (provider Password). El sign-up está abierto —
// cualquiera puede crear cuenta — pero el panel lo gatea la allowlist
// admin_users (api.admins.isAdmin), así que una cuenta ajena ve
// "Sin acceso al CRM" y nada más.
export function LoginForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const invalid = Boolean(error);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      router.push("/admin");
      router.refresh();
    } catch {
      setError(
        flow === "signIn"
          ? "Credenciales incorrectas."
          : "No se pudo crear la cuenta. ¿Quizá ya existe?",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="hola@paatjumps.com"
            autoComplete="email"
            autoFocus
            required
            aria-invalid={invalid || undefined}
          />
        </Field>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={
              flow === "signIn" ? "current-password" : "new-password"
            }
            required
            aria-invalid={invalid || undefined}
          />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        {flow === "signIn" ? "Entrar" : "Crear cuenta"}
      </Button>

      <button
        type="button"
        className="text-center text-xs text-muted-foreground transition-colors hover:text-orange-400"
        onClick={() => {
          setFlow(flow === "signIn" ? "signUp" : "signIn");
          setError(null);
        }}
      >
        {flow === "signIn"
          ? "¿Primera vez? Crear cuenta"
          : "¿Ya tienes cuenta? Entrar"}
      </button>
    </form>
  );
}
