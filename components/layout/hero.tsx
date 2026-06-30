import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

/**
 * Home hero. Personal-brand led: Paat is the protagonist.
 *
 * ASSETS (drop into /public/hero/, all optional — the section degrades gracefully):
 *  - paat.png        Cutout of Paat with NO background (transparent PNG/WebP),
 *                    ideally mid-jump or in a confident pose, shot vertically so
 *                    she can bleed off the bottom edge. ~1200x1600px+.
 *  - loop.mp4        Short muted loop (rope spinning / training b-roll) for the
 *                    background. Keep it dark/low-contrast so text stays legible.
 *                    Add loop.webm too for better compression if you can.
 *  - poster.jpg      Fallback still shown before/instead of the video.
 *  - signature.png   Optional white handwritten "Paat" signature (transparent).
 *
 * No asset? Each layer just isn't rendered — the gradient + glow still look good.
 */

const STATS = [
  { value: "+10k", label: "saltadores" },
  { value: "100%", label: "competición" },
  { value: "4.9★", label: "valoración" },
];

export function Hero() {
  return (
    <section className="relative isolate flex h-[calc(100svh-76px)] w-full flex-col overflow-hidden bg-neutral-950">
      {/* ── Background video (optional) ──────────────────────────────── */}
      <video
        className="absolute inset-0 -z-20 h-full w-full object-cover opacity-30"
        autoPlay
        muted
        loop
        playsInline
        poster="/hero/poster.jpg"
      >
        <source src="/hero/loop.webm" type="video/webm" />
        <source src="/hero/loop.mp4" type="video/mp4" />
      </video>

      {/* ── Ambient color + vignette ─────────────────────────────────── */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_85%_20%,rgba(234,88,12,0.28),transparent_55%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-neutral-950/40" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-neutral-950 via-neutral-950/60 to-transparent" />

      <div className="mx-auto flex w-full max-w-(--breakpoint-2xl) flex-1 items-center px-4">
        <div className="grid w-full grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-4">
        {/* ── Copy ───────────────────────────────────────────────────── */}
        <div className="z-10 flex flex-col items-center md:col-span-6">
          <div className="flex max-w-xl flex-col items-start text-left">
          <h1 className="text-5xl leading-[0.95] font-bold tracking-tight text-balance text-white sm:text-6xl lg:text-7xl">
            Las mejores combas{" "}
            <span className="text-orange-600">del mercado.</span>
          </h1>

          <p className="mt-6 max-w-md text-lg text-white/70 text-pretty">
            Cada cuerda, rodamiento y empuñadura nace de miles de horas saltando.
            Velocidad, control y durabilidad de competición — pensadas por una
            referente para principiantes y atletas.
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/search"
              prefetch={true}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-7 py-3.5 text-base font-semibold text-white transition hover:bg-orange-500"
            >
              Comprar combas
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/about"
              prefetch={true}
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-3.5 text-base font-semibold text-white transition hover:border-orange-400 hover:text-orange-400"
            >
              Conoce a Paat
            </Link>
          </div>

          {/* Stats / social proof */}
          <dl className="mt-12 flex items-center justify-start gap-8 md:mb-14">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col">
                <dt className="text-2xl font-bold text-white">{s.value}</dt>
                <dd className="text-xs tracking-wide text-white/50 uppercase">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
          </div>
        </div>

        {/* ── Paat (cutout, vertically centered) ─────────────────────── */}
        <div className="relative z-0 hidden md:col-span-6 md:block">
          <div className="relative mx-auto aspect-3/4 max-h-[70vh] w-full max-w-xl">
            {/* Glow halo behind her */}
            <div className="absolute inset-x-8 bottom-0 -z-10 h-[80%] rounded-[40%] bg-orange-600/30 blur-3xl" />
            {/* Plain <img> so a missing asset degrades silently instead of erroring */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero/paat.png"
              alt="Paat Jumps, fundadora y referente del salto a la comba"
              className="motion-safe:animate-[heroFloat_6s_ease-in-out_infinite] absolute inset-x-0 bottom-0 mx-auto h-full w-auto object-contain object-bottom drop-shadow-2xl"
            />
            {/* Optional handwritten signature overlay */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero/signature.png"
              alt=""
              aria-hidden
              className="pointer-events-none absolute top-6 right-2 hidden h-16 w-auto opacity-80 lg:block"
            />
          </div>
        </div>
        </div>
      </div>

      {/* ── Scrolling marquee strip ──────────────────────────────────── */}
      <div className="relative border-y border-white/10 bg-neutral-950/60 backdrop-blur">
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
  "Rodamientos de competición",
  "Cable de acero recubierto",
  "Empuñaduras ergonómicas",
  "Diseño español",
  "Envío en 24/48h",
  "Usadas por atletas",
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
