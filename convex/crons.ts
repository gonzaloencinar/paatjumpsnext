import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Los crons de la tienda (automations, shopify-sync, packlink-sync) son de
// Vercel (vercel.json → app/api/cron/*). Aquí, los que solo tocan Convex.
const crons = cronJobs();

// Lista de email de FitComba (fitcombaLeads.ts).
crons.interval(
  "push leads to FitComba",
  { hours: 1 },
  internal.fitcombaLeads.push,
  {},
);

export default crons;
