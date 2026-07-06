import { geist } from "lib/fonts";
import { cn } from "lib/utils";
import { ReactNode } from "react";
import "../globals.css";

// Layout raíz del formulario público de DNI (/id/<token>): página suelta
// estilo Typeform, sin navbar ni footer de la tienda. El idioma real lo pone
// la página según la petición (ES aduana nacional / EN internacional).
export const metadata = {
  title: "Paat Jumps",
  robots: { index: false, follow: false },
};

export default function DniFormLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={cn("dark", "font-sans", geist.variable)}>
      <body className="bg-neutral-950 text-white selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
