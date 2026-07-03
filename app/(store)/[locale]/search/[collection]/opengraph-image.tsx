import OpengraphImage from "components/opengraph-image";
import { defaultLocale, isLocale } from "lib/i18n/config";
import { getCollection } from "lib/shopify";

export default async function Image({
  params,
}: {
  params: { locale: string; collection: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const collection = await getCollection(params.collection, locale);
  const title = collection?.seo?.title || collection?.title;

  return await OpengraphImage({ title });
}
