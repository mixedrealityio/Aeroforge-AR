import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import {MODEL_ENTITY_CATALOG, SCENARIO_CATALOG} from '../assembly/assemblyData';
import {
  OperationType,
  auth,
  db,
  ensureOperatorDocsSynced,
  handleFirestoreError,
} from '../firebase/firebaseClient';
import {
  HEX_COLOR_PATTERN,
  SCENARIO_ENTITY_ALLOWLIST,
  deriveWorkflowStepDocId,
  sanitizeAndValidateWorkflowStepDraft,
  stepNumberToCanonicalCode,
  validateWorkflowStepPatchInput,
  type AllowedStepCode,
  type ScenarioId,
  type WorkflowStepDraft,
  type WorkflowStepPatchInput,
} from '../firebase/payloadValidation';

export interface WorkflowStepRecord {
  readonly stepDocId: string;
  readonly operatorUid: string;
  readonly scenarioId: ScenarioId;
  readonly stepNumber: number; // 1..6
  readonly canonicalCode: AllowedStepCode;
  readonly title: string;
  readonly partNumber: string;
  readonly description: string;
  readonly warningText: string;
  readonly requiredTorqueNm: number;
  readonly torqueMinNm: number;
  readonly torqueMaxNm: number;
  readonly modelEntityIds: readonly string[];
  readonly highlightColorHex: string;
  readonly updatedAtIso: string;
  readonly source: 'default' | 'local' | 'cloud';
}

export interface ArEntityHighlightState {
  readonly enabled: boolean;
  readonly entityIds: readonly string[];
  readonly colorHex: string;
  readonly mode: 'step' | 'spotlight';
}

