// Programación de campañas (plan §16.3): la hora se elige en horario de
// Madrid (donde opera la tienda) y las quiet hours evitan blasts nocturnos.

export const QUIET_HOURS = { start: 22, end: 9 } as const;
export const MADRID_TZ = "Europe/Madrid";

// Offset (ms) de una zona IANA en un instante dado, vía formatToParts:
// independiente del TZ del runtime (el truco new Date(toLocaleString()) se
// anula si la máquina ya está en esa zona).
function tzOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // h23: medianoche puede salir como "24"
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

// "YYYY-MM-DDTHH:mm" (input datetime-local, interpretado como hora de Madrid)
// → instante UTC. Doble pasada por si el offset cambia en el borde (DST).
export function madridLocalToUtc(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const pretendUtc = new Date(`${local}:00Z`);
  if (Number.isNaN(pretendUtc.getTime())) return null;
  let offset = tzOffsetMs(pretendUtc, MADRID_TZ);
  offset = tzOffsetMs(new Date(pretendUtc.getTime() - offset), MADRID_TZ);
  return new Date(pretendUtc.getTime() - offset);
}

export function isQuietHour(local: string) {
  const hour = Number(local.slice(11, 13));
  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
}
