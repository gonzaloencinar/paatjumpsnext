"use client";

import { ArrowRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type CategoryMenuItem = {
  title: string;
  path: string;
  handle: string;
  description?: string;
};

export default function CategoryMenu({
  categories,
  allHref = "/search",
}: {
  categories: CategoryMenuItem[];
  allHref?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openMenu = () => {
    cancelClose();
    setOpen(true);
  };
  // Small delay so moving the cursor between the trigger and the panel
  // doesn't flicker the menu closed.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  // Close when navigating to a new route.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => cancelClose(), []);

  if (!categories.length) return null;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onFocus={openMenu}
        className={clsx(
          "flex items-center gap-1 text-sm transition-colors",
          open ? "text-orange-400" : "text-white hover:text-orange-400",
        )}
      >
        Ver combas
        <ChevronDownIcon
          className={clsx(
            "h-4 w-4 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* The panel keeps a transparent top padding (pt-3) that bridges the gap to
          the trigger, so the cursor never leaves the wrapper while moving down. */}
      <div
        className={clsx(
          "absolute left-0 top-full z-50 pt-3",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={clsx(
            "w-[min(92vw,44rem)] origin-top-left rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl shadow-black/10 ring-1 ring-black/5 transition-all duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/40",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-[0.98] opacity-0",
          )}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {/* Category list */}
            <div className="sm:col-span-3">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-white/50">
                Nuestras combas
              </p>
              <ul>
                {categories.map((category, index) => (
                  <li key={category.handle || category.path}>
                    <Link
                      href={category.path}
                      prefetch={true}
                      className="group/item flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/5"
                    >
                      <span className="mt-0.5 text-xs font-semibold tabular-nums text-orange-600">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="font-semibold text-white transition-colors group-hover/item:text-orange-400">
                            {category.title}
                          </span>
                          <ArrowRightIcon className="h-3.5 w-3.5 -translate-x-1 text-orange-400 opacity-0 transition-all duration-200 group-hover/item:translate-x-0 group-hover/item:opacity-100" />
                        </span>
                        {category.description ? (
                          <span className="mt-0.5 line-clamp-2 block text-sm text-white/60">
                            {category.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* "View all" featured promo */}
            <div className="sm:col-span-2">
              <Link
                href={allHref}
                prefetch={true}
                className="group/all relative flex h-full flex-col justify-between overflow-hidden rounded-xl bg-orange-600 p-5 text-white"
              >
                {/* Decorative rope loops */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 text-white/10"
                >
                  <ellipse
                    cx="50"
                    cy="50"
                    rx="30"
                    ry="46"
                    transform="rotate(35 50 50)"
                  />
                  <ellipse
                    cx="50"
                    cy="50"
                    rx="17"
                    ry="30"
                    transform="rotate(35 50 50)"
                  />
                </svg>

                <div className="relative">
                  <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                    Todo el catálogo
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug">
                    ¿No sabes cuál elegir?
                  </p>
                  <p className="mt-1 text-sm text-white/80">
                    Explora todas las combas Paat Jumps en un solo lugar.
                  </p>
                </div>
                <span className="relative mt-5 inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-orange-700 transition-all group-hover/all:gap-3">
                  Ver todas las combas
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
