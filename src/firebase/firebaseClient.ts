import {initializeApp} from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import firebaseConfig from '../../firebase-applet-config.json';
import {
  deriveOperatorBadge,
  sanitizeAndValidateDimeoRunDraft,
  sanitizeAndValidateTraceabilityDraft,
  sanitizeDisplayName,
  sanitizePhotoUrl,
  type DimeoSupervisionRunDraft,
  type ScenarioId,
  type TraceabilityRunDraft,
  type TraceabilityStatus,
} from './payloadValidation';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({prompt: 'select_account'});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Mandatory boot-time connectivity check per Firebase integration specification.
 */
export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export interface OperatorProfile {
  readonly uid: string;
  readonly displayName: string;
  readonly email: string;
  readonly photoUrl: string;
  readonly operatorBadge: string;
  readonly emailVerified: boolean;
}

export interface TraceabilityRunRecord {
  readonly runId: string;
  readonly operatorUid: string;
  readonly operatorName: string;
  readonly scenarioId: ScenarioId;
  readonly workOrderId: string;
  readonly installedCount: number;
  readonly compliantCount: number;
  readonly activeDefectCount: number;
  readonly reworkedCount: number;
  readonly firstPassYieldPercent: number;
  readonly status: TraceabilityStatus;
  readonly certificateCode: string;
  readonly completedSteps: readonly string[];
  readonly updatedAtIso: string;
}

function userToOperatorProfile(user: User): OperatorProfile {
  return {
    uid: user.uid,
    displayName: sanitizeDisplayName(user.displayName ?? user.email?.split('@')[0]),
    email: user.email ?? '',
    photoUrl: sanitizePhotoUrl(user.photoURL),
    operatorBadge: deriveOperatorBadge(user.uid),
    emailVerified: Boolean(user.emailVerified),
  };
}

/**
 * Ensures the authenticated Google user's public profile and isolated PII subdocument
 * exist and stay synchronized in Firestore.
 */
