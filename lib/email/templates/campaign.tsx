// Plantilla maestra de campañas (plan §16.5, v1 de la sub-fase 3a): el
// contenido lo escribe el dueño en el panel (HTML; el editor de bloques llega
// en 3d) y aquí se envuelve con la marca — cabecera, estilos base sobre fondo
// oscuro y footer legal con baja. El motor ya llega con {{nombre}} resuelto.

type CampaignEmailProps = {
  bodyHtml: string;
  preheader: string | null;
  unsubscribeUrl: string;
};

const orange = "#ea580c";

export function CampaignEmail({
  bodyHtml,
  preheader,
  unsubscribeUrl,
}: CampaignEmailProps) {
  return (
    <div style={{ backgroundColor: "#0a0a0a", padding: "32px 16px" }}>
      {preheader ? (
        <div
          style={{
            display: "none",
            overflow: "hidden",
            lineHeight: "1px",
            maxHeight: 0,
            maxWidth: 0,
            opacity: 0,
          }}
        >
          {preheader}
          {" ‌".repeat(60)}
        </div>
      ) : null}

      {/* El HTML del panel no trae estilos: defaults legibles sobre oscuro.
          Gmail/Apple Mail respetan <style>; donde no, degrada a los del div. */}
      <style>{`
        .pj-body a { color: #fb923c; }
        .pj-body h1, .pj-body h2, .pj-body h3 { color: #ffffff; line-height: 1.25; }
        .pj-body img { max-width: 100%; height: auto; border-radius: 12px; }
      `}</style>

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
            margin: "0 0 20px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase" as const,
            color: orange,
          }}
        >
          Paat Jumps
        </p>

        <div
          className="pj-body"
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.85)",
          }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

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
