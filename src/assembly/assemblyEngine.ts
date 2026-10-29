import type {ScenarioId} from '../firebase/payloadValidation';
import {
  QC_TOOL_META,
  SCENARIO_CATALOG,
  type AssemblyStepSpec,
  type InspectionCheckpointSpec,
  type QCStatus,
  type QCToolType,
  type ScenarioDefinition,
} from './assemblyData';

export interface CheckpointRuntimeState {
  readonly spec: InspectionCheckpointSpec;
  status: QCStatus;
  measuredValue: number | null;
  inspectedCount: number;
  reworked: boolean;
  lastNote: string;
}

export interface PartTransformTarget {
  readonly stepId: number;
  readonly installed: boolean;
  readonly visibleAsSolid: boolean;
  readonly visibleAsGhost: boolean;
  readonly targetPosition: readonly [number, number, number];
  /** For Step 6 split nacelle/dado panel halves, radial X separation in meters */
  readonly nacelleHalfSpreadX: number;
}

export interface AssemblySummary {
  readonly totalSteps: number;
  readonly installedCount: number;
  readonly inspectedCount: number;
  readonly compliantCount: number;
  readonly activeDefectCount: number;
  readonly reworkedCount: number;
  readonly completionPercent: number;
  readonly compliancePercent: number;
  readonly firstPassYieldPercent: number;
  readonly canSignOff: boolean;
  readonly signedOff: boolean;
  readonly certificateCode: string | null;
}

export interface ActionFeedback {
  readonly ok: boolean;
  readonly kind:
    | 'install'
    | 'inspect_pass'
    | 'inspect_fail'
    | 'rework'
    | 'signoff'
    | 'info'
    | 'blocked';
  readonly message: string;
}

export type DocViewMode = 'ok_ko' | 'blueprint';

export interface WorkflowStepOverrideInput {
  readonly stepNumber: number;
  readonly title: string;
  readonly description: string;
  readonly warningText: string;
  readonly requiredTorqueNm: number;
  readonly torqueMinNm: number;
  readonly torqueMaxNm: number;
  readonly modelEntityIds: readonly string[];
  readonly highlightColorHex: string;
}

export class AeroAssemblyEngine {
  private scenarioId: ScenarioId;
  private customSteps = new Map<ScenarioId, readonly AssemblyStepSpec[]>();
  private customCheckpoints = new Map<
    ScenarioId,
    readonly InspectionCheckpointSpec[]
  >();
  private currentStepId = 1;
  private installedSteps = new Set<number>();
  private activeTool: QCToolType = 'laser_gap';
  private selectedCheckpointId = 'CP-01';
  private checkpoints = new Map<string, CheckpointRuntimeState>();
  private explodedFactor = 0; // 0..1
  private cutawayEnabled = false;
  private testRpmPercent = 18;
  private signedOff = false;
  private certificateCode: string | null = null;
  private correlationLocked = true;
  private showCorrelationGuide = true;
  private docViewMode: DocViewMode = 'ok_ko';
  private sessionNonce = 1;
  private lastFeedback: ActionFeedback = {
    ok: true,
    kind: 'info',
    message: 'Ready for holographic mounting.',
  };

  constructor(initialScenario: ScenarioId = 'turbofan_core') {
    this.scenarioId = initialScenario;
    this.reset();
  }

  getScenario(): ScenarioDefinition {
    const base = SCENARIO_CATALOG[this.scenarioId];
    return {
      ...base,
      steps: this.getSteps(),
      checkpoints: this.getCheckpointSpecs(),
    };
  }

  getScenarioId(): ScenarioId {
    return this.scenarioId;
  }

  setScenario(nextScenario: ScenarioId): ActionFeedback {
    if (this.scenarioId === nextScenario) {
      return this.lastFeedback;
    }
    this.scenarioId = nextScenario;
    this.sessionNonce += 1;
    return this.reset();
  }

  getSteps(): readonly AssemblyStepSpec[] {
    return (
      this.customSteps.get(this.scenarioId) ??
      SCENARIO_CATALOG[this.scenarioId].steps
    );
  }

  getCheckpointSpecs(): readonly InspectionCheckpointSpec[] {
    return (
      this.customCheckpoints.get(this.scenarioId) ??
      SCENARIO_CATALOG[this.scenarioId].checkpoints
    );
  }

