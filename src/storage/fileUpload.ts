import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { getIdToken } from 'firebase/auth';
import { auth, storage } from '../config/firebase';
import type { FileUploadParams, FileUploadResponse, SignedUrlResponse } from '../types';

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

export async function uploadFile({
  bucket = DEFAULT_FOLDER,
  file,
  userId,
  caseId,
}: FileUploadParams): Promise<FileUploadResponse> {
  try {
    if (!userId || !caseId) {
      throw new Error('Missing user or case id for file upload.');
    }

    const fileName = `${generateFileUuid()}${extensionFor(file.name)}`;
    const relativePath = `${cleanSegment(userId)}/${cleanSegment(caseId)}/${fileName}`;
    const fullPath = storagePath(bucket, relativePath);
    const fileRef = ref(storage, fullPath);

    await uploadBytes(fileRef, file, {
      contentType: file.type || undefined,
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
      contentType: file.type || undefined,
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

export async function createSignedUrl(
  bucketOrPath: string,
  pathOrExpires: string | number = 60,
  _expiresIn: number = 60
): Promise<SignedUrlResponse> {
  const bucket = typeof pathOrExpires === 'string' ? bucketOrPath : DEFAULT_FOLDER;
  const path = typeof pathOrExpires === 'string' ? pathOrExpires : bucketOrPath;

  try {
    const url = await getDownloadURL(ref(storage, storagePath(bucket, path)));
    return { url, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create download URL';
    return { url: null, error: message };
  }
}
