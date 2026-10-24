import { describe, expect, it } from 'vitest'
import { buildIntakeAttachmentParts } from './intakeAttachments'

describe('intake document extraction inputs', () => {
  it('passes the contents of a bill as inline evidence', async () => {
    const parts = await buildIntakeAttachmentParts([new File(['synthetic bill'], 'bill.pdf', { type: 'application/pdf' })])
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'application/pdf', data: btoa('synthetic bill') } })
  })
  it('does not invent contents for unsupported attachments', async () => {
    const parts = await buildIntakeAttachmentParts([new File(['anything'], 'medical-5000.docx')])
    expect(parts).toHaveLength(1)
    expect(parts[0]?.text).toContain('Do not infer any amounts')
  })
  it('bounds the total document payload', async () => {
    const file = new File([new Uint8Array(13 * 1024 * 1024)], 'large.pdf')
    const parts = await buildIntakeAttachmentParts([file])
    expect(parts.every(part => !part.inlineData)).toBe(true)
  })
})
