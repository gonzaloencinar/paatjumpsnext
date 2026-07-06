// Petición de DNI/NIE post-pedido (lib/crm/dni-requests.ts): destinos con
// aduana. ES para Canarias/Ceuta/Melilla, EN para internacional. Mismo estilo
// oscuro que el resto de emails del CRM. Transaccional: sin enlace de baja.

const orange = "#ea580c";

type DniLocale = "es" | "en";

const COPY = {
  es: {
    subject: (name: string) =>
      `Tu pedido ${name}: necesitamos tu DNI para el envío`,
    reminderSubject: (name: string) =>
      `Recordatorio: falta tu DNI para enviar tu pedido ${name}`,
    heading: "Nos falta un dato para enviarte tu pedido",
    body: (name: string) =>
      `Tu pedido ${name} va a Canarias, Ceuta o Melilla y la agencia de transporte necesita el DNI o NIE del destinatario para el despacho de aduana. Sin él no podemos generar el envío.`,
    reminderNote: "Te lo pedimos hace un día y aún no nos consta. ",
    cta: "Añadir mi DNI (30 segundos)",
    footer:
      "Si tienes cualquier duda, responde a este correo y te ayudamos encantados.",
  },
  en: {
    subject: (name: string) =>
      `Your order ${name}: we need your ID number to ship it`,
    reminderSubject: (name: string) =>
      `Reminder: your ID number is needed to ship order ${name}`,
    heading: "One last detail before we can ship your order",
    body: (name: string) =>
      `Your order ${name} ships internationally and the carrier requires the recipient's ID number (national ID or passport) for customs clearance. We can't generate the shipment without it.`,
    reminderNote: "We asked a day ago and haven't received it yet. ",
    cta: "Add my ID number (30 seconds)",
    footer: "Any questions? Just reply to this email and we'll gladly help.",
  },
} as const;

export function dniRequestSubject(
  locale: DniLocale,
  orderName: string,
  reminder: boolean,
) {
  const copy = COPY[locale];
  return reminder ? copy.reminderSubject(orderName) : copy.subject(orderName);
}

export function DniRequestEmail({
  locale,
  orderName,
  formUrl,
  reminder,
}: {
  locale: DniLocale;
  orderName: string;
  formUrl: string;
  reminder: boolean;
}) {
  const copy = COPY[locale];
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
            fontSize: 26,
            lineHeight: 1.25,
            color: "#ffffff",
          }}
        >
          {copy.heading}
        </h1>

        <p
          style={{
            margin: "0 0 28px",
            fontSize: 15,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {reminder ? copy.reminderNote : ""}
          {copy.body(orderName)}
        </p>

        <div style={{ textAlign: "center" as const, marginBottom: 28 }}>
          <a
            href={formUrl}
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
            {copy.cta}
          </a>
        </div>

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
          {copy.footer}
        </p>
      </div>
    </div>
  );
}

// Aviso interno a contacto@paatjumps.com tras 48 h sin respuesta: llamar al
// cliente por teléfono.
export function DniAlertEmail({
  orderName,
  email,
  phone,
  formUrl,
  adminUrl,
}: {
  orderName: string;
  email: string;
  phone: string | null;
  formUrl: string;
  adminUrl: string;
}) {
  return (
    <div
      style={{
        fontFamily:
          "'Geist', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: 15,
        lineHeight: 1.6,
        color: "#111111",
        padding: 16,
      }}
    >
      <p>
        El pedido <strong>{orderName}</strong> lleva 48 horas sin DNI: se le ha
        pedido por email 2 veces ({email}) y no ha respondido.
      </p>
      <p>
        <strong>Hay que llamarle por teléfono</strong>
        {phone ? (
          <>
            : <a href={`tel:${phone}`}>{phone}</a>
          </>
        ) : (
          " (el teléfono está en el pedido de Shopify)."
        )}
      </p>
      <p>
        Su formulario sigue activo por si quieres reenviárselo: {formUrl}
        <br />
        Pedido en el CRM: {adminUrl}
      </p>
    </div>
  );
}
