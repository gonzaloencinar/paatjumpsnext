"use client";

import { useActionState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { login } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);
  const invalid = Boolean(state?.error);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertTitle>{state.error}</AlertTitle>
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
            autoComplete="current-password"
            required
            aria-invalid={invalid || undefined}
          />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Entrar
      </Button>
    </form>
  );
}