export async function ensureOperatorDocsSynced(user: User): Promise<OperatorProfile> {
  const profile = userToOperatorProfile(user);
  if (!user.emailVerified || !user.email) {
    return profile;
  }

  const publicPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const publicRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  let publicExists = false;
  let privateExists = false;

  try {
    const snap = await getDoc(publicRef);
    publicExists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }

  if (publicExists) {
    try {
      const privSnap = await getDoc(privateRef);
      privateExists = privSnap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, privatePath);
    }
  }

  try {
    const batch = writeBatch(db);
    if (!publicExists) {
      batch.set(publicRef, {
        uid: profile.uid,
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
        operatorBadge: profile.operatorBadge,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(publicRef, {
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
        updatedAt: serverTimestamp(),
      });
    }

    if (!privateExists) {
      batch.set(privateRef, {
        uid: profile.uid,
        email: profile.email.slice(0, 160),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(privateRef, {
        email: profile.email.slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  return profile;
}

export async function signInWithGoogleAccount(): Promise<OperatorProfile> {
  const credential = await signInWithPopup(auth, googleProvider);
  return ensureOperatorDocsSynced(credential.user);
}

export async function signOutOperator(): Promise<void> {
  await signOut(auth);
}

export function observeAuthSession(
  callback: (profile: OperatorProfile | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback(null);
      return;
    }
    const baseProfile = userToOperatorProfile(user);
    callback(baseProfile);
    void ensureOperatorDocsSynced(user).catch((err) => {
      console.warn('Operator profile sync deferred:', err);
    });
  });
}

/**
 * Attaches a secure owner-scoped real-time listener to /traceabilityRuns.
 */
export function subscribeOperatorTraceabilityRuns(
  uid: string,
  onRecords: (records: TraceabilityRunRecord[]) => void,
  onQuotaOrPermError?: (msg: string) => void,
): Unsubscribe {
  const colPath = 'traceabilityRuns';
  const q = query(
    collection(db, colPath),
    where('operatorUid', '==', uid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: TraceabilityRunRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const ts = d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : new Date();
        return {
          runId: String(d.runId ?? docSnap.id),
          operatorUid: String(d.operatorUid ?? uid),
          operatorName: String(d.operatorName ?? 'Operator'),
          scenarioId:
            d.scenarioId === 'turbofan_core' ? 'turbofan_core' : 'panel_buildup',
          workOrderId: String(d.workOrderId ?? ''),
          installedCount: Number(d.installedCount ?? 0),
          compliantCount: Number(d.compliantCount ?? 0),
          activeDefectCount: Number(d.activeDefectCount ?? 0),
          reworkedCount: Number(d.reworkedCount ?? 0),
          firstPassYieldPercent: Number(d.firstPassYieldPercent ?? 100),
          status: d.status === 'certified' ? 'certified' : 'in_progress',
          certificateCode: String(d.certificateCode ?? ''),
          completedSteps: Array.isArray(d.completedSteps)
            ? d.completedSteps.map(String)
            : [],
          updatedAtIso: ts.toISOString(),
        };
      });

      records.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
      onRecords(records);
    },
    (error) => {
      onQuotaOrPermError?.(error.message);
      handleFirestoreError(error, OperationType.LIST, colPath);
    },
  );
}

/**
 * Persists an operator's live OmniStep step/QC progress or terminal airworthiness sign-off.
 * Respects terminal state locking: once a run document is 'certified', no further updates are sent.
 */
export async function syncTraceabilityRunToCloud(
  rawDraft: TraceabilityRunDraft,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const validated = sanitizeAndValidateTraceabilityDraft(rawDraft);
  const docPath = `traceabilityRuns/${validated.runId}`;
  const runRef = doc(db, 'traceabilityRuns', validated.runId);

  let existingSnap;
  try {
    existingSnap = await getDoc(runRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(runRef, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
    return;
  }

  const existingData = existingSnap.data();
  // Terminal state lock: certified runs are immutable audit records
  if (existingData.status === 'certified') {
    return;
  }

  try {
    if (validated.status === 'certified') {
      await updateDoc(runRef, {
        operatorName: validated.operatorName,
        installedCount: validated.installedCount,
        compliantCount: validated.compliantCount,
        activeDefectCount: validated.activeDefectCount,
        reworkedCount: validated.reworkedCount,
        firstPassYieldPercent: validated.firstPassYieldPercent,
        status: 'certified',
        certificateCode: validated.certificateCode,
        completedSteps: [...validated.completedSteps],
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(runRef, {
        operatorName: validated.operatorName,
        installedCount: validated.installedCount,
        compliantCount: validated.compliantCount,
        activeDefectCount: validated.activeDefectCount,
        reworkedCount: validated.reworkedCount,
        firstPassYieldPercent: validated.firstPassYieldPercent,
        completedSteps: [...validated.completedSteps],
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export interface DimeoSupervisionRunRecord extends DimeoSupervisionRunDraft {
  readonly updatedAtIso: string;
}

/**
 * Attaches an owner-scoped real-time listener to /dimeoRuns.
 */
export function subscribeOperatorDimeoRuns(
  uid: string,
  onRecords: (records: DimeoSupervisionRunRecord[]) => void,
  onQuotaOrPermError?: (msg: string) => void,
): Unsubscribe {
  const colPath = 'dimeoRuns';
  const q = query(collection(db, colPath), where('operatorUid', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: DimeoSupervisionRunRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const ts =
          d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : new Date();
        return {
          dimeoRunId: String(d.dimeoRunId ?? docSnap.id),
          operatorUid: String(d.operatorUid ?? uid),
          operatorLabel: String(d.operatorLabel ?? 'Operator'),
          accountMode:
            d.accountMode === 'shared_station' ? 'shared_station' : 'nominative',
          language:
            d.language === 'fr' || d.language === 'es' ? d.language : 'en',
          scenarioId:
            d.scenarioId === 'turbofan_core' ? 'turbofan_core' : 'panel_buildup',
          moduleTitle: String(d.moduleTitle ?? 'Dimeo XR Procedure'),
          validatedStepsCount: Number(d.validatedStepsCount ?? 0),
          qcmAnsweredCount: Number(d.qcmAnsweredCount ?? 0),
          photosCount: Number(d.photosCount ?? 0),
          commentsCount: Number(d.commentsCount ?? 0),
          arEnabled: Boolean(d.arEnabled ?? true),
          updatedAtIso: ts.toISOString(),
        };
      });
      records.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
      onRecords(records);
    },
    (error) => {
      onQuotaOrPermError?.(error.message);
      handleFirestoreError(error, OperationType.LIST, colPath);
    },
  );
}

/**
 * Persists Dimeo Android XR field execution supervision telemetry to /dimeoRuns/{dimeoRunId}.
 */
export async function syncDimeoRunToCloud(
  rawDraft: DimeoSupervisionRunDraft,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const validated = sanitizeAndValidateDimeoRunDraft(rawDraft);
  const docPath = `dimeoRuns/${validated.dimeoRunId}`;
  const runRef = doc(db, 'dimeoRuns', validated.dimeoRunId);

  let existingSnap;
  try {
    existingSnap = await getDoc(runRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(runRef, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
    return;
  }

  try {
    await updateDoc(runRef, {
      operatorLabel: validated.operatorLabel,
      accountMode: validated.accountMode,
      language: validated.language,
      moduleTitle: validated.moduleTitle,
      validatedStepsCount: validated.validatedStepsCount,
      qcmAnsweredCount: validated.qcmAnsweredCount,
      photosCount: validated.photosCount,
      commentsCount: validated.commentsCount,
      arEnabled: validated.arEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}