  /**
   * Applies fetched or edited workflow step records (descriptions, required torque
   * envelopes, and 3D model entity highlight IDs) to the scenario's active steps and
   * linked torque QC checkpoints without losing current step mounting progress.
   */
  applyWorkflowSteps(
    scenarioId: ScenarioId,
    records: readonly WorkflowStepOverrideInput[],
  ): void {
    const baseScenario = SCENARIO_CATALOG[scenarioId];
    const byNum = new Map<number, WorkflowStepOverrideInput>();
    for (const rec of records) {
      byNum.set(rec.stepNumber, rec);
    }

    const baseCpByStep = new Map<number, InspectionCheckpointSpec>();
    for (const cp of baseScenario.checkpoints) {
      baseCpByStep.set(cp.stepId, cp);
    }

    const nextSteps: AssemblyStepSpec[] = baseScenario.steps.map((baseStep) => {
      const ov = byNum.get(baseStep.id);
      if (!ov) return baseStep;

      const linkedBaseCp = baseCpByStep.get(baseStep.id);
      const isTorqueCheckpoint = linkedBaseCp?.tool === 'torque';
      const targetSpecLabel = isTorqueCheckpoint
        ? `Torque ${ov.requiredTorqueNm.toFixed(1)} N·m (${ov.torqueMinNm.toFixed(1)}–${ov.torqueMaxNm.toFixed(1)} N·m)`
        : baseStep.targetSpecLabel;

      return {
        ...baseStep,
        name: ov.title,
        instruction: ov.description,
        warningText: ov.warningText,
        requiredTorqueNm: ov.requiredTorqueNm,
        torqueMinNm: ov.torqueMinNm,
        torqueMaxNm: ov.torqueMaxNm,
        modelEntityIds: [...ov.modelEntityIds],
        highlightColorHex: ov.highlightColorHex,
        targetSpecLabel,
      };
    });

    const nextCheckpoints: InspectionCheckpointSpec[] =
      baseScenario.checkpoints.map((baseCp) => {
        if (baseCp.tool !== 'torque') return baseCp;
        const ov = byNum.get(baseCp.stepId);
        if (!ov) return baseCp;

        const factoryIsUnderTorqueDefect =
          baseCp.initialMeasured < baseCp.minAllowed;
        const defectDelta = Math.max(
          0.5,
          baseCp.minAllowed - baseCp.initialMeasured,
        );
        const initialMeasured = factoryIsUnderTorqueDefect
          ? Math.max(0, Number((ov.torqueMinNm - defectDelta).toFixed(2)))
          : ov.requiredTorqueNm;

        return {
          ...baseCp,
          nominal: ov.requiredTorqueNm,
          minAllowed: ov.torqueMinNm,
          maxAllowed: ov.torqueMaxNm,
          initialMeasured,
          calibratedMeasured: ov.requiredTorqueNm,
        };
      });

    this.customSteps.set(scenarioId, Object.freeze(nextSteps));
    this.customCheckpoints.set(scenarioId, Object.freeze(nextCheckpoints));

    if (scenarioId === this.scenarioId) {
      for (const newSpec of nextCheckpoints) {
        const runtime = this.checkpoints.get(newSpec.id);
        if (!runtime) continue;

        let nextStatus = runtime.status;
        let nextMeasured = runtime.measuredValue;
        let nextNote = runtime.lastNote;

        if (nextMeasured !== null) {
          if (runtime.reworked) {
            nextMeasured = newSpec.calibratedMeasured;
          }
          const within =
            nextMeasured >= newSpec.minAllowed &&
            nextMeasured <= newSpec.maxAllowed;
          nextStatus = within
            ? runtime.reworked
              ? 'reworked'
              : 'pass'
            : 'fail';
          if (!within) {
            this.signedOff = false;
            this.certificateCode = null;
            nextNote = `KO NON-CONFORMANCE: ${nextMeasured.toFixed(2)} ${newSpec.unit} outside [${newSpec.minAllowed.toFixed(2)}–${newSpec.maxAllowed.toFixed(2)} ${newSpec.unit}].`;
          } else {
            nextNote = `VALIDATED OK: ${nextMeasured.toFixed(2)} ${newSpec.unit} within [${newSpec.minAllowed.toFixed(2)}–${newSpec.maxAllowed.toFixed(2)} ${newSpec.unit}].`;
          }
        }

        this.checkpoints.set(newSpec.id, {
          spec: newSpec,
          status: nextStatus,
          measuredValue: nextMeasured,
          inspectedCount: runtime.inspectedCount,
          reworked: runtime.reworked,
          lastNote: nextNote,
        });
      }
    }
  }

