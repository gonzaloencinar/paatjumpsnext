import { baseUrl } from "lib/utils";

export const CRM = {
  baseUrl,
  emailFrom: "Paat Jumps <hola@paatjumps.com>",
  // Texto EXACTO que acompaña al checkbox de la barra: se guarda como prueba
  // de consentimiento (contacts.consent_text). Si cambia el copy, cambia aquí.
  consentText:
    "Quiero recibir por email mi código de bienvenida y las novedades y ofertas de Paat Jumps. He leído y acepto la política de privacidad.",
  privacyPath: "/politica-de-privacidad",
  discountPercentage: 20,
} as const;
