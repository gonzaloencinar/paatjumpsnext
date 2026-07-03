import OpengraphImage from "components/opengraph-image";
import { defaultLocale, isLocale } from "lib/i18n/config";
import { getPage } from "lib/shopify";

export default async function Image({
  params,
}: {
  params: { locale: string; page: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const page = await getPage(params.page, locale);
  const title = page.seo?.title || page.title;

  return await OpengraphImage({ title });
}
