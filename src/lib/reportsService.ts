import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, handleFirestoreError, OperationType, storage } from './firebase';
import type {
  AdminActivityLog,
  AiReportAnalysis,
  CivicReport,
  IssueCategory,
  PriorityLevel,
  ReportStatus,
  SupportedLanguage,
} from '../types/civic';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function tsToMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function mapReportDoc(id: string, data: Record<string, unknown>): CivicReport {
  return {
    id,
    creatorUid: String(data.creatorUid || ''),
    creatorDisplayName: String(data.creatorDisplayName || 'Citizen'),
    category: (data.category as IssueCategory) || 'other',
    title: String(data.title || 'Civic Issue'),
    description: String(data.description || ''),
    complaintText: String(data.complaintText || ''),
    language: (data.language as SupportedLanguage) || 'en',
    area: String(data.area || ''),
    landmark: String(data.landmark || ''),
    city: String(data.city || 'Hyderabad'),
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    imageUrl: String(data.imageUrl || ''),
    aiAnalysis: (data.aiAnalysis as AiReportAnalysis) || null,
    prioritySuggestion: (data.prioritySuggestion as PriorityLevel) || 'Medium',
    status: (data.status as ReportStatus) || 'Submitted',
    verificationCount: typeof data.verificationCount === 'number' ? data.verificationCount : 0,
    resolutionNotes: String(data.resolutionNotes || ''),
    resolutionImageUrl: String(data.resolutionImageUrl || ''),
    createdAtMs: tsToMillis(data.createdAt),
    updatedAtMs: tsToMillis(data.updatedAt),
  };
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, and WebP photographs are supported.';
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return 'Image file must be under 5 MB.';
  }
  return null;
}

export async function compressImageForUpload(file: File): Promise<{ blob: Blob; base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1280;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Unable to process image in browser canvas.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Image compression failed.'));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = String(reader.result || '');
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve({ blob, base64, mimeType: 'image/jpeg' });
          };
          reader.onerror = () => reject(new Error('Failed to read compressed image.'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.84,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Selected file could not be decoded as an image.'));
    };
    img.src = objectUrl;
  });
}

let storageUnavailableInSession = false;

function isStorageFallbackEligible(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
  const combined = `${code} ${msg}`.toLowerCase();
  return (
    combined.includes('storage/retry-limit-exceeded') ||
    combined.includes('storage/bucket-not-found') ||
    combined.includes('storage/unauthorized') ||
    combined.includes('storage/unknown') ||
    combined.includes('404') ||
    combined.includes('not found')
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode image for upload.'));
    reader.readAsDataURL(blob);
  });
}

async function uploadViaServerFallback(
  folder: 'reports' | 'resolutions',
  reportId: string,
  blob: Blob,
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in again before uploading photographs.');
  }
  const idToken = await currentUser.getIdToken();
  const imageBase64 = await blobToBase64(blob);
  const mimeType =
    blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg';

  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      folder,
      reportId,
      imageBase64,
      mimeType,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Server image upload failed.');
  }
  return data.url;
}

