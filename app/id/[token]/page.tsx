import { redirect } from "next/navigation";
import { getDniRequestByToken, submitDniForm } from "@/lib/crm/dni-requests";

// Formulario público estilo Typeform para que el cliente envíe su DNI/NIE
// (peticiones de lib/crm/dni-requests.ts; enlace firmado en el email).
// Una sola pregunta, a pantalla completa, en el idioma de la petición.

export const dynamic = "force-dynamic";

const COPY = {
  es: {
    question: "¿Nos dices tu DNI o NIE?",
    explain: (order: string) =>
      `Tu pedido ${order} va a Canarias, Ceuta o Melilla y la agencia de transporte necesita el documento del destinatario para el despacho de aduana. Solo lo usaremos para generar tu envío.`,
    placeholder: "12345678A",
    submit: "Enviar",
    enterHint: "o pulsa Intro ↵",
    error: "Ese documento no parece válido. Revísalo e inténtalo otra vez.",
    thanksTitle: "¡Listo, gracias!",
    thanksBody: (order: string) =>
      `Ya tenemos tu documento. Prepararemos el envío de tu pedido ${order} enseguida.`,
    invalidTitle: "Este enlace no es válido",
    invalidBody:
      "Puede que esté incompleto. Escríbenos a contacto@paatjumps.com y lo resolvemos.",
  },
  en: {
    question: "What's your ID number?",
    explain: (order: string) =>
      `Your order ${order} ships internationally and the carrier needs the recipient's ID number (national ID or passport) for customs clearance. We'll only use it to create your shipment.`,
    placeholder: "Your ID or passport number",
    submit: "Submit",
    enterHint: "or press Enter ↵",
    error: "That ID number doesn't look valid. Please check it and try again.",
    thanksTitle: "All set — thank you!",
    thanksBody: (order: string) =>
      `We've got your ID. Your order ${order} will be on its way soon.`,
    invalidTitle: "This link is not valid",
    invalidBody:
      "It may be incomplete. Email us at contacto@paatjumps.com and we'll sort it out.",
  },
} as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <p className="mb-10 text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
          Paat Jumps
        </p>
        {children}
      </div>
    </main>
  );
}

export default async function DniFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const request = await getDniRequestByToken(decodeURIComponent(token));

  if (!request) {
    // Idioma desconocido sin petición: bilingüe corto
    const es = COPY.es;
    const en = COPY.en;
    return (
      <Shell>
        <h1 className="text-3xl font-semibold">{es.invalidTitle}</h1>
        <p className="mt-3 text-white/70">{es.invalidBody}</p>
        <p className="mt-6 text-sm text-white/50">
          {en.invalidTitle}. {en.invalidBody}
        </p>
      </Shell>
    );
  }

  const t = COPY[request.locale];

  if (request.submitted) {
    return (
      <Shell>
        <h1 className="text-3xl font-semibold">{t.thanksTitle}</h1>
        <p className="mt-3 max-w-lg text-lg leading-relaxed text-white/70">
          {t.thanksBody(request.orderName)}
        </p>
      </Shell>
    );
  }

  async function submit(formData: FormData) {
    "use server";
    const raw = String(formData.get("dni") ?? "");
    const ok = await submitDniForm(decodeURIComponent(token), raw);
    redirect(`/id/${token}${ok ? "" : "?error=1"}`);
  }

  return (
    <Shell>
      <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
        {t.question}
      </h1>
      <p className="mt-4 max-w-lg text-base leading-relaxed text-white/70">
        {t.explain(request.orderName)}
      </p>
      <form action={submit} className="mt-10">
        <input
          name="dni"
          type="text"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={20}
          placeholder={t.placeholder}
          className="w-full border-b-2 border-white/25 bg-transparent pb-3 text-2xl uppercase tracking-wide outline-none transition-colors placeholder:normal-case placeholder:text-white/30 focus:border-orange-400 sm:text-3xl"
        />
        {error ? <p className="mt-3 text-sm text-red-400">{t.error}</p> : null}
        <div className="mt-8 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-orange-400"
          >
            {t.submit}
          </button>
          <span className="text-sm text-white/50">{t.enterHint}</span>
        </div>
      </form>
    </Shell>
  );
}
