export type ScenarioId = 'panel_buildup' | 'turbofan_core';
export type TraceabilityStatus = 'in_progress' | 'certified';

export const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const ALLOWED_STEP_CODES = Object.freeze([
  'STEP-01',
  'STEP-02',
  'STEP-03',
  'STEP-04',
  'STEP-05',
  'STEP-06',
] as const);

export type AllowedStepCode = (typeof ALLOWED_STEP_CODES)[number];

export const PANEL_ENTITY_IDS = Object.freeze([
  'ENT-F6X-PINS-40MM',
  'ENT-F6X-PIN-BASES',
  'ENT-F6X-CLICK-BRACKETS',
  'ENT-F6X-BRACKET-TABS',
  'ENT-F6X-KAPTON-BLANKET',
  'ENT-F6X-VAPOR-TAPES',
  'ENT-F6X-HARNESS-BUNDLE',
  'ENT-F6X-PCLAMPS',
  'ENT-F6X-LOCKING-CAPS',
  'ENT-F6X-SHEAR-TIES',
  'ENT-F6X-DADO-PORT',
  'ENT-F6X-DADO-STARBOARD',
] as const);

export const TURBOFAN_ENTITY_IDS = Object.freeze([
  'ENT-TF90-LP-SHAFT',
  'ENT-TF90-FWD-BEARING',
  'ENT-TF90-AFT-BEARING',
  'ENT-TF90-FAN-HUB',
  'ENT-TF90-FAN-BLADES',
  'ENT-TF90-SPINNER-LOCKNUT',
  'ENT-TF90-HPC-BARREL',
  'ENT-TF90-VSV-RING',
  'ENT-TF90-HPC-BOLTS',
  'ENT-TF90-COMBUSTOR-LINER',
  'ENT-TF90-FUEL-MANIFOLD',
  'ENT-TF90-FUEL-NOZZLES',
  'ENT-TF90-HPT-BLISK',
  'ENT-TF90-EXHAUST-CONE',
  'ENT-TF90-HPT-BOLTS',
  'ENT-TF90-COWL-PORT',
  'ENT-TF90-COWL-STARBOARD',
  'ENT-TF90-FADEC-UNIT',
] as const);

export const SCENARIO_ENTITY_ALLOWLIST: Readonly<
  Record<ScenarioId, ReadonlySet<string>>
> = Object.freeze({
  panel_buildup: new Set<string>(PANEL_ENTITY_IDS),
  turbofan_core: new Set<string>(TURBOFAN_ENTITY_IDS),
});

export interface ValidatedUserPublicInput {
  readonly uid: string;
  readonly displayName: string;
  readonly photoUrl: string;
  readonly operatorBadge: string;
}

export interface ValidatedUserPrivateInput {
  readonly uid: string;
  readonly email: string;
}

export interface TraceabilityRunDraft {
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
}

export interface WorkflowStepDraft {
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
}

export interface WorkflowStepPatchInput {
  readonly title: string;
  readonly description: string;
  readonly warningText: string;
  readonly requiredTorqueNm: number;
  readonly torqueMinNm: number;
  readonly torqueMaxNm: number;
  readonly modelEntityIds: readonly string[];
  readonly highlightColorHex: string;
}

export interface DimeoSupervisionRunDraft {
  readonly dimeoRunId: string;
  readonly operatorUid: string;
  readonly operatorLabel: string;
  readonly accountMode: 'nominative' | 'shared_station';
  readonly language: 'en' | 'fr' | 'es';
  readonly scenarioId: ScenarioId;
  readonly moduleTitle: string;
  readonly validatedStepsCount: number;
  readonly qcmAnsweredCount: number;
  readonly photosCount: number;
  readonly commentsCount: number;
  readonly arEnabled: boolean;
}

export function isValidFirestoreId(id: string, minLen = 1, maxLen = 128): boolean {
  return (
    typeof id === 'string' &&
    id.length >= minLen &&
    id.length <= maxLen &&
    ID_PATTERN.test(id)
  );
}

export function sanitizeDisplayName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Aerospace Operator';
  return trimmed.slice(0, 80);
}

export function sanitizePhotoUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.length > 500) return '';
  return trimmed;
}

