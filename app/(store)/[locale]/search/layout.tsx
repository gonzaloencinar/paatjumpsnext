import Footer from "components/layout/footer";
import { defaultLocale, isLocale } from "lib/i18n/config";
import ChildrenWrapper from "./children-wrapper";
import { Suspense } from "react";

export default async function SearchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;

  return (
    <>
      <div className="mx-auto min-h-screen w-full max-w-(--breakpoint-2xl) px-4 pb-4">
        <Suspense fallback={null}>
          <ChildrenWrapper>{children}</ChildrenWrapper>
        </Suspense>
      </div>
      <Footer locale={locale} />
    </>
  );
}
