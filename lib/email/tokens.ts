import { createHmac, timingSafeEqual } from "node:crypto";
import { CRM } from "@/lib/crm/config";

// Links firmados en emails (baja, y en el futuro tracking propio §12):
// HMAC-SHA256(purpose:email) con EMAIL_LINK_SIGNING_SECRET. Sin caducidad:
// un link de baja debe funcionar siempre.

function secret() {
  const value = process.env.EMAIL_LINK_SIGNING_SECRET;
  if (!value) throw new Error("Falta EMAIL_LINK_SIGNING_SECRET");
  return value;
}

export function signEmailToken(purpose: string, email: string) {
  return createHmac("sha256", secret())
    .update(`${purpose}:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyEmailToken(
  purpose: string,
  email: string,
  token: string | null | undefined,
) {
  if (!token) return false;
  const expected = Buffer.from(signEmailToken(purpose, email));
  const received = Buffer.from(token);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function unsubscribeUrl(email: string) {
  const normalized = email.trim().toLowerCase();
  const encoded = Buffer.from(normalized).toString("base64url");
  return `${CRM.baseUrl}/api/unsubscribe?e=${encoded}&t=${signEmailToken("unsub", normalized)}`;
}
