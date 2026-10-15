export const ACCEPTED_CASE_FILE_TYPES =
  '.pdf,.png,.jpg,.jpeg,.heic,.heif,.doc,.docx,.txt'

export const MAX_CASE_FILE_BYTES = 20 * 1024 * 1024
export const MAX_CASE_FILES = 10
export const MAX_CASE_FILES_TOTAL_BYTES = 50 * 1024 * 1024

type AllowedExtension =
  | 'pdf'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'heic'
  | 'heif'
  | 'doc'
  | 'docx'
  | 'txt'

const allowedMimeTypes: Record<AllowedExtension, ReadonlySet<string>> = {
  pdf: new Set(['application/pdf']),
  png: new Set(['image/png']),
  jpg: new Set(['image/jpeg']),
  jpeg: new Set(['image/jpeg']),
  heic: new Set(['image/heic', 'image/heif']),
  heif: new Set(['image/heic', 'image/heif']),
  doc: new Set(['application/msword']),
  docx: new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  txt: new Set(['text/plain']),
}

const normalizedMimeType: Record<AllowedExtension, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
}

export interface ValidatedCaseFile {
  extension: AllowedExtension
  contentType: string
}

export async function validateCaseFile(file: File): Promise<ValidatedCaseFile> {
  if (!file.name || file.name.length > 180 || hasSuspiciousName(file.name)) {
    throw new Error('The attachment has an invalid or suspicious file name.')
  }
  if (file.size <= 0) throw new Error(`${file.name} is empty.`)
  if (file.size > MAX_CASE_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 20 MB file limit.`)
  }

  const extension = extensionOf(file.name)
  if (!extension) {
    throw new Error(
      `${file.name} is not supported. Use PDF, PNG, JPG, HEIC, DOC, DOCX, or TXT.`,
    )
  }

  const declaredType = file.type.trim().toLowerCase()
  if (
    declaredType
    && declaredType !== 'application/octet-stream'
    && !allowedMimeTypes[extension].has(declaredType)
  ) {
    throw new Error(`${file.name} does not match its declared file type.`)
  }

  if (!(await hasExpectedSignature(file, extension))) {
    throw new Error(`${file.name} does not contain a valid ${extension.toUpperCase()} file.`)
  }

  return {
    extension,
    contentType: normalizedMimeType[extension],
  }
}

export async function validateCaseFiles(files: File[]): Promise<void> {
  if (files.length > MAX_CASE_FILES) {
    throw new Error(`Attach no more than ${MAX_CASE_FILES} files at once.`)
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0)
  if (totalBytes > MAX_CASE_FILES_TOTAL_BYTES) {
    throw new Error('Combined attachments cannot exceed 50 MB.')
  }
  await Promise.all(files.map(validateCaseFile))
}

function extensionOf(fileName: string): AllowedExtension | null {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension && extension in allowedMimeTypes
    ? extension as AllowedExtension
    : null
}

function hasSuspiciousName(fileName: string): boolean {
  return (
    fileName.startsWith('.')
    || /[/\\\0]/.test(fileName)
    || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(fileName)
    || /\.(?:exe|com|bat|cmd|msi|scr|js|jse|vbs|vbe|ps1|sh|app|dmg|pkg)\./i.test(fileName)
  )
}

async function hasExpectedSignature(
  file: File,
  extension: AllowedExtension,
): Promise<boolean> {
  if (extension === 'docx') {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return isZip(bytes) && containsAscii(bytes, 'word/') && containsAscii(bytes, '[Content_Types].xml')
  }

  const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer())
  if (extension === 'pdf') return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
  if (extension === 'png') {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return startsWith(bytes, [0xff, 0xd8, 0xff])
  }
  if (extension === 'doc') {
    return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  }
  if (extension === 'heic' || extension === 'heif') return isHeif(bytes)
  return isPlainText(bytes)
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function isZip(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
}

function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || asciiAt(bytes, 4, 4) !== 'ftyp') return false
  const brand = asciiAt(bytes, 8, 4)
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)
}

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.some((byte) => byte === 0)) return false
  if (bytes.length === 0) return false
  const printable = bytes.filter(
    (byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32,
  ).length
  return printable / bytes.length >= 0.9
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = new TextEncoder().encode(text)
  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let inner = 0; inner < needle.length; inner += 1) {
      if (bytes[index + inner] !== needle[inner]) continue outer
    }
    return true
  }
  return false
}
