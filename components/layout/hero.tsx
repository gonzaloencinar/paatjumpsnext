import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

/**
 * Home hero. Personal-brand led: Paat is the protagonist.
 *
 * ASSETS (in /public/hero/):
 *  - paat.webp       Cutout of Paat with NO background (transparent WebP),
 *                    shot vertically so she can bleed off the bottom edge.
 *
 * If you add a background video later (loop.mp4/loop.webm + poster.jpg in
 * /public/hero/), render it as an absolutely-positioned `-z-20` layer with
 * `autoPlay muted loop playsInline` and low opacity so text stays legible.
 * Only reference files that actually exist — a <video>/poster pointing at
 * missing assets fires 404 requests on every page view.
 */

const STATS = [
  { value: "+10k", label: "saltadores" },
  { value: "100%", label: "competición" },
  { value: "4.9★", label: "valoración" },
];

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-76px)] w-full flex-col overflow-hidden bg-neutral-950 md:h-[calc(100svh-76px)]">
      {/* ── Ambient color + vignette ─────────────────────────────────── */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_85%_20%,rgba(234,88,12,0.28),transparent_55%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-neutral-950/40" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-neutral-950 via-neutral-950/60 to-transparent" />

      {/* ── Paat (mobile only) — stands on the marquee just below so her legs aren't cut ── */}
      <div className="relative flex justify-center md:hidden">
        {/* Glow halo behind her */}
        <div className="absolute inset-x-10 bottom-0 -z-10 h-[70%] rounded-[40%] bg-orange-600/30 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero/paat.webp"
          alt="Paat Jumps, fundadora y referente del salto a la comba"
          fetchPriority="high"
          className="h-[42vh] w-auto object-contain drop-shadow-2xl"
        />
      </div>

      {/* On mobile the copy drops below the marquee (order-last); desktop keeps it centered. */}
      <div className="order-last mx-auto flex w-full max-w-(--breakpoint-2xl) flex-1 items-center px-4 md:order-none">
        <div className="grid w-full grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-4">
          {/* ── Copy ───────────────────────────────────────────────────── */}
          <div className="z-10 flex flex-col items-center md:col-span-6">
            <div className="flex max-w-xl flex-col items-start text-left">
              <h1 className="text-4xl leading-[0.95] font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                No todas las combas
                <br />
                <span className="text-orange-600">son iguales.</span>
              </h1>

              <p className="mt-6 max-w-md text-lg text-white/90 text-pretty">
                Paat Jumps nace de más de seis años de pasión por la comba. De
                aprender, mejorar y ayudar a miles de personas a descubrir este
                deporte. Cada comba está montada a mano y cuidada hasta el
                último detalle.
              </p>

              {/* CTAs */}
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/search"
                  prefetch={true}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-7 py-3.5 text-base font-semibold text-white transition hover:bg-orange-500"
                >
                  Elige la tuya
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              {/* Stats / social proof — dt is the label, dd the value; visual order flipped with flex-col-reverse */}
              <dl className="mt-12 flex items-center justify-start gap-8 md:mb-14">
                {STATS.map((s) => (
                  <div key={s.label} className="flex flex-col-reverse">
                    <dt className="text-xs tracking-wide text-white/50 uppercase">
                      {s.label}
                    </dt>
                    <dd className="text-2xl font-bold text-white">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* ── Paat (cutout, pinned to the bottom — legs bleed under the marquee) ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 hidden md:block">
        <div className="mx-auto flex w-full max-w-(--breakpoint-2xl) justify-end px-4">
          <div className="relative h-[92vh] w-1/2 max-w-3xl">
            {/* Glow halo behind her */}
            <div className="absolute inset-x-8 bottom-0 -z-10 h-[80%] rounded-[40%] bg-orange-600/30 blur-3xl" />
            {/* Plain <img> so a missing asset degrades silently instead of erroring */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero/paat.webp"
              alt="Paat Jumps, fundadora y referente del salto a la comba"
              className="absolute inset-x-0 bottom-0 mx-auto h-full w-auto object-contain object-bottom drop-shadow-2xl"
            />
          </div>
        </div>
      </div>

      {/* ── Scrolling marquee strip ──────────────────────────────────── */}
      <div className="relative mb-10 border-y border-white/10 bg-neutral-950/60 backdrop-blur md:mb-0">
        <div className="flex overflow-hidden">
          <div className="motion-safe:animate-[heroMarquee_30s_linear_infinite] flex shrink-0 items-center gap-10 py-3 pr-10 whitespace-nowrap">
            {Array.from({ length: 2 }).map((_, i) => (
              <MarqueeRow key={i} aria-hidden={i === 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const MARQUEE_ITEMS = [
  "Empuñaduras ergonómicas",
  "Hechas a mano en España",
  "Envío en 24/48h",
  "Usada por profesionales de la comba",
];

function MarqueeRow(props: { "aria-hidden"?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-10" {...props}>
      {MARQUEE_ITEMS.map((item) => (
        <span
          key={item}
          className="flex items-center gap-10 text-sm font-medium tracking-wide text-white/60 uppercase"
        >
          {item}
          <span className="h-1 w-1 rounded-full bg-orange-600" />
        </span>
      ))}
    </div>
  );
}
