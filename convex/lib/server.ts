// Gate de las funciones "server-only" hasta que llegue Convex Auth (F3):
// el servidor Next envía serverKey (CONVEX_SERVER_KEY) y aquí se compara con
// SERVER_KEY del deployment. Equivale al service role de Supabase — ninguna
// función con este gate es utilizable desde un navegador.
export function assertServerKey(key: string) {
  const expected = process.env.SERVER_KEY;
  if (!expected || key !== expected) throw new Error("No autorizado");
}
