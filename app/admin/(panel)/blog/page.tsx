import Link from "next/link";
import { NewspaperIcon, PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/crm/format";
import { listBlogPosts } from "@/lib/crm/queries";

export const metadata = { title: "Blog" };

function PostStatusBadge({
  status,
  publishedAt,
}: {
  status: string;
  publishedAt: string | null;
}) {
  if (status !== "published")
    return <Badge variant="secondary">Borrador</Badge>;
  const scheduled = publishedAt && new Date(publishedAt).getTime() > Date.now();
  return scheduled ? (
    <Badge variant="outline">Programada</Badge>
  ) : (
    <Badge>Publicada</Badge>
  );
}

export default async function BlogAdminPage() {
  const posts = await listBlogPosts();

  const newButton = (
    <Button size="sm" render={<Link href="/admin/blog/new" />}>
      <PlusIcon data-icon="inline-start" />
      Nueva entrada
    </Button>
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Blog"
        description="Entradas del blog de la tienda (/blog)"
        actions={posts.length > 0 ? newButton : undefined}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {posts.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <NewspaperIcon />
              </EmptyMedia>
              <EmptyTitle>Todavía no hay entradas</EmptyTitle>
              <EmptyDescription>
                Escribe la primera en markdown, con sus campos SEO, y prográmala
                para cuando quieras.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{newButton}</EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Slug</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Publicación
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Link
                        href={`/admin/blog/${post.id}`}
                        className="font-medium transition-colors hover:text-orange-400"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <PostStatusBadge
                        status={post.status}
                        publishedAt={post.published_at}
                      />
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate font-mono text-xs text-muted-foreground md:table-cell">
                      /blog/{post.slug}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {formatDateTime(post.published_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
