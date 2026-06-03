export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function includesNormalized(value: string | null | undefined, normalizedTerm: string): boolean {
  if (!normalizedTerm) return true
  return normalizeSearchText(value).includes(normalizedTerm)
}
