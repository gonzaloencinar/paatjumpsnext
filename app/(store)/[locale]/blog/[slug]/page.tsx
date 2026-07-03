import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Prose from "components/prose";
import { markdownToHtml } from "lib/blog/markdown";
import { getPublishedPost } from "lib/blog/queries";
import { isLocale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { pagePath } from "lib/i18n/routes";
import { baseUrl } from "lib/utils";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const post = await getPublishedPost(params.slug);
  if (!post) return notFound();

  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt,
    // Contenido solo en español → canonical siempre a la URL raíz.
    alternates: { canonical: pagePath("es", `blog/${post.slug}`) },
    openGraph: {
      type: "article",
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      ...(post.cover_image_url ? { images: [post.cover_image_url] } : {}),
    },
  };
}

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: "Europe/Madrid",
});

export default async function BlogPostPage(props: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const params = await props.params;
  if (!isLocale(params.locale)) return notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const post = await getPublishedPost(params.slug);
  if (!post) return notFound();

  const url = `${baseUrl}${pagePath("es", `blog/${post.slug}`)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seo_description || post.excerpt || undefined,
    inLanguage: "es",
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    mainEntityOfPage: url,
    url,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
    author: { "@type": "Person", name: post.author },
    publisher: { "@type": "Organization", name: "Paat Jumps", url: baseUrl },
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href={pagePath(locale, "blog")}
        className="text-sm text-white/70 transition-colors hover:text-orange-400"
      >
        ← {t.blog.backToBlog}
      </Link>
      <h1 className="mt-4 mb-3 text-4xl font-bold sm:text-5xl">{post.title}</h1>
      <p className="mb-10 text-sm text-white/50">
        {post.published_at
          ? `${t.blog.publishedPrefix} ${dateFormat.format(new Date(post.published_at))} · `
          : null}
        {post.author}
      </p>
      {post.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover_image_url}
          alt={post.title}
          className="mb-10 w-full rounded-2xl"
          loading="lazy"
        />
      ) : null}
      <Prose className="!max-w-none" html={markdownToHtml(post.content_md)} />
    </article>
  );
}