async function uploadWithStorageOrFallback(params: {
  folder: 'reports' | 'resolutions';
  uid: string;
  reportId: string;
  blob: Blob;
  label: string;
}): Promise<string> {
  if (params.blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Processed ${params.label} exceeds 5 MB limit.`);
  }

  if (!storageUnavailableInSession) {
    const path = `${params.folder}/${params.uid}/${params.reportId}_${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    try {
      await uploadBytes(storageRef, params.blob, { contentType: 'image/jpeg' });
      return await getDownloadURL(storageRef);
    } catch (storageErr) {
      if (!isStorageFallbackEligible(storageErr)) {
        const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
        throw new Error(`Firebase Storage upload failed (${msg}).`);
      }
      storageUnavailableInSession = true;
      console.warn(
        'Firebase Storage unavailable; switching to authenticated RaastaAI server upload fallback:',
        storageErr instanceof Error ? storageErr.message : storageErr,
      );
    }
  }

  return uploadViaServerFallback(params.folder, params.reportId, params.blob);
}

export async function uploadIssueImage(uid: string, reportId: string, blob: Blob): Promise<string> {
  return uploadWithStorageOrFallback({
    folder: 'reports',
    uid,
    reportId,
    blob,
    label: 'image',
  });
}

export async function uploadResolutionImage(
  adminUid: string,
  reportId: string,
  blob: Blob,
): Promise<string> {
  return uploadWithStorageOrFallback({
    folder: 'resolutions',
    uid: adminUid,
    reportId,
    blob,
    label: 'resolution image',
  });
}

export function subscribePublicReports(
  onData: (reports: CivicReport[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'reports';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapReportDoc(d.id, d.data() as Record<string, unknown>));
      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeUserReports(
  uid: string,
  onData: (reports: CivicReport[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'reports';
  // Single-field where clause avoids composite index requirements; sorted newest-first in memory
  const q = query(collection(db, path), where('creatorUid', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapReportDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeUserVerifications(
  uid: string,
  onData: (verifiedReportIds: Record<string, boolean>) => void,
): Unsubscribe {
  const path = 'verifications';
  const q = query(collection(db, path), where('userId', '==', uid), limit(250));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, boolean> = {};
      snapshot.docs.forEach((d) => {
        const reportId = String(d.data().reportId || '');
        if (reportId) {
          map[reportId] = true;
        }
      });
      onData(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function getReportById(reportId: string): Promise<CivicReport | null> {
  const path = `reports/${reportId}`;
  try {
    const snap = await getDoc(doc(db, 'reports', reportId));
    if (!snap.exists()) {
      return null;
    }
    return mapReportDoc(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeReportById(
  reportId: string,
  onData: (report: CivicReport | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `reports/${reportId}`;
  return onSnapshot(
    doc(db, 'reports', reportId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(mapReportDoc(snap.id, snap.data() as Record<string, unknown>));
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export interface CreateCivicReportInput {
  reportId: string;
  creatorUid: string;
  creatorDisplayName: string;
  category: IssueCategory;
  title: string;
  description: string;
  complaintText: string;
  language: SupportedLanguage;
  area: string;
  landmark: string;
  city: string;
  lat: number | null;
  lng: number | null;
  imageUrl: string;
  aiAnalysis: AiReportAnalysis | null;
  prioritySuggestion: PriorityLevel;
}

export async function createCivicReport(input: CreateCivicReportInput): Promise<void> {
  const path = `reports/${input.reportId}`;
  const sanitizedAi = input.aiAnalysis
    ? {
        suggestedCategory: input.aiAnalysis.suggestedCategory,
        conciseDescription: input.aiAnalysis.conciseDescription.slice(0, 1000),
        visibleEvidence: input.aiAnalysis.visibleEvidence.slice(0, 10).map((s) => s.slice(0, 200)),
        suggestedPriority: input.aiAnalysis.suggestedPriority,
        priorityReasoning: input.aiAnalysis.priorityReasoning.slice(0, 1000),
        confidence: Math.min(1, Math.max(0, Number(input.aiAnalysis.confidence) || 0)),
        needsClarification: Boolean(input.aiAnalysis.needsClarification),
        clarificationQuestion: (input.aiAnalysis.clarificationQuestion || '').slice(0, 500),
        possibleDuplicateIndicators: (input.aiAnalysis.possibleDuplicateIndicators || '').slice(0, 600),
        analyzedAt: (input.aiAnalysis.analyzedAt || new Date().toISOString()).slice(0, 64),
      }
    : null;

  const payload = {
    creatorUid: input.creatorUid,
    creatorDisplayName: input.creatorDisplayName.trim().slice(0, 60) || 'Citizen',
    category: input.category,
    title: input.title.trim().slice(0, 140),
    description: input.description.trim().slice(0, 1500),
    complaintText: input.complaintText.trim().slice(0, 3500),
    language: input.language,
    area: input.area.trim().slice(0, 140),
    landmark: input.landmark.trim().slice(0, 140),
    city: input.city.trim().slice(0, 60) || 'Hyderabad',
    lat: input.lat,
    lng: input.lng,
    imageUrl: input.imageUrl.slice(0, 2000),
    aiAnalysis: sanitizedAi,
    prioritySuggestion: input.prioritySuggestion,
    status: 'Submitted' as const,
    verificationCount: 0,
    resolutionNotes: '',
    resolutionImageUrl: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'reports', input.reportId), payload);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCreatorReport(
  reportId: string,
  updates: {
    title: string;
    description: string;
    complaintText: string;
    area: string;
    landmark: string;
    category: IssueCategory;
  },
): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      title: updates.title.trim().slice(0, 140),
      description: updates.description.trim().slice(0, 1500),
      complaintText: updates.complaintText.trim().slice(0, 3500),
      area: updates.area.trim().slice(0, 140),
      landmark: updates.landmark.trim().slice(0, 140),
      category: updates.category,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteReport(reportId: string): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await deleteDoc(doc(db, 'reports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function verifyReportExists(
  reportId: string,
  uid: string,
  currentCount: number,
): Promise<void> {
  const verificationId = `${reportId}_${uid}`;
  const path = `verifications/${verificationId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'verifications', verificationId), {
      reportId,
      userId: uid,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'reports', reportId), {
      verificationCount: currentCount + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminUpdateReportStatus(params: {
  reportId: string;
  adminUid: string;
  adminName: string;
  previousStatus: ReportStatus;
  newStatus: ReportStatus;
  prioritySuggestion: PriorityLevel;
  resolutionNotes: string;
  resolutionImageUrl: string;
}): Promise<void> {
  const activityId = `act_${params.reportId}_${Date.now()}`;
  const path = `reports/${params.reportId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'reports', params.reportId), {
      status: params.newStatus,
      prioritySuggestion: params.prioritySuggestion,
      resolutionNotes: params.resolutionNotes.trim().slice(0, 1500),
      resolutionImageUrl: params.resolutionImageUrl.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'adminActivity', activityId), {
      reportId: params.reportId,
      adminUid: params.adminUid,
      adminName: params.adminName.trim().slice(0, 80) || 'Admin',
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      note: params.resolutionNotes.trim().slice(0, 1500) || `Status updated to ${params.newStatus}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeAdminActivity(
  onData: (logs: AdminActivityLog[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'adminActivity';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AdminActivityLog[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          reportId: String(data.reportId || ''),
          adminUid: String(data.adminUid || ''),
          adminName: String(data.adminName || 'Admin'),
          previousStatus: (data.previousStatus as ReportStatus) || 'Submitted',
          newStatus: (data.newStatus as ReportStatus) || 'Under Review',
          note: String(data.note || ''),
          createdAtMs: tsToMillis(data.createdAt),
        };
      });
      onData(logs);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export interface AdminAllowlistEntry {
  uid: string;
  email: string;
  grantedBy: string;
  createdAtMs: number;
}

export function subscribeAdmins(
  onData: (admins: AdminAllowlistEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'admins';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AdminAllowlistEntry[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          uid: String(data.uid || d.id),
          email: String(data.email || ''),
          grantedBy: String(data.grantedBy || ''),
          createdAtMs: tsToMillis(data.createdAt),
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function grantAdminRole(params: {
  targetUid: string;
  targetEmail: string;
  grantedByUid: string;
}): Promise<void> {
  const uid = params.targetUid.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    throw new Error('Target UID must be 1-128 alphanumeric, underscore, or hyphen characters.');
  }
  const email = params.targetEmail.trim().slice(0, 160);
  if (!email.includes('@') || email.length < 3) {
    throw new Error('Please provide a valid administrator email address.');
  }

  const adminPath = `admins/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', uid), {
      uid,
      email,
      grantedBy: params.grantedByUid.slice(0, 128),
      createdAt: serverTimestamp(),
    });
    if (userSnap.exists()) {
      batch.update(userRef, {
        role: 'admin',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, adminPath);
  }
}

export async function revokeAdminRole(targetUid: string): Promise<void> {
  const uid = targetUid.trim();
  const adminPath = `admins/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'admins', uid));
    if (userSnap.exists()) {
      batch.update(userRef, {
        role: 'citizen',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, adminPath);
  }
}
