"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";
import { CRM_CONSENT_TEXT, CRM_PRIVACY_PATH } from "./consent";

// Barra sticky de captación del lanzamiento (plan §7.1).
// Estética de marca: naranja-600 pleno con texto blanco, sin grises.
// Estados en localStorage: dismissed (X) / subscribed (alta completada).

const STORAGE_KEY = "pj:announcement-bar";

type Status = "idle" | "sending" | "success" | "error";

export function AnnouncementBar({
  name,
  percentage,
  endsAt,
}: {
  name: string;
  percentage: number;
  endsAt: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss(reason: "dismissed" | "subscribed") {
    window.localStorage.setItem(STORAGE_KEY, reason);
    setVisible(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          consent: true,
          website: String(data.get("website") ?? ""),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        setStatus("success");
        window.localStorage.setItem(STORAGE_KEY, "subscribed");
      } else {
        setStatus("error");
        setError(
          json?.error === "invalid_email"
            ? "Ese email no parece válido."
            : json?.error === "rate_limited"
              ? "Demasiados intentos, prueba en un rato."
              : "No se pudo completar el alta. Inténtalo de nuevo.",
        );
      }
    } catch {
      setStatus("error");
      setError("No se pudo completar el alta. Inténtalo de nuevo.");
    }
  }

  return (
    <aside
      aria-label="Oferta de lanzamiento"
      className="relative bg-orange-600 text-white"
    >
      <div className="mx-auto flex max-w-(--breakpoint-2xl) flex-col gap-2 px-4 py-2.5 pr-12 md:flex-row md:items-center md:justify-center md:gap-6">
        {status === "success" ? (
          <p className="text-center text-sm font-medium">
            Hecho: revisa tu correo, tu código −20% va de camino. 📬
          </p>
        ) : (
          <>
            <p className="text-center text-sm font-semibold tracking-wide md:text-left">
              🧡 {name.toUpperCase()}:{" "}
              <span className="font-black">−{percentage}%</span> en tu primer
              pedido
              {endsAt ? (
                <span className="font-normal text-white/85">
                  {" "}
                  · hasta el{" "}
                  {new Intl.DateTimeFormat("es-ES", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(endsAt))}
                </span>
              ) : null}
            </p>

            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-1.5 md:max-w-md md:flex-1"
            >
              <div className="flex gap-2">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="tu@email.com"
                  aria-label="Tu email"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/30 bg-white/15 px-3 text-sm text-white placeholder:text-white/60 focus-visible:ring-white/60"
                />
                {/* honeypot anti-bots: oculto para humanos */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  className="hidden"
                />
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="h-9 shrink-0 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-900 disabled:opacity-60"
                >
                  {status === "sending" ? "Enviando…" : "Quiero mi código"}
                </button>
              </div>

              <p className="text-center text-[11px] leading-snug text-white/85 md:text-left">
                {CRM_CONSENT_TEXT}{" "}
                <Link
                  href={CRM_PRIVACY_PATH}
                  className="underline underline-offset-2 hover:text-white"
                >
                  Política de privacidad
                </Link>
              </p>

              {status === "error" && error ? (
                <p role="alert" className="text-xs font-medium text-white">
                  ⚠ {error}
                </p>
              ) : null}
            </form>
          </>
        )}
      </div>

      <button
        type="button"
        aria-label="Cerrar barra de oferta"
        onClick={() =>
          dismiss(status === "success" ? "subscribed" : "dismissed")
        }
        className="absolute top-2 right-2 rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