  reset(): ActionFeedback {
    const scenario = this.getScenario();
    const steps = scenario.steps;
    const cpSpecs = scenario.checkpoints;

    this.currentStepId = 1;
    this.installedSteps.clear();
    this.selectedCheckpointId = cpSpecs[0]?.id ?? 'CP-01';
    this.activeTool = cpSpecs[0]?.tool ?? 'laser_gap';
    this.explodedFactor = 0;
    this.cutawayEnabled = false;
    this.testRpmPercent = 18;
    this.signedOff = false;
    this.certificateCode = null;
    this.correlationLocked = true;
    this.showCorrelationGuide = true;
    this.checkpoints.clear();

    for (const spec of cpSpecs) {
      this.checkpoints.set(spec.id, {
        spec,
        status: 'pending',
        measuredValue: null,
        inspectedCount: 0,
        reworked: false,
        lastNote: 'Awaiting holographic part seating and NDT validation.',
      });
    }

    const firstStep = steps[0];
    this.lastFeedback = {
      ok: true,
      kind: 'info',
      message: `${scenario.shortTitle} ready (${scenario.workOrderId}). Mount ${firstStep.code} ${firstStep.partNumber} (${firstStep.shortName}).`,
    };
    return this.lastFeedback;
  }

  getSessionNonce(): number {
    return this.sessionNonce;
  }

  bumpSessionNonce(): void {
    this.sessionNonce += 1;
  }

  isCorrelationGuideVisible(): boolean {
    return this.showCorrelationGuide;
  }

  toggleCorrelationGuide(force?: boolean): boolean {
    this.showCorrelationGuide = force ?? !this.showCorrelationGuide;
    this.correlationLocked = true;
    this.recordFeedback(
      true,
      'info',
      this.showCorrelationGuide
        ? 'Real/Virtual correlation wireframe active (+/- 0.4 mm datum lock).'
        : 'Real/Virtual correlation frame hidden; datum lock maintained.',
    );
    return this.showCorrelationGuide;
  }

  isCorrelationLocked(): boolean {
    return this.correlationLocked;
  }

  getDocViewMode(): DocViewMode {
    return this.docViewMode;
  }

  toggleDocViewMode(force?: DocViewMode): DocViewMode {
    this.docViewMode =
      force ?? (this.docViewMode === 'ok_ko' ? 'blueprint' : 'ok_ko');
    return this.docViewMode;
  }

  getCurrentStep(): AssemblyStepSpec {
    const steps = this.getSteps();
    return steps.find((s) => s.id === this.currentStepId) ?? steps[0];
  }

  getStep(stepId: number): AssemblyStepSpec | undefined {
    return this.getSteps().find((s) => s.id === stepId);
  }

  isStepInstalled(stepId: number): boolean {
    return this.installedSteps.has(stepId);
  }

  getCompletedStepCodes(): string[] {
    const steps = this.getSteps();
    const out: string[] = [];
    for (const s of steps) {
      if (this.installedSteps.has(s.id)) {
        out.push(s.canonicalCode);
      }
    }
    return out;
  }

  getNextUninstalledStepId(): number | null {
    for (const step of this.getSteps()) {
      if (!this.installedSteps.has(step.id)) {
        return step.id;
      }
    }
    return null;
  }

  selectStep(stepId: number): AssemblyStepSpec {
    const steps = this.getSteps();
    const clamped = Math.max(1, Math.min(steps.length, Math.round(stepId)));
    this.currentStepId = clamped;
    const step = this.getCurrentStep();
    this.selectedCheckpointId = step.checkpointId;
    const cp = this.checkpoints.get(step.checkpointId);
    if (cp) {
      this.activeTool = cp.spec.tool;
    }
    return step;
  }

  nextStep(): AssemblyStepSpec {
    const len = this.getSteps().length;
    const nextId = this.currentStepId >= len ? 1 : this.currentStepId + 1;
    return this.selectStep(nextId);
  }

