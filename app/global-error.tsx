"use client";

// Last-resort boundary: it replaces the root layouts entirely (they live in
// the route groups), so it must render its own <html>/<body> and can't rely
// on globals.css or providers.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>
            ¡Vaya! Algo ha ido mal.
          </h2>
          <p style={{ opacity: 0.7, margin: "8px 0 16px" }}>
            There was a problem with our store — please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#ea580c",
              color: "#fff",
              border: 0,
              borderRadius: 999,
              padding: "12px 28px",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Reintentar · Retry
          </button>
        </div>
      </body>
    </html>
  );
}
