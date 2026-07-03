import LogoIcon from "components/icons/logo";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { loginWithGoogle } from "./actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

function GoogleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.16 7.16 0 0 1 0-4.58V6.62H1.29a12.04 12.04 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      {/* Atmósfera: matriz de puntos + resplandores naranjas + wordmark fantasma */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:26px_26px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-48 size-[36rem] rounded-full bg-orange-600/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-56 -right-40 size-[30rem] rounded-full bg-orange-600/10 blur-[120px]"
      />
      <LogoIcon
        aria-hidden
        className="pointer-events-none absolute -bottom-8 left-1/2 w-[110vw] max-w-none -translate-x-1/2 opacity-[0.04]"
      />

      <div className="relative flex w-full max-w-sm flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <LogoIcon className="mx-auto h-9 w-auto" aria-hidden />

        <Card className="border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <CardHeader>
            <p className="text-xs font-semibold tracking-[0.25em] text-orange-400 uppercase">
              Panel CRM
            </p>
            <CardTitle className="text-xl">Acceso restringido</CardTitle>
            <CardDescription>
              Contactos, campañas y automatizaciones de Paat Jumps.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error === "google" ? (
              <Alert variant="destructive">
                <AlertTitle>
                  No se pudo completar el acceso con Google.
                </AlertTitle>
              </Alert>
            ) : null}

            <form action={loginWithGoogle}>
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="w-full"
              >
                <GoogleIcon data-icon="inline-start" />
                Continuar con Google
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">
                o con contraseña
              </span>
              <Separator className="flex-1" />
            </div>

            <LoginForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Solo administradores · Paat Jumps
        </p>
      </div>
    </div>
  );
}
