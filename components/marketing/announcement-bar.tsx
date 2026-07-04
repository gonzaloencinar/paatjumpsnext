"use client";

import { FormEvent, useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { useCart } from "components/cart/cart-context";
import { useDictionary } from "components/i18n/locale-context";
import { FreeShippingBar } from "components/marketing/free-shipping-bar";
import { fill } from "lib/i18n/dictionaries";

// Barra sticky de captación del lanzamiento (plan §7.1).
// Estética de marca: naranja-600 pleno con texto blanco, sin grises.
// Tras pedir el código, el mensaje de éxito se queda unos segundos y la barra
// se retira sola; en cargas posteriores ya ni sale (el alta deja la cookie
// pj_contact y el layout la lee). Siempre que esta barra no proceda —éxito,
// X durante la sesión o código ya en el carrito— la releva FreeShippingBar,
// para que el umbral de envío gratis se vea en toda la web.

type Status = "idle" | "sending" | "success" | "error";

// Tiempo que el mensaje de éxito queda visible antes del relevo.
const SUCCESS_VISIBLE_MS = 5000;

export function AnnouncementBar({
  name,
  percentage,
  code,
}: {
  name: string;
  percentage: number;
  code: string;
}) {
  const t = useDictionary();
  const { cart } = useCart();
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el carrito ya lleva EL código de esta promo (llegó por enlace ?code=… en
  // este mismo aterrizaje, antes de que el server re-renderice), ocultamos la
  // barra: no le pedimos el email para darle lo que ya tiene.
  const hasAnnouncedCode = Boolean(
    cart?.discountCodes?.some((d) => d.applicable && d.code === code),
  );

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => setVisible(false), SUCCESS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (!visible || hasAnnouncedCode) return <FreeShippingBar />;

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
        resent?: boolean;
      } | null;
      if (res.ok && json?.ok) {
        setResent(Boolean(json.resent));
        setStatus("success");
      } else {
        setStatus("error");
        setError(
          json?.error === "invalid_email"
            ? t.announcement.invalidEmail
            : json?.error === "rate_limited"
              ? t.announcement.rateLimited
              : t.announcement.genericError,
        );
      }
    } catch {
      setStatus("error");
      setError(t.announcement.genericError);
    }
  }

  return (
    <aside
      aria-label={t.announcement.ariaLabel}
      className="sticky top-0 z-50 bg-orange-600 text-white"
    >
      <div className="mx-auto flex max-w-(--breakpoint-2xl) flex-col gap-2 px-4 py-2.5 pr-12 md:flex-row md:items-center md:justify-center md:gap-6">
        {status === "success" ? (
          <p className="text-center text-sm font-medium">
            {resent
              ? t.announcement.successResent
              : fill(t.announcement.success, { percentage })}
          </p>
        ) : (
          <>
            <p className="text-center text-sm font-semibold tracking-wide md:text-left">
              🧡 {name.toUpperCase()}:{" "}
              <span className="font-black">−{percentage}%</span>{" "}
              {t.announcement.onFirstOrder}
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
                  placeholder={t.announcement.emailPlaceholder}
                  aria-label={t.announcement.yourEmail}
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
                  {status === "sending"
                    ? t.announcement.sending
                    : t.announcement.wantMyCode}
                </button>
              </div>

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
        aria-label={t.announcement.closeBar}
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