export interface WorkflowStepBackend {
  getAuthenticatedUser(): {readonly uid: string; readonly emailVerified: boolean} | null;
  listOperatorSteps(uid: string): Promise<WorkflowStepRecord[]>;
  subscribeOperatorSteps(
    uid: string,
    onRecords: (records: WorkflowStepRecord[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  seedMissingSteps(
    uid: string,
    drafts: readonly WorkflowStepDraft[],
  ): Promise<void>;
  upsertStep(uid: string, draft: WorkflowStepDraft): Promise<void>;
}

function parseFirestoreStepDoc(
  docId: string,
  data: Record<string, unknown>,
  fallbackUid: string,
): WorkflowStepRecord | null {
  const scenarioId: ScenarioId | null =
    data.scenarioId === 'panel_buildup'
      ? 'panel_buildup'
      : data.scenarioId === 'turbofan_core'
        ? 'turbofan_core'
        : null;
  if (!scenarioId) return null;

  const stepNumber = Number(data.stepNumber);
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 6) {
    return null;
  }

  const defaultSpec = SCENARIO_CATALOG[scenarioId].steps.find(
    (s) => s.id === stepNumber,
  );
  if (!defaultSpec) return null;

  const allowSet = SCENARIO_ENTITY_ALLOWLIST[scenarioId];
  const rawEntities = Array.isArray(data.modelEntityIds)
    ? data.modelEntityIds.map(String).filter((id) => allowSet.has(id))
    : [];
  const modelEntityIds =
    rawEntities.length > 0 ? rawEntities.slice(0, 6) : [...defaultSpec.modelEntityIds];

  const reqTorque = Number(data.requiredTorqueNm);
  const minTorque = Number(data.torqueMinNm);
  const maxTorque = Number(data.torqueMaxNm);
  const validTorqueEnvelope =
    Number.isFinite(reqTorque) &&
    Number.isFinite(minTorque) &&
    Number.isFinite(maxTorque) &&
    minTorque >= 0 &&
    minTorque <= reqTorque &&
    reqTorque <= maxTorque &&
    maxTorque <= 2000;

  const rawHex = typeof data.highlightColorHex === 'string' ? data.highlightColorHex : '';
  const highlightColorHex = HEX_COLOR_PATTERN.test(rawHex)
    ? rawHex
    : defaultSpec.highlightColorHex;

  const ts =
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : new Date();

  return {
    stepDocId: typeof data.stepDocId === 'string' ? data.stepDocId : docId,
    operatorUid:
      typeof data.operatorUid === 'string' ? data.operatorUid : fallbackUid,
    scenarioId,
    stepNumber,
    canonicalCode: stepNumberToCanonicalCode(stepNumber),
    title:
      typeof data.title === 'string' && data.title.trim().length >= 3
        ? data.title.trim()
        : defaultSpec.name,
    partNumber:
      typeof data.partNumber === 'string' && data.partNumber.trim().length >= 2
        ? data.partNumber.trim()
        : defaultSpec.partNumber,
    description:
      typeof data.description === 'string' && data.description.trim().length >= 5
        ? data.description.trim()
        : defaultSpec.instruction,
    warningText:
      typeof data.warningText === 'string'
        ? data.warningText.trim()
        : defaultSpec.warningText,
    requiredTorqueNm: validTorqueEnvelope
      ? reqTorque
      : defaultSpec.requiredTorqueNm,
    torqueMinNm: validTorqueEnvelope ? minTorque : defaultSpec.torqueMinNm,
    torqueMaxNm: validTorqueEnvelope ? maxTorque : defaultSpec.torqueMaxNm,
    modelEntityIds,
    highlightColorHex,
    updatedAtIso: ts.toISOString(),
    source: 'cloud',
  };
}

/**
 * Production Cloud Firestore backend for /workflowSteps/{stepDocId}.
 * Enforces owner-scoped queries (where('operatorUid', '==', uid)) and
 * routes all SDK errors through handleFirestoreError per specification.
 */
export class FirestoreWorkflowStepBackend implements WorkflowStepBackend {
  getAuthenticatedUser(): {readonly uid: string; readonly emailVerified: boolean} | null {
    const user = auth.currentUser;
    if (!user) return null;
    return {uid: user.uid, emailVerified: Boolean(user.emailVerified)};
  }

  async listOperatorSteps(uid: string): Promise<WorkflowStepRecord[]> {
    const colPath = 'workflowSteps';
    const q = query(collection(db, colPath), where('operatorUid', '==', uid));
    try {
      const snap = await getDocs(q);
      const out: WorkflowStepRecord[] = [];
      for (const docSnap of snap.docs) {
        const parsed = parseFirestoreStepDoc(docSnap.id, docSnap.data(), uid);
        if (parsed) out.push(parsed);
      }
      return out;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  }

  subscribeOperatorSteps(
    uid: string,
    onRecords: (records: WorkflowStepRecord[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    const colPath = 'workflowSteps';
    const q = query(collection(db, colPath), where('operatorUid', '==', uid));
    return onSnapshot(
      q,
      (snapshot) => {
        const out: WorkflowStepRecord[] = [];
        for (const docSnap of snapshot.docs) {
          const parsed = parseFirestoreStepDoc(docSnap.id, docSnap.data(), uid);
          if (parsed) out.push(parsed);
        }
        onRecords(out);
      },
      (error) => {
        onError(error);
        handleFirestoreError(error, OperationType.LIST, colPath);
      },
    );
  }

  async seedMissingSteps(
    _uid: string,
    drafts: readonly WorkflowStepDraft[],
  ): Promise<void> {
    if (drafts.length === 0) return;

    const currentUser = auth.currentUser;
    if (currentUser && currentUser.emailVerified) {
      await ensureOperatorDocsSynced(currentUser);
    }

    const colPath = 'workflowSteps';
    try {
      const batch = writeBatch(db);
      for (const rawDraft of drafts) {
        const validated = sanitizeAndValidateWorkflowStepDraft(rawDraft);
        const stepRef = doc(db, colPath, validated.stepDocId);
        batch.set(stepRef, {
          ...validated,
          modelEntityIds: [...validated.modelEntityIds],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, colPath);
    }
  }

  async upsertStep(_uid: string, draft: WorkflowStepDraft): Promise<void> {
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.emailVerified) {
      await ensureOperatorDocsSynced(currentUser);
    }

    const validated = sanitizeAndValidateWorkflowStepDraft(draft);
    const docPath = `workflowSteps/${validated.stepDocId}`;
    const stepRef = doc(db, 'workflowSteps', validated.stepDocId);

    let existingSnap;
    try {
      existingSnap = await getDoc(stepRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }

    if (!existingSnap.exists()) {
      try {
        await setDoc(stepRef, {
          ...validated,
          modelEntityIds: [...validated.modelEntityIds],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
      return;
    }

    try {
      await updateDoc(stepRef, {
        title: validated.title,
        description: validated.description,
        warningText: validated.warningText,
        requiredTorqueNm: validated.requiredTorqueNm,
        torqueMinNm: validated.torqueMinNm,
        torqueMaxNm: validated.torqueMaxNm,
        modelEntityIds: [...validated.modelEntityIds],
        highlightColorHex: validated.highlightColorHex,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }
}

type ScenarioListener = (steps: WorkflowStepRecord[]) => void;

/**
 * Service layer for fetching, caching, real-time subscribing, and managing
 * aeronautics assembly workflow steps (descriptions, fastener torque envelopes,
 * and 3D AR model entity highlight bindings) backed by Firebase Cloud Firestore.
 */
export class WorkflowStepService {
  private readonly backend: WorkflowStepBackend;
  private readonly store = new Map<ScenarioId, Map<number, WorkflowStepRecord>>();
  private readonly listeners = new Map<ScenarioId, Set<ScenarioListener>>();
  private readonly seededCloudScenarios = new Set<string>();

  private arHighlightEnabled = true;
  private spotlightEntityIds: readonly string[] | null = null;
  private spotlightScenarioId: ScenarioId | null = null;

  constructor(backend?: WorkflowStepBackend) {
    this.backend = backend ?? new FirestoreWorkflowStepBackend();
    this.initializeScenarioDefaults('panel_buildup');
    this.initializeScenarioDefaults('turbofan_core');
  }

  getDefaultSteps(
    scenarioId: ScenarioId,
    operatorUid = 'local',
  ): WorkflowStepRecord[] {
    const scenario = SCENARIO_CATALOG[scenarioId];
    const nowIso = new Date().toISOString();
    return scenario.steps.map((spec) => ({
      stepDocId: deriveWorkflowStepDocId(operatorUid, scenarioId, spec.id),
      operatorUid,
      scenarioId,
      stepNumber: spec.id,
      canonicalCode: spec.canonicalCode,
      title: spec.name,
      partNumber: spec.partNumber,
      description: spec.instruction,
      warningText: spec.warningText,
      requiredTorqueNm: spec.requiredTorqueNm,
      torqueMinNm: spec.torqueMinNm,
      torqueMaxNm: spec.torqueMaxNm,
      modelEntityIds: [...spec.modelEntityIds],
      highlightColorHex: spec.highlightColorHex,
      updatedAtIso: nowIso,
      source: 'default',
    }));
  }

  getEntityCatalog(scenarioId: ScenarioId) {
    return MODEL_ENTITY_CATALOG[scenarioId];
  }

  getSteps(scenarioId: ScenarioId): WorkflowStepRecord[] {
    const map = this.store.get(scenarioId);
    if (!map) {
      return this.getDefaultSteps(scenarioId);
    }
    return Array.from(map.values()).sort((a, b) => a.stepNumber - b.stepNumber);
  }

  getStep(scenarioId: ScenarioId, stepNumber: number): WorkflowStepRecord {
    const clamped = Math.max(1, Math.min(6, Math.round(stepNumber)));
    const map = this.store.get(scenarioId);
    const found = map?.get(clamped);
    if (found) return found;
    return this.getDefaultSteps(scenarioId)[clamped - 1];
  }

  /**
   * Fetches assembly workflow steps for a scenario from Firebase Firestore when
   * signed in with a verified Google account (seeding any missing steps on first run),
   * or returns the managed local session workflow steps in Evaluation Mode.
   */
  async fetchWorkflowSteps(scenarioId: ScenarioId): Promise<WorkflowStepRecord[]> {
    const user = this.backend.getAuthenticatedUser();
    if (!user || !user.emailVerified) {
      return this.getSteps(scenarioId);
    }

    const remoteAll = await this.backend.listOperatorSteps(user.uid);
    const remoteForScenario = remoteAll.filter((r) => r.scenarioId === scenarioId);

    const existingNums = new Set(remoteForScenario.map((r) => r.stepNumber));
    const defaults = this.getDefaultSteps(scenarioId, user.uid);
    const missingDrafts: WorkflowStepDraft[] = defaults
      .filter((d) => !existingNums.has(d.stepNumber))
      .map((d) => this.recordToDraft(d, user.uid));

    if (missingDrafts.length > 0) {
      await this.backend.seedMissingSteps(user.uid, missingDrafts);
    }

    const map = this.ensureScenarioMap(scenarioId);
    for (const def of defaults) {
      const cloudMatch = remoteForScenario.find(
        (r) => r.stepNumber === def.stepNumber,
      );
      map.set(
        def.stepNumber,
        cloudMatch ?? {
          ...def,
          source: 'cloud',
        },
      );
    }

    const merged = this.getSteps(scenarioId);
    this.emit(scenarioId);
    return merged;
  }

  /**
   * Subscribes to real-time workflow step updates for a scenario.
   * Immediately emits cached steps, and attaches an owner-scoped Firestore onSnapshot
   * listener when an authenticated verified Google user is active.
   */
  subscribeWorkflowSteps(
    scenarioId: ScenarioId,
    onSteps: ScenarioListener,
    onError?: (msg: string) => void,
  ): () => void {
    let set = this.listeners.get(scenarioId);
    if (!set) {
      set = new Set();
      this.listeners.set(scenarioId, set);
    }
    set.add(onSteps);

    // Emit current in-memory state immediately so UI/3D rigs never block
    onSteps(this.getSteps(scenarioId));

    const user = this.backend.getAuthenticatedUser();
    let unsubFirestore: (() => void) | null = null;

    if (user && user.emailVerified) {
      const seedKey = `${user.uid}:${scenarioId}`;
      unsubFirestore = this.backend.subscribeOperatorSteps(
        user.uid,
        (records) => {
          const remoteScenario = records.filter((r) => r.scenarioId === scenarioId);
          const defaults = this.getDefaultSteps(scenarioId, user.uid);
          const existingNums = new Set(remoteScenario.map((r) => r.stepNumber));
          const missingDrafts = defaults
            .filter((d) => !existingNums.has(d.stepNumber))
            .map((d) => this.recordToDraft(d, user.uid));

          if (
            missingDrafts.length > 0 &&
            !this.seededCloudScenarios.has(seedKey)
          ) {
            this.seededCloudScenarios.add(seedKey);
            void this.backend
              .seedMissingSteps(user.uid, missingDrafts)
              .catch((err) => {
                this.seededCloudScenarios.delete(seedKey);
                const msg = err instanceof Error ? err.message : String(err);
                onError?.(msg);
              });
          }

          if (remoteScenario.length > 0) {
            const map = this.ensureScenarioMap(scenarioId);
            for (const rec of remoteScenario) {
              map.set(rec.stepNumber, rec);
            }
            this.emit(scenarioId);
          }
        },
        (err) => {
          onError?.(err.message);
        },
      );
    }

    return () => {
      this.listeners.get(scenarioId)?.delete(onSteps);
      unsubFirestore?.();
    };
  }

  /**
   * Validates and updates a single workflow step's title, description, warningText,
   * required torque envelope, and 3D AR model entity IDs.
   * Rejects invalid inputs without silent fallback substitution.
   */
  async updateWorkflowStep(
    scenarioId: ScenarioId,
    stepNumber: number,
    patchInput: WorkflowStepPatchInput,
  ): Promise<WorkflowStepRecord> {
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 6) {
      throw new Error(`Invalid assembly step number: ${stepNumber}`);
    }

    const check = validateWorkflowStepPatchInput(scenarioId, patchInput);
    if (!check.ok) {
      throw new Error(check.error);
    }

    const existing = this.getStep(scenarioId, stepNumber);
    const user = this.backend.getAuthenticatedUser();
    const uid = user && user.emailVerified ? user.uid : 'local';
    const stepDocId = deriveWorkflowStepDocId(uid, scenarioId, stepNumber);
    const canonicalCode = stepNumberToCanonicalCode(stepNumber);

    const draft: WorkflowStepDraft = sanitizeAndValidateWorkflowStepDraft({
      stepDocId,
      operatorUid: uid,
      scenarioId,
      stepNumber,
      canonicalCode,
      partNumber: existing.partNumber,
      ...check.value,
    });

    const updatedRecord: WorkflowStepRecord = {
      ...draft,
      updatedAtIso: new Date().toISOString(),
      source: user && user.emailVerified ? 'cloud' : 'local',
    };

    this.ensureScenarioMap(scenarioId).set(stepNumber, updatedRecord);
    if (
      this.spotlightScenarioId === scenarioId &&
      this.spotlightEntityIds !== null
    ) {
      this.spotlightEntityIds = null;
    }
    this.emit(scenarioId);

    if (user && user.emailVerified) {
      await this.backend.upsertStep(user.uid, draft);
    }

    return updatedRecord;
  }

  /**
   * Restores all 6 workflow steps of a scenario back to factory specifications
   * in local cache and Cloud Firestore (when authenticated).
   */
  async resetScenarioSteps(scenarioId: ScenarioId): Promise<WorkflowStepRecord[]> {
    const user = this.backend.getAuthenticatedUser();
    const uid = user && user.emailVerified ? user.uid : 'local';
    const defaults = this.getDefaultSteps(scenarioId, uid);
    const map = this.ensureScenarioMap(scenarioId);

    for (const def of defaults) {
      map.set(def.stepNumber, {
        ...def,
        source: user && user.emailVerified ? 'cloud' : 'default',
      });
    }

    if (this.spotlightScenarioId === scenarioId) {
      this.spotlightEntityIds = null;
      this.spotlightScenarioId = null;
    }
    this.emit(scenarioId);

    if (user && user.emailVerified) {
      await Promise.all(
        defaults.map((def) =>
          this.backend.upsertStep(user.uid, this.recordToDraft(def, user.uid)),
        ),
      );
    }

    return this.getSteps(scenarioId);
  }

  isArHighlightEnabled(): boolean {
    return this.arHighlightEnabled;
  }

  toggleArHighlight(force?: boolean): boolean {
    this.arHighlightEnabled = force ?? !this.arHighlightEnabled;
    if (!this.arHighlightEnabled) {
      this.spotlightEntityIds = null;
      this.spotlightScenarioId = null;
    }
    return this.arHighlightEnabled;
  }

  getSpotlightEntityIds(scenarioId: ScenarioId): readonly string[] | null {
    if (this.spotlightScenarioId !== scenarioId) return null;
    return this.spotlightEntityIds;
  }

  toggleSpotlightEntity(
    scenarioId: ScenarioId,
    entityId: string,
  ): readonly string[] | null {
    const allowSet = SCENARIO_ENTITY_ALLOWLIST[scenarioId];
    if (!allowSet.has(entityId)) {
      return this.getSpotlightEntityIds(scenarioId);
    }

    if (
      this.spotlightScenarioId === scenarioId &&
      this.spotlightEntityIds?.length === 1 &&
      this.spotlightEntityIds[0] === entityId
    ) {
      this.spotlightEntityIds = null;
      this.spotlightScenarioId = null;
      return null;
    }

    this.arHighlightEnabled = true;
    this.spotlightScenarioId = scenarioId;
    this.spotlightEntityIds = [entityId];
    return this.spotlightEntityIds;
  }

  clearSpotlight(): void {
    this.spotlightEntityIds = null;
    this.spotlightScenarioId = null;
  }

  resolveArHighlightState(
    scenarioId: ScenarioId,
    activeStepNumber: number,
  ): ArEntityHighlightState {
    const step = this.getStep(scenarioId, activeStepNumber);
    if (!this.arHighlightEnabled) {
      return {
        enabled: false,
        entityIds: [],
        colorHex: step.highlightColorHex,
        mode: 'step',
      };
    }

    if (
      this.spotlightScenarioId === scenarioId &&
      this.spotlightEntityIds &&
      this.spotlightEntityIds.length > 0
    ) {
      return {
        enabled: true,
        entityIds: this.spotlightEntityIds,
        colorHex: '#f59e0b',
        mode: 'spotlight',
      };
    }

    return {
      enabled: true,
      entityIds: step.modelEntityIds,
      colorHex: step.highlightColorHex,
      mode: 'step',
    };
  }

  private initializeScenarioDefaults(scenarioId: ScenarioId): void {
    const map = this.ensureScenarioMap(scenarioId);
    for (const rec of this.getDefaultSteps(scenarioId, 'local')) {
      map.set(rec.stepNumber, rec);
    }
  }

  private ensureScenarioMap(
    scenarioId: ScenarioId,
  ): Map<number, WorkflowStepRecord> {
    let map = this.store.get(scenarioId);
    if (!map) {
      map = new Map();
      this.store.set(scenarioId, map);
    }
    return map;
  }

  private recordToDraft(
    rec: WorkflowStepRecord,
    uid: string,
  ): WorkflowStepDraft {
    return {
      stepDocId: deriveWorkflowStepDocId(uid, rec.scenarioId, rec.stepNumber),
      operatorUid: uid,
      scenarioId: rec.scenarioId,
      stepNumber: rec.stepNumber,
      canonicalCode: rec.canonicalCode,
      title: rec.title,
      partNumber: rec.partNumber,
      description: rec.description,
      warningText: rec.warningText,
      requiredTorqueNm: rec.requiredTorqueNm,
      torqueMinNm: rec.torqueMinNm,
      torqueMaxNm: rec.torqueMaxNm,
      modelEntityIds: [...rec.modelEntityIds],
      highlightColorHex: rec.highlightColorHex,
    };
  }

  private emit(scenarioId: ScenarioId): void {
    const listeners = this.listeners.get(scenarioId);
    if (!listeners || listeners.size === 0) return;
    const snapshot = this.getSteps(scenarioId);
    for (const cb of listeners) {
      cb(snapshot);
    }
  }
}
