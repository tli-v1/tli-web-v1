import { describe, expect, it } from 'vitest'
import {
  validateCaseFile,
  validateCaseFiles,
} from './fileValidation'

describe('case attachment validation', () => {
  it('accepts a PDF with a matching signature', async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])],
      'police-report.pdf',
      { type: 'application/pdf' },
    )

    await expect(validateCaseFile(file)).resolves.toMatchObject({
      extension: 'pdf',
      contentType: 'application/pdf',
    })
  })

  it('rejects executable double extensions', async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
      'invoice.exe.pdf',
      { type: 'application/pdf' },
    )

    await expect(validateCaseFile(file)).rejects.toThrow(/suspicious/i)
  })

  it('rejects files whose contents do not match the extension', async () => {
    const file = new File(['not an image'], 'evidence.png', { type: 'image/png' })
    await expect(validateCaseFile(file)).rejects.toThrow(/valid PNG/i)
  })

  it('rejects arbitrary archives', async () => {
    const file = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
      'evidence.zip',
      { type: 'application/zip' },
    )

    await expect(validateCaseFile(file)).rejects.toThrow(/not supported/i)
  })

  it('limits attachment count', async () => {
    const files = Array.from(
      { length: 11 },
      (_, index) => new File(['safe text'], `note-${index}.txt`, { type: 'text/plain' }),
    )
    await expect(validateCaseFiles(files)).rejects.toThrow(/no more than 10/i)
  })
})