  prevStep(): AssemblyStepSpec {
    const len = this.getSteps().length;
    const prevId = this.currentStepId <= 1 ? len : this.currentStepId - 1;
    return this.selectStep(prevId);
  }

  installStep(stepId = this.currentStepId): ActionFeedback {
    const step = this.getStep(stepId);
    if (!step) {
      return this.recordFeedback(false, 'blocked', 'Invalid assembly stage.');
    }

    if (this.installedSteps.has(step.id)) {
      return this.recordFeedback(
        true,
        'info',
        `${step.code} (${step.partNumber}) is already seated at datum. Proceed to QC validation or next stage.`,
      );
    }

    for (let prereq = 1; prereq < step.id; prereq++) {
      if (!this.installedSteps.has(prereq)) {
        const prereqSpec = this.getStep(prereq)!;
        this.selectStep(prereq);
        return this.recordFeedback(
          false,
          'blocked',
          `Sequence lock: Mount ${prereqSpec.code} (${prereqSpec.partNumber}) before ${step.code}.`,
        );
      }
    }

    this.installedSteps.add(step.id);
    this.selectedCheckpointId = step.checkpointId;
    const cp = this.checkpoints.get(step.checkpointId);
    if (cp) {
      this.activeTool = cp.spec.tool;
      cp.lastNote = `Mounted ${step.partNumber}. Ready for ${QC_TOOL_META[cp.spec.tool].shortLabel} OK/KO validation.`;
    }

    const nextPending = this.getNextUninstalledStepId();
    if (nextPending !== null) {
      this.currentStepId = nextPending;
    } else {
      this.currentStepId = step.id;
    }

    return this.recordFeedback(
      true,
      'install',
      `${step.code} ${step.partNumber} (${step.shortName}) seated. Validate ${step.checkpointId} or continue mounting.`,
    );
  }

  getActiveTool(): QCToolType {
    return this.activeTool;
  }

  setActiveTool(tool: QCToolType): void {
    this.activeTool = tool;
  }

  cycleActiveTool(): QCToolType {
    const order: QCToolType[] = ['laser_gap', 'torque', 'ultrasonic_ndt'];
    const idx = order.indexOf(this.activeTool);
    this.activeTool = order[(idx + 1) % order.length];
    return this.activeTool;
  }

  getSelectedCheckpoint(): CheckpointRuntimeState {
    return (
      this.checkpoints.get(this.selectedCheckpointId) ??
      this.checkpoints.get('CP-01')!
    );
  }

  getAllCheckpoints(): CheckpointRuntimeState[] {
    return this.getCheckpointSpecs().map((s) => this.checkpoints.get(s.id)!);
  }

  selectCheckpoint(cpId: string): CheckpointRuntimeState {
    if (this.checkpoints.has(cpId)) {
      this.selectedCheckpointId = cpId;
      const cp = this.checkpoints.get(cpId)!;
      this.activeTool = cp.spec.tool;
    }
    return this.getSelectedCheckpoint();
  }

  cycleCheckpoint(delta: 1 | -1): CheckpointRuntimeState {
    const ids = this.getCheckpointSpecs().map((c) => c.id);
    const idx = ids.indexOf(this.selectedCheckpointId);
    const nextIdx = (idx + delta + ids.length) % ids.length;
    return this.selectCheckpoint(ids[nextIdx]);
  }

