import { PageHeader } from "@/components/admin/page-header";
import { BlogPostForm } from "@/components/admin/blog-post-form";

export const metadata = { title: "Nueva entrada" };

export default function NewBlogPostPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nueva entrada"
        description="Markdown + campos SEO; con fecha futura queda programada"
      />
      <div className="p-4 md:p-6">
        <BlogPostForm />
      </div>
    </div>
  );
}
