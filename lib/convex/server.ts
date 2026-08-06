import { fetchMutation, fetchQuery } from "convex/nextjs";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

// Puente servidor Next → Convex hasta que llegue Convex Auth (F3). Las
// funciones "server-only" exigen serverKey (validado en convex/lib/server.ts);
// estos helpers lo inyectan desde el env para que los call sites no lo vean.

function serverKey() {
  const value = process.env.CONVEX_SERVER_KEY;
  if (!value) throw new Error("Falta CONVEX_SERVER_KEY en el entorno");
  return value;
}

export function convexQuery<Q extends FunctionReference<"query">>(
  fn: Q,
  args: Omit<FunctionArgs<Q>, "serverKey">,
): Promise<FunctionReturnType<Q>> {
  return fetchQuery(fn, { ...args, serverKey: serverKey() } as FunctionArgs<Q>);
}

export function convexMutation<M extends FunctionReference<"mutation">>(
  fn: M,
  args: Omit<FunctionArgs<M>, "serverKey">,
): Promise<FunctionReturnType<M>> {
  return fetchMutation(fn, {
    ...args,
    serverKey: serverKey(),
  } as FunctionArgs<M>);
}

/** ms epoch de Convex → ISO string (forma legacy que esperan los componentes) */
export function msToIso(ms: number | undefined): string | null {
  return ms === undefined ? null : new Date(ms).toISOString();
}
