const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function toGrosze(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromGrosze(grosze: number): string {
  return (grosze / 100).toFixed(2);
}

/** Form/JSON friendly boolean: "false", "0", "off", "" → false (Boolean("false") would be true). */
export function parseBool(value: unknown, def = false): boolean {
  if (value === undefined || value === null || value === '') return def;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return def;
}
