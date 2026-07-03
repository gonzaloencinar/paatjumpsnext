"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Prose from "components/prose";
import { createBlogPost, updateBlogPost } from "@/lib/crm/blog-actions";
import type { ActionState } from "@/lib/crm/actions";
import { markdownToHtml } from "@/lib/blog/markdown";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { BlogPost } from "@/lib/crm/format";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ISO UTC → "YYYY-MM-DDTHH:mm" en hora de Madrid (valor de datetime-local).
function toMadridLocal(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(" ", "T");
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={value > max ? "text-destructive tabular-nums" : "tabular-nums"}
    >
      {value}/{max}
    </span>
  );
}

export function BlogPostForm({ post }: { post?: BlogPost }) {
  const action = post ? updateBlogPost.bind(null, post.id) : createBlogPost;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [content, setContent] = useState(post?.content_md ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(
    post?.seo_description ?? "",
  );
  const [preview, setPreview] = useState(false);

  const previewHtml = useMemo(
    () => (preview ? markdownToHtml(content) : ""),
    [preview, content],
  );

  useEffect(() => {
    if (state?.ok) toast.success("Entrada guardada");
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="post-title">Título</FieldLabel>
            <Input
              id="post-title"
              name="title"
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              placeholder="Cómo saltar a la comba desde cero"
            />
            <FieldDescription>
              Es el H1 de la entrada y el título por defecto en Google.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="post-slug">Slug</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">
                /blog/
              </span>
              <Input
                id="post-slug"
                name="slug"
                required
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                onBlur={(event) => setSlug(slugify(event.target.value))}
                placeholder="como-saltar-a-la-comba"
                className="font-mono text-xs"
              />
            </div>
            <FieldDescription>
              Cambiarlo después de publicar rompe la URL indexada — evítalo.
            </FieldDescription>
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="post-status">Estado</FieldLabel>
              <select
                id="post-status"
                name="status"
                defaultValue={post?.status ?? "draft"}
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="draft">Borrador</option>
                <option value="published">Publicada</option>
              </select>
              <FieldDescription>
                Con fecha futura queda programada y se publica sola.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="post-published">
                Fecha de publicación (Madrid)
              </FieldLabel>
              <Input
                id="post-published"
                name="published_local"
                type="datetime-local"
                defaultValue={toMadridLocal(post?.published_at ?? null)}
              />
              <FieldDescription>
                Vacía y en «Publicada» = ahora mismo.
              </FieldDescription>
            </Field>
          </div>

          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="post-content">
                Contenido (markdown)
              </FieldLabel>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={preview ? "ghost" : "secondary"}
                  onClick={() => setPreview(false)}
                >
                  Escribir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={preview ? "secondary" : "ghost"}
                  onClick={() => setPreview(true)}
                >
                  Vista previa
                </Button>
              </div>
            </div>
            {/* El textarea sigue montado en vista previa para que el valor viaje en el FormData */}
            <Textarea
              id="post-content"
              name="content_md"
              rows={24}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={"## Un subtítulo\n\nEscribe en markdown…"}
              className={preview ? "hidden" : "font-mono text-xs"}
            />
            {preview ? (
              <div className="min-h-96 rounded-md border p-6">
                <Prose className="!max-w-none text-sm" html={previewHtml} />
              </div>
            ) : null}
            <FieldDescription>
              Títulos con <code className="font-mono">##</code>, enlaces con{" "}
              <code className="font-mono">[texto](/combas)</code>. El H1 sale
              del título de arriba: dentro usa{" "}
              <code className="font-mono">##</code> en adelante.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="post-excerpt">
              Extracto <Counter value={excerpt.length} max={200} />
            </FieldLabel>
            <Textarea
              id="post-excerpt"
              name="excerpt"
              rows={2}
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              placeholder="Resumen corto para el listado del blog."
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="post-cover">
              Imagen de portada (URL)
            </FieldLabel>
            <Input
              id="post-cover"
              name="cover_image_url"
              type="url"
              defaultValue={post?.cover_image_url ?? ""}
              placeholder="https://cdn.shopify.com/…"
            />
            <FieldDescription>
              Opcional. Sirve también de imagen para compartir (og:image).
            </FieldDescription>
          </Field>
        </FieldGroup>

        <FieldGroup>
          <h2 className="text-sm font-semibold">SEO</h2>

          <Field>
            <FieldLabel htmlFor="post-seo-title">
              Título SEO <Counter value={seoTitle.length} max={60} />
            </FieldLabel>
            <Input
              id="post-seo-title"
              name="seo_title"
              value={seoTitle}
              onChange={(event) => setSeoTitle(event.target.value)}
              placeholder="Si se deja vacío se usa el título"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="post-seo-description">
              Meta descripción{" "}
              <Counter value={seoDescription.length} max={160} />
            </FieldLabel>
            <Textarea
              id="post-seo-description"
              name="seo_description"
              rows={2}
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
              placeholder="Lo que Google muestra bajo el título."
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="post-keywords">Keyword objetivo</FieldLabel>
            <Input
              id="post-keywords"
              name="keywords"
              defaultValue={post?.keywords ?? ""}
              placeholder="saltar a la comba, comba principiantes"
            />
            <FieldDescription>
              Solo para uso interno: la intención de búsqueda que ataca la
              entrada.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {post ? "Guardar cambios" : "Crear entrada"}
        </Button>
        {post?.status === "published" ? (
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground transition-colors hover:text-orange-400"
          >
            Ver en la web ↗
          </a>
        ) : null}
      </div>
    </form>
  );
}
