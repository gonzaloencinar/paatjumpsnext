import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { BlogPostForm } from "@/components/admin/blog-post-form";
import { DeletePostButton } from "@/components/admin/delete-post-button";
import { getBlogPost } from "@/lib/crm/queries";

export const metadata = { title: "Editar entrada" };

export default async function EditBlogPostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const post = await getBlogPost(id);
  if (!post) notFound();

  return (
    <div className="flex flex-col">
      <PageHeader
        title={post.title}
        description={`/blog/${post.slug}`}
        actions={<DeletePostButton postId={post.id} />}
      />
      <div className="p-4 md:p-6">
        <BlogPostForm post={post} />
      </div>
    </div>
  );
}
