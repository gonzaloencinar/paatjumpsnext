import LogoIcon from "components/icons/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

export default function LoginPage() {
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
