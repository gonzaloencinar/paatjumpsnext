import { Carousel } from "components/carousel";
import Footer from "components/layout/footer";
import { Hero } from "components/layout/hero";

export const metadata = {
  description:
    "Combas de saltar hechas a mano para atletas. Cable de acero recubierto y diseño duradero.",
  openGraph: {
    type: "website",
  },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Carousel />
      <Footer />
    </>
  );
}
