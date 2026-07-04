// Identidad del visitante para recuperar carritos que no llegan al checkout:
// los enlaces de los emails del CRM llevan ?pj=<token firmado> y el proxy lo
// deja en una cookie httpOnly (también se setea al suscribirse). El token es
// `base64url(email).hmac` y SIEMPRE se verifica la firma al usarlo — una
// cookie manipulada simplemente no identifica. Solo constantes aquí: este
// módulo lo importa el proxy (Edge, sin node:crypto); las funciones de firma
// viven en lib/email/tokens.ts.

export const IDENTITY_COOKIE = "pj_contact";
export const IDENTITY_PARAM = "pj";
export const IDENTITY_MAX_AGE = 60 * 60 * 24 * 180; // 180 días
