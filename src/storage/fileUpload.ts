import {
  deleteObject,
  getBlob,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { getIdToken } from 'firebase/auth';
import { auth, storage } from '../config/firebase';
import type { FileUploadParams, FileUploadResponse, SecureObjectUrlResponse } from '../types';
import { validateCaseFile } from './fileValidation';

const DEFAULT_FOLDER = 'case-docs';

export function generateFileUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extensionFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.trim();
  return ext ? `.${ext.toLowerCase()}` : '';
}

function cleanSegment(value: string): string {
  return value.replace(/^\/+|\/+$/g, '').replace(/[^\w.-]/g, '_');
}

function storagePath(folder: string, relativePath: string): string {
  const safeFolder = cleanSegment(folder || DEFAULT_FOLDER);
  const safePath = relativePath.replace(/^\/+/, '');
  if (!safePath) return safeFolder;
  if (safePath === safeFolder || safePath.startsWith(`${safeFolder}/`)) {
    return safePath;
  }
  return `${safeFolder}/${safePath}`;
}

function friendlyUploadError(error: unknown): string {
  const code = (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) ? error.code : ''

  if (code === 'storage/unauthorized') {
    return 'We could not attach that file. Please sign in again and retry.'
  }
  if (code === 'storage/canceled') {
    return 'The file upload was canceled.'
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'The upload timed out. Check your connection and try again.'
  }

  return error instanceof Error ? error.message : 'Failed to upload file'
}

function friendlyFileOpenError(error: unknown): string {
  const code = (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) ? error.code : ''

  if (code === 'storage/unauthorized') {
    return 'You do not have permission to open that file.'
  }
  if (code === 'storage/object-not-found') {
    return 'That file could not be found.'
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'Opening the file timed out. Check your connection and try again.'
  }

  return error instanceof Error ? error.message : 'Unable to open file'
}

export async function uploadFile({
  bucket = DEFAULT_FOLDER,
  file,
  userId,
  caseId,
}: FileUploadParams): Promise<FileUploadResponse> {
  try {
    const validatedFile = await validateCaseFile(file);
    if (!userId || !caseId) {
      throw new Error('Missing user or case id for file upload.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== userId) {
      throw new Error('Sign in before uploading files to this case.');
    }
    await getIdToken(currentUser, true);

    const fileName = `${generateFileUuid()}${extensionFor(file.name)}`;
    const relativePath = `${cleanSegment(userId)}/${cleanSegment(caseId)}/${fileName}`;
    const fullPath = storagePath(bucket, relativePath);
    const fileRef = ref(storage, fullPath);

    await uploadBytes(fileRef, file, {
      contentType: validatedFile.contentType,
      customMetadata: {
        originalName: file.name,
        userId,
        caseId,
      },
    });

    return { path: relativePath, error: null };
  } catch (error) {
    return { path: null, error: friendlyUploadError(error) };
  }
}

export async function uploadConversationalIntakeFile({
  file,
  userId,
  intakeId,
}: {
  file: File;
  userId: string;
  intakeId: string;
}): Promise<FileUploadResponse> {
  try {
    const validatedFile = await validateCaseFile(file);
    if (!userId || !intakeId) {
      throw new Error('Sign in before attaching files to this intake.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== userId) {
      throw new Error('Sign in before attaching files to this intake.');
    }
    await getIdToken(currentUser, true);

    const fileName = `${generateFileUuid()}${extensionFor(file.name)}`;
    const relativePath = `${cleanSegment(userId)}/${cleanSegment(intakeId)}/${fileName}`;
    const fullPath = storagePath('conversational-intakes', relativePath);
    const fileRef = ref(storage, fullPath);

    await uploadBytes(fileRef, file, {
      contentType: validatedFile.contentType,
      customMetadata: {
        originalName: file.name,
        userId,
        intakeId,
        recordType: 'conversational_intake',
      },
    });

    return { path: relativePath, error: null };
  } catch (error) {
    return { path: null, error: friendlyUploadError(error) };
  }
}

export async function removeFiles(
  bucketOrPaths: string | string[],
  maybePaths?: string[]
): Promise<{ error: string | null }> {
  const bucket = Array.isArray(bucketOrPaths) ? DEFAULT_FOLDER : bucketOrPaths;
  const paths = Array.isArray(bucketOrPaths) ? bucketOrPaths : maybePaths || [];

  try {
    await Promise.all(
      paths.map((path) => deleteObject(ref(storage, storagePath(bucket, path))))
    );
    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove files';
    return { error: message };
  }
}

export async function createSecureObjectUrl(
  bucketOrPath: string,
  pathOrExpires: string | number = 60,
  _expiresIn: number = 60
): Promise<SecureObjectUrlResponse> {
  const bucket = typeof pathOrExpires === 'string' ? bucketOrPath : DEFAULT_FOLDER;
  const path = typeof pathOrExpires === 'string' ? pathOrExpires : bucketOrPath;

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in before opening files.');
    }
    await getIdToken(currentUser, true);

    const blob = await getBlob(ref(storage, storagePath(bucket, path)));
    const url = URL.createObjectURL(blob);
    return { url, error: null };
  } catch (error) {
    return { url: null, error: friendlyFileOpenError(error) };
  }
}

export function revokeSecureObjectUrl(url: string, delayMs = 60_000): void {
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, delayMs);
}

export const createSignedUrl = createSecureObjectUrl;
