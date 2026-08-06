import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'

interface MarketplaceCaseNotificationInput {
  caseId: string
  title?: string
  description?: string
  stateCode?: string
  source?: string
}

const enqueueMarketplaceCaseNotification = httpsCallable<
  MarketplaceCaseNotificationInput,
  unknown
>(
  functions,
  'enqueueMarketplaceCaseNotification',
)

export async function notifyMarketplaceCaseCreated({
  caseId,
  title,
  description,
  stateCode,
  source = 'tli-web-case-created',
}: MarketplaceCaseNotificationInput): Promise<void> {
  if (!caseId) return

  await enqueueMarketplaceCaseNotification({
    caseId,
    title: title?.trim() || 'New case submitted',
    description: description?.trim() || 'A new case intake was submitted.',
    stateCode: stateCode?.trim().toUpperCase() || undefined,
    source,
  })
}

export function caseNotificationTitle({
  city,
  stateCode,
  fallback = 'New case submitted',
}: {
  city?: string | null
  stateCode?: string | null
  fallback?: string
}): string {
  const location = [city?.trim(), stateCode?.trim().toUpperCase()]
    .filter(Boolean)
    .join(', ')

  return location ? `New case submitted · ${location}` : fallback
}
