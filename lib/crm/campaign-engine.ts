import { materializeCampaignAudience, parseFacets } from "@/lib/crm/segments";
import { IDENTITY_PARAM } from "@/lib/crm/identity";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import { sendCrmEmail } from "@/lib/email/send";
import { CampaignEmail } from "@/lib/email/templates/campaign";
import { identityToken, unsubscribeUrl } from "@/lib/email/tokens";
import { baseUrl } from "@/lib/utils";

// Motor de envío de campañas (plan §16.3). Lo dispara el cron cada minuto:
// cada tick es idempotente y re-entrante — reclama un lote pequeño vía la
// mutation transaccional claimCampaignBatch (el sustituto del RPC skip
// locked), envía uno a uno respetando el rate limit de Resend (~2 req/s)
// y termina dentro del maxDuration de la función. Lo pendiente cae al
// siguiente tick. El batch API de Resend queda como optimización futura
// cuando el volumen lo pida.

const BATCH_SIZE = 40; // 40 × 600 ms ≈ 24 s de envío por tick, cabe en maxDuration=60
const SEND_INTERVAL_MS = 600;
const MAX_CONSECUTIVE_FAILURES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// {{nombre}} en asunto y cuerpo → nombre del contacto. Sin nombre, se limpia
// el hueco y la puntuación colgada ("¡Hola, {{nombre}}!" → "¡Hola!").
export function mergeName(text: string, firstName: string | null) {
  const name = firstName?.trim() ?? "";
  const replaced = text.replace(/\{\{\s*nombre\s*\}\}/gi, name);
  if (name) return replaced;
  return replaced
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([!?.,;:])/g, "$1")
    .replace(/[,;:]+([!?.])/g, "$1");
}

// Etiquetado UTM de los enlaces a la tienda: el AttributionTracker del
// storefront persiste estos parámetros hasta el checkout y acaban en el
// pedido, así /admin/analytics atribuye ingresos a cada campaña por nombre
// (además de la atribución por ventana de clic del webhook).
const STORE_HOSTS = /(^|\.)paatjumps\.com$/i;

export function tagStoreLinks(
  html: string,
  campaignName: string,
  identityEmail?: string | null,
) {
  const campaign = campaignName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60);
  const identity = identityEmail ? identityToken(identityEmail) : null;
  return html.replace(/href="([^"]+)"/gi, (match, href: string) => {
    try {
      const url = new URL(href);
      const isStore =
        STORE_HOSTS.test(url.hostname) || `https://${url.host}` === baseUrl;
      if (!isStore) return match;
      if (!url.searchParams.has("utm_source")) {
        url.searchParams.set("utm_source", "crm");
        url.searchParams.set("utm_medium", "email");
        if (campaign) url.searchParams.set("utm_campaign", campaign);
      }
      // ?pj= → cookie de identidad al aterrizar (proxy.ts): habilita la
      // recuperación de carritos que no llegan al checkout
      if (identity) url.searchParams.set(IDENTITY_PARAM, identity);
      return `href="${url.toString()}"`;
    } catch {
      return match; // href relativo o malformado: se deja tal cual
    }
  });
}

export type CampaignTickSummary = {
  promoted: number; // scheduled → sending este tick
  sent: number;
  skipped: number;
  failed: number;
  completed: string[]; // campañas que terminaron este tick
};

export async function processCampaigns(): Promise<CampaignTickSummary> {
  const summary: CampaignTickSummary = {
    promoted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    completed: [],
  };

  // 1) Programadas que ya tocan: materializar el snapshot del segmento y
  //    pasar a 'sending' (idempotente: los destinatarios ya presentes se
  //    ignoran; la promoción es un update condicional optimista).
  const due = await convexQuery(api.engine.dueScheduledCampaigns, {
    now: Date.now(),
  });

  for (const campaign of due) {
    await materializeCampaignAudience(
      null,
      campaign.id,
      parseFacets(campaign.segment),
    );
    await convexMutation(api.engine.promoteScheduled, { id: campaign.id });
    summary.promoted += 1;
  }

  // 2) Campañas en envío: presupuesto de tick compartido entre todas.
  const sending = await convexQuery(api.engine.sendingCampaigns, {});

  let budget = BATCH_SIZE;

  for (const campaign of sending) {
    if (budget <= 0) break;

    const batch = await convexMutation(api.engine.claimCampaignBatch, {
      id: campaign.id,
      limit: budget,
    });

    if (batch.length === 0) {
      await finalizeIfDone(campaign, summary);
      continue;
    }

    let consecutiveFailures = 0;

    for (const recipient of batch) {
      budget -= 1;
      try {
        const result = await sendCrmEmail({
          to: recipient.email,
          subject: mergeName(campaign.subject ?? "", recipient.firstName),
          react: CampaignEmail({
            bodyHtml: tagStoreLinks(
              mergeName(campaign.bodyHtml ?? "", recipient.firstName),
              campaign.name,
              recipient.email,
            ),
            preheader: campaign.preheader,
            unsubscribeUrl: unsubscribeUrl(recipient.email),
          }),
          template: "campaign",
          contactId: recipient.contactId,
          campaignId: campaign.id,
          // Determinista: repetir el tick tras un crash no duplica el email
          // (Resend dedupe por Idempotency-Key).
          idempotencyKey: `campaign:${campaign.id}:recipient:${recipient.id}`,
        });

        if ("skipped" in result) {
          await convexMutation(api.engine.markRecipient, {
            id: recipient.id,
            status: "skipped",
          });
          summary.skipped += 1;
        } else {
          await convexMutation(api.engine.markRecipient, {
            id: recipient.id,
            status: "sent",
            emailSendId: result.emailSendId,
          });
          summary.sent += 1;
        }
        consecutiveFailures = 0;
      } catch (error) {
        console.error(
          `[campaigns] fallo enviando a destinatario ${recipient.id}`,
          error,
        );
        await convexMutation(api.engine.markRecipient, {
          id: recipient.id,
          status: "failed",
        });
        summary.failed += 1;
        consecutiveFailures += 1;
        // Fallos seguidos = problema del proveedor, no del destinatario:
        // cortar el tick; lo reclamado sin enviar lo rescata el claim de 15 min.
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return summary;
      }
      await sleep(SEND_INTERVAL_MS);
    }

    await finalizeIfDone(campaign, summary);
  }

  return summary;
}

async function finalizeIfDone(
  campaign: { id: string; name: string },
  summary: CampaignTickSummary,
) {
  const completed = await convexMutation(api.engine.finalizeCampaignIfDone, {
    id: campaign.id,
  });
  if (completed) summary.completed.push(campaign.name);
}