  inspectCheckpoint(cpId = this.selectedCheckpointId): ActionFeedback {
    const cp = this.checkpoints.get(cpId);
    if (!cp) {
      return this.recordFeedback(false, 'blocked', 'Unknown QC checkpoint.');
    }

    this.selectedCheckpointId = cp.spec.id;

    if (!this.installedSteps.has(cp.spec.stepId)) {
      const step = this.getStep(cp.spec.stepId)!;
      return this.recordFeedback(
        false,
        'blocked',
        `Cannot validate ${cp.spec.id}: mount ${step.code} (${step.partNumber}) first.`,
      );
    }

    this.activeTool = cp.spec.tool;

    const measured = cp.reworked
      ? cp.spec.calibratedMeasured
      : cp.spec.initialMeasured;
    cp.measuredValue = measured;
    cp.inspectedCount += 1;

    const withinSpec =
      measured >= cp.spec.minAllowed && measured <= cp.spec.maxAllowed;

    if (withinSpec) {
      cp.status = cp.reworked ? 'reworked' : 'pass';
      cp.lastNote = `VALIDATED OK: ${measured.toFixed(2)} ${cp.spec.unit} within [${cp.spec.minAllowed.toFixed(2)}–${cp.spec.maxAllowed.toFixed(2)} ${cp.spec.unit}].`;
      return this.recordFeedback(
        true,
        'inspect_pass',
        `${cp.spec.id} VALIDATED OK (${measured.toFixed(2)} ${cp.spec.unit}).`,
      );
    } else {
      cp.status = 'fail';
      this.signedOff = false;
      this.certificateCode = null;
      cp.lastNote = `KO NON-CONFORMANCE: ${measured.toFixed(2)} ${cp.spec.unit} outside [${cp.spec.minAllowed.toFixed(2)}–${cp.spec.maxAllowed.toFixed(2)} ${cp.spec.unit}]. Rework: ${cp.spec.reworkAction}.`;
      return this.recordFeedback(
        true,
        'inspect_fail',
        `KO DEFECT at ${cp.spec.id}: ${measured.toFixed(2)} ${cp.spec.unit} out of tolerance! Run Calibrate / Rework.`,
      );
    }
  }

  inspectAllInstalled(): ActionFeedback {
    if (this.installedSteps.size === 0) {
      return this.recordFeedback(
        false,
        'blocked',
        'No parts mounted yet. Mount Stage 01 first.',
      );
    }

    let passCount = 0;
    let failCount = 0;
    let firstFailId: string | null = null;

    for (const cp of this.getAllCheckpoints()) {
      if (this.installedSteps.has(cp.spec.stepId)) {
        const res = this.inspectCheckpoint(cp.spec.id);
        if (res.kind === 'inspect_fail') {
          failCount++;
          firstFailId ??= cp.spec.id;
        } else if (res.kind === 'inspect_pass') {
          passCount++;
        }
      }
    }

    if (firstFailId) {
      this.selectCheckpoint(firstFailId);
      return this.recordFeedback(
        true,
        'inspect_fail',
        `Batch QC scan: ${passCount} OK, ${failCount} KO non-conformance(s) flagged (${firstFailId} selected).`,
      );
    }

    return this.recordFeedback(
      true,
      'inspect_pass',
      `Batch QC scan: All ${passCount} mounted step(s) validated OK within tolerance.`,
    );
  }

  reworkCheckpoint(cpId = this.selectedCheckpointId): ActionFeedback {
    const cp = this.checkpoints.get(cpId);
    if (!cp) {
      return this.recordFeedback(false, 'blocked', 'Unknown QC checkpoint.');
    }

    if (!this.installedSteps.has(cp.spec.stepId)) {
      return this.recordFeedback(
        false,
        'blocked',
        `Mount Stage 0${cp.spec.stepId} before reworking ${cp.spec.id}.`,
      );
    }

    if (cp.status !== 'fail') {
      return this.recordFeedback(
        false,
        'info',
        `${cp.spec.id} has no active KO defect requiring rework.`,
      );
    }

    this.selectedCheckpointId = cp.spec.id;
    this.activeTool = cp.spec.tool;
    cp.reworked = true;
    cp.measuredValue = cp.spec.calibratedMeasured;
    cp.status = 'reworked';
    cp.inspectedCount += 1;
    cp.lastNote = `REWORK VALIDATED OK: ${cp.spec.reworkAction} -> ${cp.measuredValue.toFixed(2)} ${cp.spec.unit}.`;

    const nextFailed = this.getAllCheckpoints().find((item) => item.status === 'fail');
    if (nextFailed) {
      this.selectedCheckpointId = nextFailed.spec.id;
      this.activeTool = nextFailed.spec.tool;
    }

    return this.recordFeedback(
      true,
      'rework',
      `${cp.spec.id} calibrated (${cp.spec.calibratedMeasured.toFixed(2)} ${cp.spec.unit}) and validated OK.`,
    );
  }