export function deriveOperatorBadge(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (clean.slice(0, 6) || 'OP4001').padEnd(6, '0');
  return `OPR-${suffix}`;
}

export function deriveWorkflowStepDocId(
  operatorUid: string,
  scenarioId: ScenarioId,
  stepNumber: number,
): string {
  const cleanUid = operatorUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) || 'local';
  const clampedStep = clampInt(stepNumber, 1, 6);
  return `wf_${cleanUid}_${scenarioId}_step0${clampedStep}`;
}

export function stepNumberToCanonicalCode(stepNumber: number): AllowedStepCode {
  const clamped = clampInt(stepNumber, 1, 6) as 1 | 2 | 3 | 4 | 5 | 6;
  return `STEP-0${clamped}`;
}

export function validateWorkflowStepPatchInput(
  scenarioId: ScenarioId,
  input: WorkflowStepPatchInput,
): {ok: true; value: WorkflowStepPatchInput} | {ok: false; error: string} {
  if (scenarioId !== 'panel_buildup' && scenarioId !== 'turbofan_core') {
    return {ok: false, error: 'Unsupported manufacturing scenario.'};
  }

  const title = (input.title ?? '').trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 120) {
    return {
      ok: false,
      error: 'Step title must be between 3 and 120 characters.',
    };
  }

  const description = (input.description ?? '').trim().replace(/\s+/g, ' ');
  if (description.length < 5 || description.length > 500) {
    return {
      ok: false,
      error: 'Step description must be between 5 and 500 characters.',
    };
  }

  const warningText = (input.warningText ?? '').trim().replace(/\s+/g, ' ');
  if (warningText.length > 280) {
    return {
      ok: false,
      error: 'Poka-Yoke warning text cannot exceed 280 characters.',
    };
  }

  const requiredTorqueNm = roundTwoDecimals(input.requiredTorqueNm);
  const torqueMinNm = roundTwoDecimals(input.torqueMinNm);
  const torqueMaxNm = roundTwoDecimals(input.torqueMaxNm);

  if (
    !Number.isFinite(requiredTorqueNm) ||
    !Number.isFinite(torqueMinNm) ||
    !Number.isFinite(torqueMaxNm)
  ) {
    return {
      ok: false,
      error: 'Torque settings must be valid numbers in N·m.',
    };
  }

  if (
    torqueMinNm < 0 ||
    requiredTorqueNm < 0 ||
    torqueMaxNm < 0 ||
    torqueMinNm > 2000 ||
    requiredTorqueNm > 2000 ||
    torqueMaxNm > 2000
  ) {
    return {
      ok: false,
      error: 'Torque values must stay within 0 and 2000 N·m.',
    };
  }

  if (torqueMinNm > requiredTorqueNm || requiredTorqueNm > torqueMaxNm) {
    return {
      ok: false,
      error:
        'Torque tolerance envelope invalid: Min Torque <= Required Torque <= Max Torque is required.',
    };
  }

  const allowSet = SCENARIO_ENTITY_ALLOWLIST[scenarioId];
  const dedupedEntities: string[] = [];
  for (const rawId of input.modelEntityIds ?? []) {
    const trimmed = String(rawId).trim();
    if (!allowSet.has(trimmed)) {
      return {
        ok: false,
        error: `Entity ID "${trimmed}" does not belong to ${scenarioId}.`,
      };
    }
    if (!dedupedEntities.includes(trimmed)) {
      dedupedEntities.push(trimmed);
    }
  }

  if (dedupedEntities.length < 1 || dedupedEntities.length > 6) {
    return {
      ok: false,
      error: 'Select between 1 and 6 3D model entities for AR highlighting.',
    };
  }

  const highlightColorHex = (input.highlightColorHex ?? '').trim();
  if (!HEX_COLOR_PATTERN.test(highlightColorHex)) {
    return {
      ok: false,
      error: 'Highlight tint must be a 6-digit hex color (e.g. #38bdf8).',
    };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      warningText,
      requiredTorqueNm,
      torqueMinNm,
      torqueMaxNm,
      modelEntityIds: dedupedEntities,
      highlightColorHex,
    },
  };
}

