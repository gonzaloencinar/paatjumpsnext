// Copia cliente del texto de consentimiento. La fuente de verdad server-side
// (lo que se guarda en contacts.consent_text) está en lib/crm/config.ts —
// mantener ambos idénticos si cambia el copy. La versión EN es la traducción
// mostrada a visitantes internacionales; el registro legal guarda el texto ES.
import type { Locale } from "lib/i18n/config";

const CONSENT_TEXT: Record<Locale, string> = {
  es: "Quiero recibir por email mi código de bienvenida y las novedades y ofertas de Paat Jumps. He leído y acepto la política de privacidad.",
  en: "I want to receive my welcome code plus Paat Jumps news and offers by email. I have read and accept the privacy policy.",
};

export function crmConsentText(locale: Locale): string {
  return CONSENT_TEXT[locale] ?? CONSENT_TEXT.es;
}

export const CRM_PRIVACY_PATH = "/politica-de-privacidad";