  signOffAirworthiness(): ActionFeedback {
    const summary = this.computeSummary();
    if (!summary.canSignOff) {
      if (summary.installedCount < summary.totalSteps) {
        return this.recordFeedback(
          false,
          'blocked',
          `Release locked: ${summary.installedCount}/${summary.totalSteps} stages mounted.`,
        );
      }
      return this.recordFeedback(
        false,
        'blocked',
        `Release locked: ${summary.compliantCount}/${summary.totalSteps} QC checkpoints validated OK.`,
      );
    }

    this.signedOff = true;
    this.certificateCode = this.getScenario().releaseCertificateCode;
    this.testRpmPercent = Math.max(this.testRpmPercent, 65);
    return this.recordFeedback(
      true,
      'signoff',
      `Airworthiness Release Issued (${this.certificateCode}) & logged to Production Traceability.`,
    );
  }

  getExplodedFactor(): number {
    return this.explodedFactor;
  }

  setExplodedFactor(value: number): void {
    this.explodedFactor = Math.max(
      0,
      Math.min(1, Number.isFinite(value) ? value : 0),
    );
  }

  isCutawayEnabled(): boolean {
    return this.cutawayEnabled;
  }

  setCutawayEnabled(enabled: boolean): void {
    this.cutawayEnabled = Boolean(enabled);
  }

  toggleCutaway(): boolean {
    this.cutawayEnabled = !this.cutawayEnabled;
    return this.cutawayEnabled;
  }

  getTestRpmPercent(): number {
    return this.testRpmPercent;
  }

  setTestRpmPercent(percent: number): void {
    this.testRpmPercent = Math.max(
      0,
      Math.min(100, Number.isFinite(percent) ? percent : 0),
    );
  }

  getLastFeedback(): ActionFeedback {
    return this.lastFeedback;
  }

  computeSummary(): AssemblySummary {
    const totalSteps = this.getSteps().length;
    const installedCount = this.installedSteps.size;
    let inspectedCount = 0;
    let compliantCount = 0;
    let activeDefectCount = 0;
    let reworkedCount = 0;
    let firstPassCount = 0;

    for (const cp of this.checkpoints.values()) {
      if (cp.status !== 'pending') {
        inspectedCount++;
      }
      if (cp.status === 'pass') {
        compliantCount++;
        firstPassCount++;
      } else if (cp.status === 'reworked') {
        compliantCount++;
        reworkedCount++;
      } else if (cp.status === 'fail') {
        activeDefectCount++;
      }
    }

    const completionPercent = Math.round((installedCount / totalSteps) * 100);
    const compliancePercent = Math.round((compliantCount / totalSteps) * 100);
    const firstPassYieldPercent =
      inspectedCount === 0
        ? 100
        : Math.round((firstPassCount / inspectedCount) * 100);

    const canSignOff =
      installedCount === totalSteps &&
      compliantCount === totalSteps &&
      activeDefectCount === 0;

    return {
      totalSteps,
      installedCount,
      inspectedCount,
      compliantCount,
      activeDefectCount,
      reworkedCount,
      completionPercent,
      compliancePercent,
      firstPassYieldPercent,
      canSignOff,
      signedOff: this.signedOff && canSignOff,
      certificateCode:
        this.signedOff && canSignOff ? this.certificateCode : null,
    };
  }

  computePartTransformTargets(): PartTransformTarget[] {
    return this.getSteps().map((step) => {
      const installed = this.installedSteps.has(step.id);
      const isActiveStep = step.id === this.currentStepId;

      if (installed) {
        const z = step.installedZ + step.explodedZDelta * this.explodedFactor;
        const nacelleSpread =
          step.id === 6
            ? (this.cutawayEnabled ? 0.16 : 0) + this.explodedFactor * 0.15
            : 0;
        return {
          stepId: step.id,
          installed: true,
          visibleAsSolid: true,
          visibleAsGhost: false,
          targetPosition: [0, 0, z],
          nacelleHalfSpreadX: nacelleSpread,
        };
      }

      return {
        stepId: step.id,
        installed: false,
        visibleAsSolid: isActiveStep,
        visibleAsGhost: isActiveStep,
        targetPosition: [
          step.stagingOffset[0],
          step.stagingOffset[1],
          step.installedZ + step.stagingOffset[2],
        ],
        nacelleHalfSpreadX: step.id === 6 ? 0.18 : 0,
      };
    });
  }

  private recordFeedback(
    ok: boolean,
    kind: ActionFeedback['kind'],
    message: string,
  ): ActionFeedback {
    this.lastFeedback = {ok, kind, message};
    return this.lastFeedback;
  }
}
