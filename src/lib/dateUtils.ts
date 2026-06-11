/**
 * Retorna fecha/hora local en formato ISO con offset real (ej: 2026-05-12T01:12:00-06:00)
 */
export function getLocalISOString(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const min = pad(date.getMinutes());
  const sec = pad(date.getSeconds());
  const ms = date.getMilliseconds();
  const offsetMin = date.getTimezoneOffset();
  const absOffsetMin = Math.abs(offsetMin);
  const offsetSign = offsetMin > 0 ? '-' : '+';
  const offsetHour = pad(Math.floor(absOffsetMin / 60));
  const offsetMinute = pad(absOffsetMin % 60);
  const msStr = ms > 0 ? '.' + ms.toString().padStart(3, '0') : '';
  return `${year}-${month}-${day}T${hour}:${min}:${sec}${msStr}${offsetSign}${offsetHour}:${offsetMinute}`;
}

/**
 * Formatea una fecha/hora proveniente de Supabase (timestamptz retornado en UTC).
 * Si el string no trae offset explícito, se le añade 'Z' para que el navegador
 * lo interprete como UTC y no como hora local.
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Formatea solo la fecha (sin hora) proveniente de Supabase.
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
