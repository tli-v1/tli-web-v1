export function classifyClientProcessingError(message: string): string {
  if (/\b(429|resource exhausted|quota|rate limit|too many requests)\b/i.test(message)) {
    return 'quota_or_rate_limit'
  }
  if (/\b(timeout|abort)\b/i.test(message)) return 'timeout'
  if (/\b(unavailable|overloaded|capacity)\b/i.test(message)) return 'model_unavailable'
  if (/\b(storage\/|upload|file)\b/i.test(message)) return 'file_upload'
  if (/\b(permission|belongs to another user|unauth|sign in)\b/i.test(message)) {
    return 'auth_or_permission'
  }
  if (/\b(case|incident|damage|contact|party|document).*(create|save|insert|update)\b/i.test(message)) {
    return 'case_write'
  }
  return message ? 'unknown_processing_failure' : ''
}
