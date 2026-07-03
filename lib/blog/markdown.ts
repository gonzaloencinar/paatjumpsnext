import { marked } from "marked";

// Markdown → HTML del blog. El contenido lo escriben solo los admins del CRM
// (misma confianza que el body_html de campañas), así que no se sanitiza.
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true }) as string;
}