export function sanitizeAndValidateWorkflowStepDraft(
  draft: WorkflowStepDraft,
): WorkflowStepDraft {
  if (!isValidFirestoreId(draft.stepDocId, 3, 96)) {
    throw new Error(`Invalid workflow stepDocId: ${draft.stepDocId}`);
  }
  if (!isValidFirestoreId(draft.operatorUid, 1, 128)) {
    throw new Error('Invalid operatorUid for workflow step payload.');
  }
  if (draft.scenarioId !== 'panel_buildup' && draft.scenarioId !== 'turbofan_core') {
    throw new Error(`Unsupported scenarioId: ${String(draft.scenarioId)}`);
  }
  if (!Number.isInteger(draft.stepNumber) || draft.stepNumber < 1 || draft.stepNumber > 6) {
    throw new Error(`Invalid stepNumber: ${draft.stepNumber}`);
  }
  const expectedCode = stepNumberToCanonicalCode(draft.stepNumber);
  if (draft.canonicalCode !== expectedCode) {
    throw new Error(
      `Mismatched canonicalCode ${draft.canonicalCode} for step ${draft.stepNumber}`,
    );
  }
  if (!isValidFirestoreId(draft.partNumber, 2, 40)) {
    throw new Error(`Invalid partNumber: ${draft.partNumber}`);
  }

  const patchCheck = validateWorkflowStepPatchInput(draft.scenarioId, {
    title: draft.title,
    description: draft.description,
    warningText: draft.warningText,
    requiredTorqueNm: draft.requiredTorqueNm,
    torqueMinNm: draft.torqueMinNm,
    torqueMaxNm: draft.torqueMaxNm,
    modelEntityIds: draft.modelEntityIds,
    highlightColorHex: draft.highlightColorHex,
  });

  if (!patchCheck.ok) {
    throw new Error(patchCheck.error);
  }

  return {
    stepDocId: draft.stepDocId,
    operatorUid: draft.operatorUid,
    scenarioId: draft.scenarioId,
    stepNumber: draft.stepNumber,
    canonicalCode: expectedCode,
    partNumber: draft.partNumber,
    ...patchCheck.value,
  };
}

export function sanitizeAndValidateTraceabilityDraft(
  draft: TraceabilityRunDraft,
): TraceabilityRunDraft {
  if (!isValidFirestoreId(draft.runId, 3, 96)) {
    throw new Error(`Invalid traceability runId: ${draft.runId}`);
  }
  if (!isValidFirestoreId(draft.operatorUid, 1, 128)) {
    throw new Error('Invalid operatorUid for traceability payload.');
  }
  if (!isValidFirestoreId(draft.workOrderId, 3, 40)) {
    throw new Error(`Invalid workOrderId: ${draft.workOrderId}`);
  }
  if (draft.scenarioId !== 'panel_buildup' && draft.scenarioId !== 'turbofan_core') {
    throw new Error(`Unsupported scenarioId: ${String(draft.scenarioId)}`);
  }

  const installedCount = clampInt(draft.installedCount, 0, 6);
  const compliantCount = clampInt(draft.compliantCount, 0, 6);
  const activeDefectCount = clampInt(draft.activeDefectCount, 0, 6);
  const reworkedCount = clampInt(draft.reworkedCount, 0, 6);
  const firstPassYieldPercent = clampInt(draft.firstPassYieldPercent, 0, 100);

  const allowedSet = new Set<string>(ALLOWED_STEP_CODES);
  const completedSteps: string[] = [];
  for (const code of draft.completedSteps) {
    if (allowedSet.has(code) && !completedSteps.includes(code) && completedSteps.length < 6) {
      completedSteps.push(code);
    }
  }

  const canBeCertified =
    draft.status === 'certified' &&
    installedCount === 6 &&
    compliantCount === 6 &&
    activeDefectCount === 0 &&
    draft.certificateCode.trim().length >= 6;

  const status: TraceabilityStatus = canBeCertified ? 'certified' : 'in_progress';
  const certificateCode = canBeCertified
    ? draft.certificateCode.trim().slice(0, 64)
    : '';

  return {
    runId: draft.runId,
    operatorUid: draft.operatorUid,
    operatorName: sanitizeDisplayName(draft.operatorName),
    scenarioId: draft.scenarioId,
    workOrderId: draft.workOrderId,
    installedCount,
    compliantCount,
    activeDefectCount,
    reworkedCount,
    firstPassYieldPercent,
    status,
    certificateCode,
    completedSteps,
  };
}

