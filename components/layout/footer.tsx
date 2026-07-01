import Link from "next/link";

import FooterMenu from "components/layout/footer-menu";
import LogoIcon from "components/icons/logo";
import { Suspense } from "react";

const { COMPANY_NAME, SITE_NAME } = process.env;

const footerMenu = [
  { title: "Todas", path: "/search" },
  { title: "PVC", path: "/search/combas-pvc" },
  { title: "Segmentadas", path: "/search/combas-segmentadas" },
];

export default async function Footer() {
  const copyrightDate = new Date().getFullYear();
  const skeleton =
    "w-full h-6 animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-700";
  const copyrightName = COMPANY_NAME || SITE_NAME || "";

  return (
    <footer className="mt-16 bg-orange-600 text-sm text-white/80 md:mt-0">
      <div className="mx-auto flex w-full max-w-(--breakpoint-2xl) flex-col gap-6 px-4 py-12 text-sm md:flex-row md:gap-12">
        <div>
          <Link
            className="flex items-center gap-2 text-black md:pt-1 dark:text-white"
            href="/"
            aria-label={SITE_NAME}
          >
            <LogoIcon className="h-6 w-auto" />
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="flex h-[188px] w-[200px] flex-col gap-2">
              <div className={skeleton} />
              <div className={skeleton} />
              <div className={skeleton} />
            </div>
          }
        >
          <FooterMenu menu={footerMenu} />
        </Suspense>
      </div>
      <div className="border-t border-white/20 py-6 text-sm">
        <div className="mx-auto flex w-full max-w-(--breakpoint-2xl) flex-col items-center gap-1 px-4 md:flex-row md:gap-0">
          <p>
            &copy; {copyrightDate} {copyrightName}
            {copyrightName.length && !copyrightName.endsWith(".")
              ? "."
              : ""}{" "}
            Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
