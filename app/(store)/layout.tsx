import { CartProvider } from "components/cart/cart-context";
import { Navbar } from "components/layout/navbar";
import { AnnouncementBar } from "components/marketing/announcement-bar";
import { DiscountCodeHandler } from "components/marketing/discount-code-handler";
import { WelcomeToast } from "components/welcome-toast";
import { getAnnouncedPromotion } from "lib/crm/promotions";
import { getCart } from "lib/shopify";
import { ReactNode } from "react";

export default async function StoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Don't await the fetch, pass the Promise to the context provider
  const cart = getCart();
  // Barra de captación: la gobierna el toggle "Anuncio web" de /admin/promotions
  const promo = await getAnnouncedPromotion();

  return (
    <CartProvider cartPromise={cart}>
      {promo ? (
        <AnnouncementBar
          name={promo.name}
          percentage={promo.percentage}
          endsAt={promo.ends_at}
        />
      ) : null}
      <Navbar />
      <main>
        {children}
        <WelcomeToast />
      </main>
      <DiscountCodeHandler />
    </CartProvider>
  );
}
