"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShippingZone } from "lib/shipping";

// Zona de envío del visitante (calculada en el layout server-side desde el
// geo-IP): umbral de envío gratis + coste estimado por debajo del umbral.
// null = destino sin envío gratis prometido → el carrito oculta la UI de envío.
// Ver lib/shipping.ts.
const ShippingZoneContext = createContext<ShippingZone | null>(null);

export function ShippingProvider({
  zone,
  children,
}: {
  zone: ShippingZone | null;
  children: ReactNode;
}) {
  return (
    <ShippingZoneContext.Provider value={zone}>
      {children}
    </ShippingZoneContext.Provider>
  );
}

export function useShippingZone(): ShippingZone | null {
  return useContext(ShippingZoneContext);
}
