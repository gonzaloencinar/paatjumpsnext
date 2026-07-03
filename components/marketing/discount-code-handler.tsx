"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { applyDiscountCode } from "components/cart/actions";

// Aterrizaje desde el email (plan §8): paatjumps.com/?code=PAAT-XXXX →
// guarda el código y lo aplica al carrito vía cartDiscountCodesUpdate.
// El descuento se ve en el carrito y se hereda en el checkout.

function DiscountCodeHandlerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || handled.current) return;
    handled.current = true;

    // Limpiar la URL primero para no re-aplicar en cada navegación.
    const params = new URLSearchParams(searchParams);
    params.delete("code");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
      scroll: false,
    });

    applyDiscountCode(code)
      .then((result) => {
        if (result.applied) {
          toast.success(`Código ${result.code} aplicado`, {
            description: "Verás el −20% en tu carrito y en el checkout.",
          });
        } else if (result.saved) {
          toast.info(`Código ${result.code} guardado`, {
            description: "Se aplicará automáticamente a tu carrito.",
          });
        }
      })
      .catch(() => {
        // Silencioso: el código sigue en el email y se puede pegar en el checkout.
      });
  }, [searchParams, pathname, router]);

  return null;
}

export function DiscountCodeHandler() {
  return (
    <Suspense fallback={null}>
      <DiscountCodeHandlerInner />
    </Suspense>
  );
}
