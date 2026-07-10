const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function formatDisplayDate(
  value: string | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback

  try {
    const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value)
    const date = dateOnlyMatch
      ? new Date(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3]),
        )
      : new Date(value)

    if (Number.isNaN(date.getTime())) return fallback

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return fallback
  }
}
