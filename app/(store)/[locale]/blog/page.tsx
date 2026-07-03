import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPosts } from "lib/blog/queries";
import { isLocale } from "lib/i18n/config";
import { getDictionary } from "lib/i18n/dictionaries";
import { pagePath } from "lib/i18n/routes";

// El contenido del blog solo existe en español: la canonical apunta siempre a
// la URL raíz (/blog) aunque se visite bajo /en.
export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await props.params;
  if (!isLocale(raw)) return notFound();
  const t = getDictionary(raw);
  return {
    title: t.blog.metaTitle,
    description: t.blog.metaDescription,
    alternates: { canonical: pagePath("es", "blog") },
  };
}

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: "Europe/Madrid",
});

export default async function BlogIndexPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await props.params;
  if (!isLocale(raw)) return notFound();
  const locale = raw;
  const t = getDictionary(locale);
  const posts = await getPublishedPosts();

  return (
    <>
      <h1 className="mb-3 text-5xl font-bold">{t.blog.title}</h1>
      <p className="mb-12 text-white/70">{t.blog.metaDescription}</p>

      {posts.length === 0 ? (
        <p className="text-white/70">{t.blog.empty}</p>
      ) : (
        <div className="flex flex-col gap-10">
          {posts.map((post) => (
            <article key={post.slug}>
              <p className="mb-1 text-sm text-white/50">
                {post.published_at
                  ? dateFormat.format(new Date(post.published_at))
                  : null}
              </p>
              <h2 className="text-2xl font-semibold">
                <Link
                  href={pagePath(locale, `blog/${post.slug}`)}
                  className="transition-colors hover:text-orange-400"
                >
                  {post.title}
                </Link>
              </h2>
              {post.excerpt ? (
                <p className="mt-2 leading-7 text-white/70">{post.excerpt}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
