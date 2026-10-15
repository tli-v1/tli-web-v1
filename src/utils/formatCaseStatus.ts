export function formatCaseStatus(value: string | null | undefined): string {
  if (!value) return 'Pending'

  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
