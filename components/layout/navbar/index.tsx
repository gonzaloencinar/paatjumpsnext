import CartModal from "components/cart/modal";
import LogoIcon from "components/icons/logo";
import { getCollections } from "lib/shopify";
import Link from "next/link";
import { Suspense } from "react";
import CategoryMenu, { CategoryMenuItem } from "./category-menu";
import MobileMenu from "./mobile-menu";
import Search, { SearchSkeleton } from "./search";

const { SITE_NAME } = process.env;

export async function Navbar() {
  const collections = await getCollections();

  // `getCollections` prepends an "All" entry (empty handle) and keeps Shopify's
  // default `frontpage` collection — neither is a real product category.
  const categories: CategoryMenuItem[] = collections
    .filter(
      (collection) =>
        collection.handle &&
        collection.handle !== "frontpage" &&
        !collection.handle.startsWith("hidden"),
    )
    .map((collection) => ({
      title: collection.title,
      path: collection.path,
      handle: collection.handle,
      description: collection.description,
    }));

  return (
    <nav className="relative mx-auto flex max-w-(--breakpoint-2xl) items-center justify-between p-4">
      <div className="block flex-none md:hidden">
        <Suspense fallback={null}>
          <MobileMenu categories={categories} />
        </Suspense>
      </div>
      <div className="flex w-full items-center">
        <div className="flex w-full items-center md:w-1/3 md:gap-6">
          <Link
            href="/"
            prefetch={true}
            className="flex w-full items-center justify-center md:w-auto"
            aria-label={SITE_NAME}
          >
            <LogoIcon className="h-10 w-auto" />
          </Link>
          {categories.length ? (
            <ul className="hidden gap-6 text-sm md:flex md:items-center">
              <li>
                <CategoryMenu categories={categories} />
              </li>
            </ul>
          ) : null}
        </div>
        <div className="hidden justify-center md:flex md:w-1/3">
          <Suspense fallback={<SearchSkeleton />}>
            <Search />
          </Suspense>
        </div>
        <div className="flex justify-end md:w-1/3">
          <CartModal />
        </div>
      </div>
    </nav>
  );
}