export function sanitizeAndValidateDimeoRunDraft(
  draft: DimeoSupervisionRunDraft,
): DimeoSupervisionRunDraft {
  if (!isValidFirestoreId(draft.dimeoRunId, 3, 96)) {
    throw new Error(`Invalid dimeoRunId: ${draft.dimeoRunId}`);
  }
  if (!isValidFirestoreId(draft.operatorUid, 1, 128)) {
    throw new Error('Invalid operatorUid for Dimeo supervision payload.');
  }
  if (draft.scenarioId !== 'panel_buildup' && draft.scenarioId !== 'turbofan_core') {
    throw new Error(`Unsupported scenarioId: ${String(draft.scenarioId)}`);
  }
  const accountMode =
    draft.accountMode === 'shared_station' ? 'shared_station' : 'nominative';
  const language =
    draft.language === 'fr' || draft.language === 'es' ? draft.language : 'en';
  const operatorLabel = sanitizeDisplayName(draft.operatorLabel);
  const cleanTitle =
    (draft.moduleTitle ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) ||
    'Dimeo XR Procedure';
  const moduleTitle = cleanTitle.length >= 2 ? cleanTitle : 'Dimeo XR';

  return {
    dimeoRunId: draft.dimeoRunId,
    operatorUid: draft.operatorUid,
    operatorLabel,
    accountMode,
    language,
    scenarioId: draft.scenarioId,
    moduleTitle,
    validatedStepsCount: clampInt(draft.validatedStepsCount, 0, 6),
    qcmAnsweredCount: clampInt(draft.qcmAnsweredCount, 0, 6),
    photosCount: clampInt(draft.photosCount, 0, 12),
    commentsCount: clampInt(draft.commentsCount, 0, 24),
    arEnabled: Boolean(draft.arEnabled),
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundTwoDecimals(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic security-rule contract evaluator mirroring /firestore.rules
 * so Phase 0/5 Dirty Dozen adversarial payloads are continuously verified in node:test.
 */
export interface SimulatedRuleContext {
  readonly auth: {
    readonly uid: string;
    readonly email: string;
    readonly email_verified: boolean;
  } | null;
  readonly requestTimeMs: number;
  readonly existingDocs: Readonly<Record<string, Record<string, unknown>>>;
  readonly afterDocs?: Readonly<Record<string, Record<string, unknown>>>;
}

export function evaluateFirestoreRuleContract(params: {
  readonly op: 'get' | 'list' | 'create' | 'update' | 'delete';
  readonly path: string;
  readonly resourceData?: Record<string, unknown>;
  readonly requestData?: Record<string, unknown>;
  readonly ctx: SimulatedRuleContext;
}): boolean {
  const {op, path, resourceData, requestData, ctx} = params;
  const parts = path.replace(/^\/+/, '').split('/');

  const isSignedIn = ctx.auth !== null;
  const isVerifiedUser = isSignedIn && ctx.auth!.email_verified === true;
  const isOwner = (uid: string) => isVerifiedUser && ctx.auth!.uid === uid;
  const hasExactKeys = (obj: Record<string, unknown>, keys: string[]) => {
    const objKeys = Object.keys(obj);
    return (
      keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k)) &&
      objKeys.every((k) => keys.includes(k))
    );
  };

  // 1. /users/{userId}
  if (parts.length === 2 && parts[0] === 'users') {
    const userId = parts[1];
    if (op === 'list' || op === 'delete') return false;
    if (op === 'get') return isOwner(userId) && isValidFirestoreId(userId);
    if (!requestData) return false;

    const validProfile =
      hasExactKeys(requestData, [
        'uid',
        'displayName',
        'photoUrl',
        'operatorBadge',
        'createdAt',
        'updatedAt',
      ]) &&
      typeof requestData.uid === 'string' &&
      isValidFirestoreId(requestData.uid) &&
      requestData.uid === ctx.auth?.uid &&
      typeof requestData.displayName === 'string' &&
      requestData.displayName.length >= 1 &&
      requestData.displayName.length <= 80 &&
      typeof requestData.photoUrl === 'string' &&
      requestData.photoUrl.length <= 500 &&
      typeof requestData.operatorBadge === 'string' &&
      isValidFirestoreId(requestData.operatorBadge, 3, 32) &&
      typeof requestData.createdAt === 'number' &&
      typeof requestData.updatedAt === 'number';

    if (op === 'create') {
      return (
        isOwner(userId) &&
        isValidFirestoreId(userId) &&
        validProfile &&
        requestData.createdAt === ctx.requestTimeMs &&
        requestData.updatedAt === ctx.requestTimeMs
      );
    }
    if (op === 'update' && resourceData) {
      const affected = Object.keys(requestData).filter(
        (k) => requestData[k] !== resourceData[k],
      );
      return (
        isOwner(userId) &&
        validProfile &&
        isValidFirestoreId(userId) &&
        requestData.uid === resourceData.uid &&
        requestData.operatorBadge === resourceData.operatorBadge &&
        requestData.createdAt === resourceData.createdAt &&
        requestData.updatedAt === ctx.requestTimeMs &&
        affected.every((k) => ['displayName', 'photoUrl', 'updatedAt'].includes(k))
      );
    }
    return false;
  }

  // 2. /users/{userId}/private/{docId}
  if (parts.length === 4 && parts[0] === 'users' && parts[2] === 'private') {
    const [, userId, , docId] = parts;
    if (op === 'list' || op === 'delete') return false;
    const parentDoc = ctx.existingDocs[`users/${userId}`];
    if (op === 'get') {
      return (
        isOwner(userId) &&
        isValidFirestoreId(userId) &&
        docId === 'info' &&
        Boolean(parentDoc) &&
        parentDoc.uid === ctx.auth?.uid
      );
    }
    if (!requestData) return false;
    const validPrivate =
      hasExactKeys(requestData, ['uid', 'email', 'createdAt', 'updatedAt']) &&
      typeof requestData.uid === 'string' &&
      isValidFirestoreId(requestData.uid) &&
      requestData.uid === ctx.auth?.uid &&
      typeof requestData.email === 'string' &&
      requestData.email.length >= 3 &&
      requestData.email.length <= 160 &&
      requestData.email === ctx.auth?.email &&
      typeof requestData.createdAt === 'number' &&
      typeof requestData.updatedAt === 'number';

    if (op === 'create') {
      const afterParent =
        ctx.afterDocs?.[`users/${userId}`] ?? ctx.existingDocs[`users/${userId}`];
      return (
        isOwner(userId) &&
        isValidFirestoreId(userId) &&
        docId === 'info' &&
        validPrivate &&
        requestData.createdAt === ctx.requestTimeMs &&
        requestData.updatedAt === ctx.requestTimeMs &&
        Boolean(afterParent) &&
        afterParent.uid === ctx.auth?.uid
      );
    }
    return false;
  }

  // 3. /traceabilityRuns/{runId}
  if (parts.length === 2 && parts[0] === 'traceabilityRuns') {
    const runId = parts[1];
    if (op === 'delete') return false;
    if (op === 'get') {
      return (
        isVerifiedUser &&
        isValidFirestoreId(runId) &&
        resourceData?.operatorUid === ctx.auth?.uid
      );
    }
    if (op === 'list') {
      return isVerifiedUser && resourceData?.operatorUid === ctx.auth?.uid;
    }
    if (!requestData) return false;

    const steps = requestData.completedSteps;
    const allowedCodes = new Set<string>(ALLOWED_STEP_CODES);
    const validRun =
      hasExactKeys(requestData, [
        'runId',
        'operatorUid',
        'operatorName',
        'scenarioId',
        'workOrderId',
        'installedCount',
        'compliantCount',
        'activeDefectCount',
        'reworkedCount',
        'firstPassYieldPercent',
        'status',
        'certificateCode',
        'completedSteps',
        'createdAt',
        'updatedAt',
      ]) &&
      typeof requestData.runId === 'string' &&
      isValidFirestoreId(requestData.runId, 3, 96) &&
      typeof requestData.operatorUid === 'string' &&
      isValidFirestoreId(requestData.operatorUid) &&
      requestData.operatorUid === ctx.auth?.uid &&
      typeof requestData.operatorName === 'string' &&
      requestData.operatorName.length >= 1 &&
      requestData.operatorName.length <= 80 &&
      (requestData.scenarioId === 'panel_buildup' ||
        requestData.scenarioId === 'turbofan_core') &&
      typeof requestData.workOrderId === 'string' &&
      isValidFirestoreId(requestData.workOrderId, 3, 40) &&
      Number.isInteger(requestData.installedCount) &&
      (requestData.installedCount as number) >= 0 &&
      (requestData.installedCount as number) <= 6 &&
      Number.isInteger(requestData.compliantCount) &&
      (requestData.compliantCount as number) >= 0 &&
      (requestData.compliantCount as number) <= 6 &&
      Number.isInteger(requestData.activeDefectCount) &&
      (requestData.activeDefectCount as number) >= 0 &&
      (requestData.activeDefectCount as number) <= 6 &&
      Number.isInteger(requestData.reworkedCount) &&
      (requestData.reworkedCount as number) >= 0 &&
      (requestData.reworkedCount as number) <= 6 &&
      Number.isInteger(requestData.firstPassYieldPercent) &&
      (requestData.firstPassYieldPercent as number) >= 0 &&
      (requestData.firstPassYieldPercent as number) <= 100 &&
      (requestData.status === 'in_progress' ||
        requestData.status === 'certified') &&
      typeof requestData.certificateCode === 'string' &&
      requestData.certificateCode.length <= 64 &&
      Array.isArray(steps) &&
      steps.length <= 6 &&
      steps.every((s) => typeof s === 'string' && allowedCodes.has(s)) &&
      typeof requestData.createdAt === 'number' &&
      typeof requestData.updatedAt === 'number';

    if (op === 'create') {
      const userDoc = ctx.existingDocs[`users/${ctx.auth?.uid ?? ''}`];
      return (
        isVerifiedUser &&
        isValidFirestoreId(runId) &&
        validRun &&
        requestData.runId === runId &&
        requestData.createdAt === ctx.requestTimeMs &&
        requestData.updatedAt === ctx.requestTimeMs &&
        Boolean(userDoc) &&
        userDoc.uid === ctx.auth?.uid
      );
    }

    if (op === 'update' && resourceData) {
      if (
        !isVerifiedUser ||
        !validRun ||
        !isValidFirestoreId(runId) ||
        resourceData.operatorUid !== ctx.auth?.uid ||
        resourceData.status === 'certified' ||
        requestData.runId !== resourceData.runId ||
        requestData.operatorUid !== resourceData.operatorUid ||
        requestData.scenarioId !== resourceData.scenarioId ||
        requestData.workOrderId !== resourceData.workOrderId ||
        requestData.createdAt !== resourceData.createdAt ||
        requestData.updatedAt !== ctx.requestTimeMs
      ) {
        return false;
      }
      return true;
    }
  }

  // 4. /workflowSteps/{stepDocId}
  if (parts.length === 2 && parts[0] === 'workflowSteps') {
    const stepDocId = parts[1];
    if (op === 'delete') return false;
    if (op === 'get') {
      return (
        isVerifiedUser &&
        isValidFirestoreId(stepDocId) &&
        resourceData?.operatorUid === ctx.auth?.uid
      );
    }
    if (op === 'list') {
      return isVerifiedUser && resourceData?.operatorUid === ctx.auth?.uid;
    }
    if (!requestData) return false;

    const scenarioId = requestData.scenarioId;
    const entityList = requestData.modelEntityIds;
    const stepNum = requestData.stepNumber;
    const canonicalCode = requestData.canonicalCode;
    const reqTorque = requestData.requiredTorqueNm;
    const minTorque = requestData.torqueMinNm;
    const maxTorque = requestData.torqueMaxNm;

    const validScenario =
      scenarioId === 'panel_buildup' || scenarioId === 'turbofan_core';
    const allowEntities = validScenario
      ? SCENARIO_ENTITY_ALLOWLIST[scenarioId]
      : new Set<string>();

    const validWorkflowStep =
      hasExactKeys(requestData, [
        'stepDocId',
        'operatorUid',
        'scenarioId',
        'stepNumber',
        'canonicalCode',
        'title',
        'partNumber',
        'description',
        'warningText',
        'requiredTorqueNm',
        'torqueMinNm',
        'torqueMaxNm',
        'modelEntityIds',
        'highlightColorHex',
        'createdAt',
        'updatedAt',
      ]) &&
      typeof requestData.stepDocId === 'string' &&
      isValidFirestoreId(requestData.stepDocId, 3, 96) &&
      typeof requestData.operatorUid === 'string' &&
      isValidFirestoreId(requestData.operatorUid, 1, 128) &&
      requestData.operatorUid === ctx.auth?.uid &&
      validScenario &&
      Number.isInteger(stepNum) &&
      (stepNum as number) >= 1 &&
      (stepNum as number) <= 6 &&
      typeof canonicalCode === 'string' &&
      canonicalCode === `STEP-0${stepNum as number}` &&
      typeof requestData.title === 'string' &&
      requestData.title.length >= 3 &&
      requestData.title.length <= 120 &&
      typeof requestData.partNumber === 'string' &&
      isValidFirestoreId(requestData.partNumber, 2, 40) &&
      typeof requestData.description === 'string' &&
      requestData.description.length >= 5 &&
      requestData.description.length <= 500 &&
      typeof requestData.warningText === 'string' &&
      requestData.warningText.length <= 280 &&
      typeof reqTorque === 'number' &&
      Number.isFinite(reqTorque) &&
      reqTorque >= 0 &&
      reqTorque <= 2000 &&
      typeof minTorque === 'number' &&
      Number.isFinite(minTorque) &&
      minTorque >= 0 &&
      minTorque <= 2000 &&
      typeof maxTorque === 'number' &&
      Number.isFinite(maxTorque) &&
      maxTorque >= 0 &&
      maxTorque <= 2000 &&
      minTorque <= reqTorque &&
      reqTorque <= maxTorque &&
      Array.isArray(entityList) &&
      entityList.length >= 1 &&
      entityList.length <= 6 &&
      typeof entityList[0] === 'string' &&
      entityList[0].length >= 3 &&
      entityList[0].length <= 48 &&
      entityList.every((e) => typeof e === 'string' && allowEntities.has(e)) &&
      typeof requestData.highlightColorHex === 'string' &&
      HEX_COLOR_PATTERN.test(requestData.highlightColorHex) &&
      typeof requestData.createdAt === 'number' &&
      typeof requestData.updatedAt === 'number';

    if (op === 'create') {
      const userDoc = ctx.existingDocs[`users/${ctx.auth?.uid ?? ''}`];
      return (
        isVerifiedUser &&
        isValidFirestoreId(stepDocId) &&
        validWorkflowStep &&
        requestData.stepDocId === stepDocId &&
        requestData.createdAt === ctx.requestTimeMs &&
        requestData.updatedAt === ctx.requestTimeMs &&
        Boolean(userDoc) &&
        userDoc.uid === ctx.auth?.uid
      );
    }

    if (op === 'update' && resourceData) {
      const affected = Object.keys(requestData).filter(
        (k) => JSON.stringify(requestData[k]) !== JSON.stringify(resourceData[k]),
      );
      const allowedAction1 = [
        'title',
        'description',
        'warningText',
        'requiredTorqueNm',
        'torqueMinNm',
        'torqueMaxNm',
        'modelEntityIds',
        'highlightColorHex',
        'updatedAt',
      ];
      return (
        isVerifiedUser &&
        validWorkflowStep &&
        isValidFirestoreId(stepDocId) &&
        resourceData.operatorUid === ctx.auth?.uid &&
        requestData.stepDocId === resourceData.stepDocId &&
        requestData.operatorUid === resourceData.operatorUid &&
        requestData.scenarioId === resourceData.scenarioId &&
        requestData.stepNumber === resourceData.stepNumber &&
        requestData.canonicalCode === resourceData.canonicalCode &&
        requestData.partNumber === resourceData.partNumber &&
        requestData.createdAt === resourceData.createdAt &&
        requestData.updatedAt === ctx.requestTimeMs &&
        affected.every((k) => allowedAction1.includes(k))
      );
    }
  }

  // 5. /dimeoRuns/{dimeoRunId}
  if (parts.length === 2 && parts[0] === 'dimeoRuns') {
    const dimeoRunId = parts[1];
    if (op === 'delete') return false;
    if (op === 'get') {
      return (
        isVerifiedUser &&
        isValidFirestoreId(dimeoRunId) &&
        resourceData?.operatorUid === ctx.auth?.uid
      );
    }
    if (op === 'list') {
      return isVerifiedUser && resourceData?.operatorUid === ctx.auth?.uid;
    }
    if (!requestData) return false;

    const validDimeoRun =
      hasExactKeys(requestData, [
        'dimeoRunId',
        'operatorUid',
        'operatorLabel',
        'accountMode',
        'language',
        'scenarioId',
        'moduleTitle',
        'validatedStepsCount',
        'qcmAnsweredCount',
        'photosCount',
        'commentsCount',
        'arEnabled',
        'createdAt',
        'updatedAt',
      ]) &&
      typeof requestData.dimeoRunId === 'string' &&
      isValidFirestoreId(requestData.dimeoRunId, 3, 96) &&
      typeof requestData.operatorUid === 'string' &&
      isValidFirestoreId(requestData.operatorUid, 1, 128) &&
      requestData.operatorUid === ctx.auth?.uid &&
      typeof requestData.operatorLabel === 'string' &&
      requestData.operatorLabel.length >= 1 &&
      requestData.operatorLabel.length <= 80 &&
      (requestData.accountMode === 'nominative' ||
        requestData.accountMode === 'shared_station') &&
      (requestData.language === 'en' ||
        requestData.language === 'fr' ||
        requestData.language === 'es') &&
      (requestData.scenarioId === 'panel_buildup' ||
        requestData.scenarioId === 'turbofan_core') &&
      typeof requestData.moduleTitle === 'string' &&
      requestData.moduleTitle.length >= 2 &&
      requestData.moduleTitle.length <= 120 &&
      Number.isInteger(requestData.validatedStepsCount) &&
      (requestData.validatedStepsCount as number) >= 0 &&
      (requestData.validatedStepsCount as number) <= 6 &&
      Number.isInteger(requestData.qcmAnsweredCount) &&
      (requestData.qcmAnsweredCount as number) >= 0 &&
      (requestData.qcmAnsweredCount as number) <= 6 &&
      Number.isInteger(requestData.photosCount) &&
      (requestData.photosCount as number) >= 0 &&
      (requestData.photosCount as number) <= 12 &&
      Number.isInteger(requestData.commentsCount) &&
      (requestData.commentsCount as number) >= 0 &&
      (requestData.commentsCount as number) <= 24 &&
      typeof requestData.arEnabled === 'boolean' &&
      typeof requestData.createdAt === 'number' &&
      typeof requestData.updatedAt === 'number';

    if (op === 'create') {
      const userDoc = ctx.existingDocs[`users/${ctx.auth?.uid ?? ''}`];
      return (
        isVerifiedUser &&
        isValidFirestoreId(dimeoRunId) &&
        validDimeoRun &&
        requestData.dimeoRunId === dimeoRunId &&
        requestData.createdAt === ctx.requestTimeMs &&
        requestData.updatedAt === ctx.requestTimeMs &&
        Boolean(userDoc) &&
        userDoc.uid === ctx.auth?.uid
      );
    }

    if (op === 'update' && resourceData) {
      const affected = Object.keys(requestData).filter(
        (k) => requestData[k] !== resourceData[k],
      );
      const allowedAction1 = [
        'operatorLabel',
        'accountMode',
        'language',
        'moduleTitle',
        'validatedStepsCount',
        'qcmAnsweredCount',
        'photosCount',
        'commentsCount',
        'arEnabled',
        'updatedAt',
      ];
      return (
        isVerifiedUser &&
        validDimeoRun &&
        isValidFirestoreId(dimeoRunId) &&
        resourceData.operatorUid === ctx.auth?.uid &&
        requestData.dimeoRunId === resourceData.dimeoRunId &&
        requestData.operatorUid === resourceData.operatorUid &&
        requestData.scenarioId === resourceData.scenarioId &&
        requestData.createdAt === resourceData.createdAt &&
        requestData.updatedAt === ctx.requestTimeMs &&
        affected.every((k) => allowedAction1.includes(k))
      );
    }
  }

  return false;
}
