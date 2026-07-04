// Email de bienvenida (Fase 1). Con promo general activa lleva su código
// compartido; sin promo, da la bienvenida a secas. JSX con estilos inline:
// Resend lo renderiza en servidor (prop `react`).

import { IDENTITY_PARAM } from "@/lib/crm/identity";

// Sin nombre a propósito (decisión 2026-07-04): muchas altas llegan sin él y
// el saludo genérico evita el "¡Hola, !" y los textos a dos velocidades.
type WelcomeEmailProps = {
  code: string | null;
  percentage: number | null;
  expiresAt: string | null;
  baseUrl: string;
  unsubscribeUrl: string;
  // Token de lib/email/tokens.ts identityToken(): el botón identifica el
  // navegador al aterrizar (recuperación de carritos pre-checkout)
  identity: string | null;
};

const orange = "#ea580c";

function formatExpiry(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

export function WelcomeEmail({
  code,
  percentage,
  expiresAt,
  baseUrl,
  unsubscribeUrl,
  identity,
}: WelcomeEmailProps) {
  const shopParams = new URLSearchParams();
  if (code) shopParams.set("code", code);
  if (identity) shopParams.set(IDENTITY_PARAM, identity);
  const shopUrl = shopParams.size
    ? `${baseUrl}/?${shopParams.toString()}`
    : baseUrl;
  const expiry = expiresAt ? formatExpiry(expiresAt) : null;
  const pct = percentage ?? 20;

  return (
    <div style={{ backgroundColor: "#0a0a0a", padding: "32px 16px" }}>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          backgroundColor: "#171717",
          borderRadius: 16,
          padding: "40px 32px",
          color: "#ffffff",
          fontFamily:
            "'Geist', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase" as const,
            color: orange,
          }}
        >
          Paat Jumps
        </p>

        <h1
          style={{
            margin: "16px 0 8px",
            fontSize: 28,
            lineHeight: 1.2,
            color: "#ffffff",
          }}
        >
          ¡Hola! {code ? `Aquí está tu −${pct}%` : "Ya estás dentro"}
        </h1>

        <p
          style={{
            margin: "0 0 28px",
            fontSize: 15,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {code ? (
            <>
              Gracias por unirte al lanzamiento de Paat Jumps. Usa este código
              en <strong style={{ color: "#fff" }}>tu primer pedido</strong> de
              la tienda:
            </>
          ) : (
            <>
              Gracias por unirte a Paat Jumps. Te avisaremos por aquí en cuanto
              haya ofertas y novedades.
            </>
          )}
        </p>

        {code ? (
          <div
            style={{
              border: `2px dashed ${orange}`,
              borderRadius: 12,
              padding: "20px 16px",
              textAlign: "center" as const,
              marginBottom: 28,
            }}
          >
            <span
              style={{
                fontFamily: "'SF Mono', 'Courier New', monospace",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 4,
                color: "#ffffff",
              }}
            >
              {code}
            </span>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {expiry
                ? `Caduca el ${expiry} · un uso por cliente`
                : "Válido durante el lanzamiento · un uso por cliente"}
            </p>
          </div>
        ) : null}

        <div style={{ textAlign: "center" as const, marginBottom: 28 }}>
          <a
            href={shopUrl}
            style={{
              display: "inline-block",
              backgroundColor: orange,
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 600,
              textDecoration: "none",
              padding: "14px 32px",
              borderRadius: 10,
            }}
          >
            {code ? `Comprar con −${pct}%` : "Ver la tienda"}
          </a>
        </div>

        {code ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Al abrir el botón, el descuento se aplica solo a tu carrito. Si lo
            prefieres, copia el código y pégalo en el checkout.
          </p>
        ) : null}

        <hr
          style={{
            border: "none",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            margin: "32px 0 20px",
          }}
        />

        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          Recibes este email porque te suscribiste en paatjumps.com.{" "}
          <a href={unsubscribeUrl} style={{ color: "rgba(255,255,255,0.6)" }}>
            Darse de baja
          </a>
        </p>
      </div>
    </div>
  );
}
