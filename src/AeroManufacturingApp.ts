import * as THREE from 'three';
import * as xb from 'xrblocks';

import {AeroAssemblyEngine} from './assembly/assemblyEngine';
import {
  HelicopterOfflineCvCalibrator,
  type CalibrationOcclusionPreset,
  type HelicopterVariantId,
} from './calibration/helicopterOfflineCv';
import {
  observeAuthSession,
  signInWithGoogleAccount,
  signOutOperator,
  subscribeOperatorTraceabilityRuns,
  syncTraceabilityRunToCloud,
  testFirestoreConnection,
  type OperatorProfile,
} from './firebase/firebaseClient';
import type {ScenarioId} from './firebase/payloadValidation';
import {FuselagePanelRig} from './scene/FuselagePanelRig';
import {HelicopterCalibrationRig} from './scene/HelicopterCalibrationRig';
import {AeroMaterialLibrary, applyStudioEnvironment} from './scene/materials';
import {TurbofanAssemblyRig} from './scene/TurbofanAssemblyRig';
import {WorkflowStepService} from './services/workflowStepService';
import {OperatorAuthPortal} from './ui/OperatorAuthPortal';
import {SpatialWorkbenchUI} from './ui/SpatialWorkbenchUI';
import {isSoftwareGl} from './utils/gpuDetect';
import {AeroSoundSynth} from './utils/soundSynth';

const _cameraWorldPos = new THREE.Vector3();

function resolveInitialScenario(): ScenarioId {
  if (typeof window === 'undefined') return 'panel_buildup';
  const param = new URLSearchParams(window.location.search).get('scenario');
  return param === 'turbofan_core' ? 'turbofan_core' : 'panel_buildup';
}

function resolveInitialHelicopterView(): boolean {
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'workcell') return false;
  if (view === 'helicopter') return true;
  if (params.has('scenario')) return false;
  return true;
}

function resolveInitialHelicopterVariant(): HelicopterVariantId {
  if (typeof window === 'undefined') return 'h145m';
  const heli = new URLSearchParams(window.location.search).get('heli');
  if (heli === 'h160' || heli === 'as350') return heli;
  return 'h145m';
}

function isAutostartRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

/**
 * Primary XR Blocks Script orchestrating the OmniStep-modeled Aeronautics AR Assembly,
 * XREAL Aura Markerless (Zero-QR) <= 2.00 mm Offline Computer Vision Helicopter Calibration,
 * Firebase Assembly Workflow Step Service (Step Descriptions, Torque Settings & 3D Entity Highlighting),
 * Poka-Yoke OK/KO Validation, 3D Spatial Correlation, Google Account Auth, and Cloud Traceability.
 */
export class AeroManufacturingApp extends xb.Script {
  readonly engine: AeroAssemblyEngine;
  readonly workflowService: WorkflowStepService;
  readonly calibrator: HelicopterOfflineCvCalibrator;
  private materials?: AeroMaterialLibrary;
  private helicopterRig?: HelicopterCalibrationRig;
  private panelRig?: FuselagePanelRig;
  private turbofanRig?: TurbofanAssemblyRig;
  private ui?: SpatialWorkbenchUI;
  private portal?: OperatorAuthPortal;
  private readonly sound = new AeroSoundSynth();
  private envTexture: THREE.Texture | null = null;
  private srLiveRegion: HTMLElement | null = null;
  private cameraSampleCanvas: HTMLCanvasElement | null = null;

  private helicopterModeActive: boolean;
  private currentOperator: OperatorProfile | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private unsubscribeRuns: (() => void) | null = null;
  private unsubscribeWorkflowSteps: (() => void) | null = null;
  private renderedFrames = 0;
  private uiValidated = false;

  constructor() {
    super();
    this.engine = new AeroAssemblyEngine(resolveInitialScenario());
    this.workflowService = new WorkflowStepService();
    this.calibrator = new HelicopterOfflineCvCalibrator(
      resolveInitialHelicopterVariant(),
    );
    this.helicopterModeActive = resolveInitialHelicopterView();
  }

  override init(): void {
    // Verify Firestore connectivity on boot per Firebase integration specification
    void testFirestoreConnection();

    // Configure renderer color pipeline & software-WebGL performance budget
    const rawRenderer = xb.core.renderer as unknown as
      | THREE.WebGLRenderer
      | undefined;
    let maxAnisotropy = 4;

    if (rawRenderer && 'outputColorSpace' in rawRenderer) {
      rawRenderer.outputColorSpace = THREE.SRGBColorSpace;
      rawRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      rawRenderer.toneMappingExposure = 1.12;
      rawRenderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      );
      rawRenderer.shadowMap.enabled = !isSoftwareGl;
      rawRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      maxAnisotropy = rawRenderer.capabilities.getMaxAnisotropy() || 4;
      this.envTexture = applyStudioEnvironment(rawRenderer, xb.core.scene);
    }

    // Balanced 3-point warm/cool aerospace bay lighting
    const hemiFill = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.95);
    this.add(hemiFill);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.8);
    keyLight.position.set(2.2, 3.8, 1.6);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 9;
      keyLight.shadow.camera.left = -1.2;
      keyLight.shadow.camera.right = 1.2;
      keyLight.shadow.camera.top = 1.2;
      keyLight.shadow.camera.bottom = -1.2;
    }
    this.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.4);
    rimLight.position.set(-1.9, 2.3, -2.7);
    this.add(rimLight);

    // Build shared PBR aerospace material library + 3D Helicopter & Manufacturing Workcells
    this.materials = new AeroMaterialLibrary(maxAnisotropy);

    this.helicopterRig = new HelicopterCalibrationRig(this.materials, () =>
      this.executeAuraOfflineCalibration(),
    );
    this.add(this.helicopterRig);

    this.panelRig = new FuselagePanelRig(
      this.materials,
      (stepId) => this.handle3DStageInteraction(stepId),
      (cpId) => this.handle3DBeaconInteraction(cpId),
    );
    this.panelRig.scale.setScalar(1.06);
    this.add(this.panelRig);

    this.turbofanRig = new TurbofanAssemblyRig(
      this.materials,
      (stepId) => this.handle3DStageInteraction(stepId),
      (cpId) => this.handle3DBeaconInteraction(cpId),
    );
    this.turbofanRig.scale.setScalar(1.08);
    this.add(this.turbofanRig);

    // Build OmniStep Spatial Slates & Top Command Ribbon
    this.ui = new SpatialWorkbenchUI({
      onSelectStep: (stepId) => {
        this.workflowService.clearSpotlight();
        this.engine.selectStep(stepId);
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onPrevStep: () => {
        this.workflowService.clearSpotlight();
        this.engine.prevStep();
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onNextStep: () => {
        this.workflowService.clearSpotlight();
        this.engine.nextStep();
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onInstallStep: () => {
        this.helicopterModeActive = false;
        this.workflowService.clearSpotlight();
        const current = this.engine.getCurrentStep();
        const targetId = this.engine.isStepInstalled(current.id)
          ? (this.engine.getNextUninstalledStepId() ?? current.id)
          : current.id;
        const res = this.engine.installStep(targetId);
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
      },
      onToggleDocMode: () => {
        this.engine.toggleDocViewMode();
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onToggleEntityHighlight: () => {
        this.workflowService.toggleArHighlight();
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onExplodedChange: (value) => {
        this.helicopterModeActive = false;
        this.engine.setExplodedFactor(value);
        this.syncUIAndDOM();
      },
      onToggleCutaway: () => {
        this.helicopterModeActive = false;
        this.engine.toggleCutaway();
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onRotateEngine: (deltaRad) => {
        if (this.helicopterModeActive) {
          this.helicopterRig?.rotateTurntable(deltaRad);
        } else {
          this.getActiveRig()?.rotateTurntable(deltaRad);
        }
        this.sound.playForFeedback('info');
      },
      onSelectTool: (tool) => {
        this.engine.setActiveTool(tool);
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onPrevCheckpoint: () => {
        this.engine.cycleCheckpoint(-1);
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onNextCheckpoint: () => {
        this.engine.cycleCheckpoint(1);
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onInspectCheckpoint: () => {
        this.helicopterModeActive = false;
        const res = this.engine.inspectCheckpoint();
        this.getActiveRig()?.triggerScanPulse();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
      },
      onInspectAll: () => {
        this.helicopterModeActive = false;
        const res = this.engine.inspectAllInstalled();
        this.getActiveRig()?.triggerScanPulse();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
      },
      onReworkCheckpoint: () => {
        this.helicopterModeActive = false;
        const res = this.engine.reworkCheckpoint();
        this.getActiveRig()?.triggerScanPulse();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
      },
      onSignOff: () => {
        const res = this.engine.signOffAirworthiness();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
      },
      onToggleCorrelation: () => {
        this.engine.toggleCorrelationGuide();
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onToggleHelicopterView: () => {
        this.helicopterModeActive = !this.helicopterModeActive;
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
      },
      onRunAuraCalibration: () => {
        this.executeAuraOfflineCalibration();
      },
      onInjectAuraDrift: () => {
        this.injectAuraUncalibratedDrift();
      },
      onSwitchScenario: () => {
        this.helicopterModeActive = false;
        const next: ScenarioId =
          this.engine.getScenarioId() === 'panel_buildup'
            ? 'turbofan_core'
            : 'panel_buildup';
        this.switchScenario(next);
      },
      onResetWorkbench: () => {
        this.workflowService.clearSpotlight();
        this.engine.bumpSessionNonce();
        const res = this.engine.reset();
        this.helicopterRig?.resetTurntable();
        this.panelRig?.resetTurntable();
        this.turbofanRig?.resetTurntable();
        this.calibrator.setOcclusionPreset('clear_line_of_sight');
        this.helicopterRig?.triggerCvScanPulse();
        this.ui?.resetCardPoses();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
      },
      onUnrollChange: () => {
        this.syncUIAndDOM();
      },
    });

    this.add(this.ui.assemblyCard, this.ui.qcCard, this.ui.bottomOverlay);

    // Mount 2D Google Account Login Portal, Workflow Step Manager & Traceability Drawer
    this.portal = new OperatorAuthPortal(
      this.engine.getScenarioId(),
      isAutostartRequested(),
      {
        onGoogleSignIn: async () => {
          await signInWithGoogleAccount();
          this.autoEnterDesktopSimulatorIfNonXR();
        },
        onSignOut: async () => {
          await signOutOperator();
        },
        onEnterEvaluationMode: (selectedScenario) => {
          if (selectedScenario !== this.engine.getScenarioId()) {
            this.engine.setScenario(selectedScenario);
            this.rebindWorkflowSubscription();
          }
          this.autoEnterDesktopSimulatorIfNonXR();
          this.syncUIAndDOM();
        },
        onSelectScenario: (scenario) => {
          this.switchScenario(scenario);
        },
        onForceCloudSync: async () => {
          await this.persistTraceabilityToCloud();
        },
        onSelectWorkflowStep: (stepNumber) => {
          this.workflowService.clearSpotlight();
          this.engine.selectStep(stepNumber);
          this.sound.playForFeedback('info');
          this.syncUIAndDOM();
        },
        onSaveWorkflowStep: async (scenarioId, stepNumber, patch) => {
          await this.workflowService.updateWorkflowStep(
            scenarioId,
            stepNumber,
            patch,
          );
          this.engine.selectStep(stepNumber);
          this.sound.playForFeedback('install');
          this.syncUIAndDOM();
        },
        onResetWorkflowSteps: async (scenarioId) => {
          await this.workflowService.resetScenarioSteps(scenarioId);
          this.sound.playForFeedback('info');
          this.syncUIAndDOM();
        },
        onToggleArHighlight: () => {
          this.workflowService.toggleArHighlight();
          this.sound.playForFeedback('info');
          this.syncUIAndDOM();
        },
        onSpotlightEntity: (entityId) => {
          this.helicopterModeActive = false;
          this.workflowService.toggleSpotlightEntity(
            this.engine.getScenarioId(),
            entityId,
          );
          this.sound.playForFeedback('info');
          this.syncUIAndDOM();
        },
        onClearSpotlight: () => {
          this.workflowService.clearSpotlight();
          this.sound.playForFeedback('info');
          this.syncUIAndDOM();
        },
        onRunAuraCalibration: () => {
          this.executeAuraOfflineCalibration();
        },
        onInjectAuraDrift: () => {
          this.injectAuraUncalibratedDrift();
        },
        onSelectHelicopterVariant: (variant: HelicopterVariantId) => {
          this.helicopterModeActive = true;
          this.tryIngestLivePassThroughFrame();
          const rep = this.calibrator.setVariant(variant);
          this.helicopterRig?.triggerCvScanPulse();
          this.sound.playForFeedback(
            rep.passes2mmGate ? 'inspect_pass' : 'inspect_fail',
          );
          this.syncUIAndDOM();
        },
        onSelectAuraStandoff: (meters: number) => {
          this.helicopterModeActive = true;
          this.tryIngestLivePassThroughFrame();
          const rep = this.calibrator.setStandoffMeters(meters);
          this.helicopterRig?.triggerCvScanPulse();
          this.sound.playForFeedback(
            rep.passes2mmGate ? 'inspect_pass' : 'inspect_fail',
          );
          this.syncUIAndDOM();
        },
        onSelectAuraOcclusion: (preset: CalibrationOcclusionPreset) => {
          this.helicopterModeActive = true;
          this.tryIngestLivePassThroughFrame();
          const rep = this.calibrator.setOcclusionPreset(preset);
          this.helicopterRig?.triggerCvScanPulse();
          this.sound.playForFeedback(
            rep.passes2mmGate ? 'inspect_pass' : 'inspect_fail',
          );
          this.syncUIAndDOM();
        },
        onFocusHelicopterStage: (active: boolean) => {
          this.helicopterModeActive = active;
          this.sound.playForFeedback('info');
          this.syncUIAndDOM();
        },
      },
    );

    // Bind initial workflow step subscription before auth resolves
    this.rebindWorkflowSubscription();

    // Subscribe to Firebase Google Auth state & owner-scoped Firestore collections
    this.unsubscribeAuth = observeAuthSession((profile) => {
      this.unsubscribeRuns?.();
      this.unsubscribeRuns = null;
      this.currentOperator = profile;
      this.portal?.setOperatorProfile(profile);

      // Re-subscribe workflow steps under authenticated operator UID (or local mode)
      this.rebindWorkflowSubscription();

      if (profile && profile.emailVerified) {
        this.autoEnterDesktopSimulatorIfNonXR();
        this.unsubscribeRuns = subscribeOperatorTraceabilityRuns(
          profile.uid,
          (records) => {
            this.portal?.setCloudRecords(records);
            this.syncUIAndDOM();
          },
          (errMsg) => {
            if (
              errMsg.toLowerCase().includes('quota') ||
              errMsg.includes('resource-exhausted')
            ) {
              this.portal?.setSyncStatus('Quota exceeded.');
            } else {
              this.portal?.setSyncStatus('Cloud Read Restricted');
            }
            this.syncUIAndDOM();
          },
        );

        if (this.engine.computeSummary().installedCount > 0) {
          void this.persistTraceabilityToCloud();
        }
      }
      this.syncUIAndDOM();
    });

    this.mountAccessibleLiveRegion();
    this.syncUIAndDOM();
  }

  private rebindWorkflowSubscription(): void {
    this.unsubscribeWorkflowSteps?.();
    const scenarioId = this.engine.getScenarioId();
    this.unsubscribeWorkflowSteps = this.workflowService.subscribeWorkflowSteps(
      scenarioId,
      (steps) => {
        this.engine.applyWorkflowSteps(scenarioId, steps);
        this.syncUIAndDOM();
      },
      (errMsg) => {
        if (
          errMsg.toLowerCase().includes('quota') ||
          errMsg.includes('resource-exhausted')
        ) {
          this.portal?.setSyncStatus('Workflow Quota Exceeded');
        }
      },
    );
  }

  /**
   * On non-WebXR desktop browsers, clicking Sign In or Continue in Evaluation Mode
   * activates XR Blocks' built-in simulator button so operators enter the 3D workcell directly
   * while preserving the native Enter XR button on WebXR headsets.
   */
  private autoEnterDesktopSimulatorIfNonXR(): void {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') {
      return;
    }
    if ('xr' in navigator && navigator.xr) {
      return;
    }
    const xrBtn = document.querySelector<HTMLButtonElement>(
      '#XRButtonWrapper .XRButton',
    );
    if (xrBtn && xrBtn.offsetParent !== null) {
      xrBtn.click();
    }
  }

  private getActiveRig(): FuselagePanelRig | TurbofanAssemblyRig | undefined {
    return this.engine.getScenarioId() === 'panel_buildup'
      ? this.panelRig
      : this.turbofanRig;
  }

  /**
   * Non-intrusive offline camera frame sampler: if XREAL Aura / Android XR pass-through
   * video is actively streaming in `xb.core.deviceCamera`, extracts RGBA luma locally
   * without network calls or QR decoding; otherwise falls back seamlessly to deterministic
   * stereo airframe rasterization.
   */
  private tryIngestLivePassThroughFrame(): void {
    if (typeof document === 'undefined') return;
    const cam = (
      xb.core as unknown as {
        deviceCamera?: {
          state?: string;
          videoElement?: HTMLVideoElement;
        };
      }
    ).deviceCamera;
    const video = cam?.videoElement;
    if (
      cam?.state !== 'streaming' ||
      !video ||
      video.videoWidth < 16 ||
      video.videoHeight < 16
    ) {
      return;
    }

    if (!this.cameraSampleCanvas) {
      this.cameraSampleCanvas = document.createElement('canvas');
      this.cameraSampleCanvas.width = 320;
      this.cameraSampleCanvas.height = 180;
    }
    const ctx = this.cameraSampleCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 320, 180);
    const rgba = ctx.getImageData(0, 0, 320, 180).data;
    this.calibrator.ingestExternalCameraRgba(rgba, 320, 180);
  }

  private executeAuraOfflineCalibration(): void {
    this.helicopterModeActive = true;
    this.tryIngestLivePassThroughFrame();
    const rep = this.calibrator.runOfflineCalibration();
    this.helicopterRig?.triggerCvScanPulse();
    this.sound.playForFeedback(
      rep.passes2mmGate ? 'inspect_pass' : 'inspect_fail',
    );
    this.syncUIAndDOM();
  }

  private injectAuraUncalibratedDrift(): void {
    this.helicopterModeActive = true;
    this.calibrator.injectUncalibratedDrift();
    this.sound.playForFeedback('info');
    this.syncUIAndDOM();
  }

  private switchScenario(next: ScenarioId): void {
    if (next === this.engine.getScenarioId()) return;
    this.workflowService.clearSpotlight();
    this.engine.setScenario(next);
    this.rebindWorkflowSubscription();
    this.panelRig?.resetTurntable();
    this.turbofanRig?.resetTurntable();
    this.portal?.setSelectedScenario(next);
    this.sound.playForFeedback('info');
    this.syncUIAndDOM();
  }

  private async persistTraceabilityToCloud(): Promise<void> {
    if (!this.currentOperator || !this.currentOperator.emailVerified) {
      return;
    }

    const summary = this.engine.computeSummary();
    const scenario = this.engine.getScenario();
    const cleanUid = this.currentOperator.uid
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 14);
    const runId = `run_${cleanUid}_${scenario.id}_s${this.engine.getSessionNonce()}`;

    this.portal?.setSyncStatus('Syncing…');
    this.syncUIAndDOM();

    try {
      await syncTraceabilityRunToCloud({
        runId,
        operatorUid: this.currentOperator.uid,
        operatorName: this.currentOperator.displayName,
        scenarioId: scenario.id,
        workOrderId: scenario.workOrderId,
        installedCount: summary.installedCount,
        compliantCount: summary.compliantCount,
        activeDefectCount: summary.activeDefectCount,
        reworkedCount: summary.reworkedCount,
        firstPassYieldPercent: summary.firstPassYieldPercent,
        status: summary.signedOff ? 'certified' : 'in_progress',
        certificateCode: summary.certificateCode ?? '',
        completedSteps: this.engine.getCompletedStepCodes(),
      });
      this.portal?.setSyncStatus(
        summary.signedOff ? 'Certified in Cloud' : 'Cloud Synced',
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.toLowerCase().includes('quota') ||
        msg.includes('resource-exhausted')
      ) {
        this.portal?.setSyncStatus('Quota exceeded.');
      } else {
        this.portal?.setSyncStatus('Cloud Sync Deferred');
      }
    }
    this.syncUIAndDOM();
  }

  private handle3DStageInteraction(stepId: number): void {
    this.workflowService.clearSpotlight();
    if (!this.engine.isStepInstalled(stepId)) {
      const res = this.engine.installStep(stepId);
      this.sound.playForFeedback(res.kind);
      this.syncUIAndDOM();
      if (res.ok) void this.persistTraceabilityToCloud();
    } else {
      this.engine.selectStep(stepId);
      this.sound.playForFeedback('info');
      this.syncUIAndDOM();
    }
  }

  private handle3DBeaconInteraction(cpId: string): void {
    this.engine.selectCheckpoint(cpId);
    const res = this.engine.inspectCheckpoint(cpId);
    this.getActiveRig()?.triggerScanPulse();
    this.sound.playForFeedback(res.kind);
    this.syncUIAndDOM();
    if (res.ok) void this.persistTraceabilityToCloud();
  }

  /**
   * Non-conflicting shop-floor keyboard shortcuts (ignores focused form inputs
   * and avoids WASD/QE simulator camera keys).
   */
  override onKeyDown(event: xb.KeyEvent): void {
    if (this.portal?.isGateOpen()) return;
    if (typeof document !== 'undefined' && document.activeElement) {
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }
    }

    switch (event.code) {
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6': {
        const stageNum = Number(event.code.replace('Digit', ''));
        this.workflowService.clearSpotlight();
        this.engine.selectStep(stageNum);
        this.syncUIAndDOM();
        break;
      }
      case 'KeyI':
      case 'Enter': {
        this.workflowService.clearSpotlight();
        const current = this.engine.getCurrentStep();
        const targetId = this.engine.isStepInstalled(current.id)
          ? (this.engine.getNextUninstalledStepId() ?? current.id)
          : current.id;
        const res = this.engine.installStep(targetId);
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
        break;
      }
      case 'BracketLeft':
        this.workflowService.clearSpotlight();
        this.engine.prevStep();
        this.syncUIAndDOM();
        break;
      case 'BracketRight':
        this.workflowService.clearSpotlight();
        this.engine.nextStep();
        this.syncUIAndDOM();
        break;
      case 'KeyK': {
        const res = this.engine.inspectCheckpoint();
        this.getActiveRig()?.triggerScanPulse();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
        break;
      }
      case 'KeyM': {
        const res = this.engine.inspectAllInstalled();
        this.getActiveRig()?.triggerScanPulse();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
        break;
      }
      case 'KeyR': {
        const res = this.engine.reworkCheckpoint();
        this.getActiveRig()?.triggerScanPulse();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
        break;
      }
      case 'KeyF': {
        const res = this.engine.signOffAirworthiness();
        this.sound.playForFeedback(res.kind);
        this.syncUIAndDOM();
        if (res.ok) void this.persistTraceabilityToCloud();
        break;
      }
      case 'KeyV':
        this.engine.toggleCutaway();
        this.syncUIAndDOM();
        break;
      case 'KeyG':
        this.workflowService.toggleArHighlight();
        this.syncUIAndDOM();
        break;
      case 'KeyX':
        this.engine.setExplodedFactor(
          this.engine.getExplodedFactor() > 0.1 ? 0 : 0.75,
        );
        this.syncUIAndDOM();
        break;
      case 'KeyH':
        this.ui?.toggleCardsVisibility();
        this.syncUIAndDOM();
        break;
      case 'KeyC':
        this.engine.toggleCorrelationGuide();
        this.syncUIAndDOM();
        break;
      case 'KeyB':
        this.engine.toggleDocViewMode();
        this.syncUIAndDOM();
        break;
      case 'KeyL':
        this.executeAuraOfflineCalibration();
        break;
      case 'KeyU':
        this.injectAuraUncalibratedDrift();
        break;
      case 'KeyO':
        this.helicopterModeActive = !this.helicopterModeActive;
        this.sound.playForFeedback('info');
        this.syncUIAndDOM();
        break;
      case 'KeyP': {
        this.helicopterModeActive = false;
        const next: ScenarioId =
          this.engine.getScenarioId() === 'panel_buildup'
            ? 'turbofan_core'
            : 'panel_buildup';
        this.switchScenario(next);
        break;
      }
      default:
        break;
    }
  }

  override update(): void {
    const dt = Math.min(xb.getDeltaTime() || 0.016, 0.1);
    const elapsed = xb.core.elapsedTime;
    xb.core.camera.getWorldPosition(_cameraWorldPos);

    const scenarioId = this.engine.getScenarioId();
    const isPanel = scenarioId === 'panel_buildup';

    if (this.helicopterRig) {
      this.helicopterRig.visible = this.helicopterModeActive;
      if (this.helicopterModeActive) {
        this.helicopterRig.syncAndAnimate(
          dt,
          elapsed,
          this.calibrator.getReport(),
          _cameraWorldPos,
        );
      }
    }

    if (this.panelRig) {
      this.panelRig.visible = !this.helicopterModeActive && isPanel;
    }
    if (this.turbofanRig) {
      this.turbofanRig.visible = !this.helicopterModeActive && !isPanel;
    }

    const highlightState = this.workflowService.resolveArHighlightState(
      scenarioId,
      this.engine.getCurrentStep().id,
    );

    if (!this.helicopterModeActive && isPanel && this.panelRig) {
      this.panelRig.syncAndAnimate(
        dt,
        elapsed,
        this.engine.computePartTransformTargets(),
        this.engine.getAllCheckpoints(),
        this.engine.getSelectedCheckpoint().spec.id,
        this.engine.getActiveTool(),
        this.engine.getExplodedFactor(),
        this.engine.isCorrelationGuideVisible(),
        highlightState,
        _cameraWorldPos,
      );
    } else if (!this.helicopterModeActive && !isPanel && this.turbofanRig) {
      this.turbofanRig.syncAndAnimate(
        dt,
        elapsed,
        this.engine.computePartTransformTargets(),
        this.engine.getAllCheckpoints(),
        this.engine.getSelectedCheckpoint().spec.id,
        this.engine.getActiveTool(),
        this.engine.getTestRpmPercent(),
        this.engine.getExplodedFactor(),
        this.engine.isCorrelationGuideVisible(),
        highlightState,
        _cameraWorldPos,
      );
    }

    this.renderedFrames++;
    if (!this.uiValidated && this.renderedFrames >= 16) {
      const report = xb.ui.validate();
      const stillInitializing = report.issues.some(
        (iss) => iss.code === 'invalid-layout',
      );
      if (report.ready && (!stillInitializing || this.renderedFrames >= 45)) {
        this.uiValidated = true;
        if (typeof document !== 'undefined') {
          document.body.dataset.uiValid = String(report.ok);
        }
        if (!report.ok) {
          console.warn(
            'Spatial UI validation issues:',
            JSON.stringify(report.issues.slice(0, 5)),
          );
        }
      }
    }
  }

  private mountAccessibleLiveRegion(): void {
    if (typeof document === 'undefined') return;
    let region = document.getElementById('aeroforge-sr-telemetry');
    if (!region) {
      region = document.createElement('section');
      region.id = 'aeroforge-sr-telemetry';
      region.className = 'sr-only';
      region.setAttribute('aria-label', 'OmniStep Spatial Workbench Telemetry');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    this.srLiveRegion = region;
  }

  private syncUIAndDOM(): void {
    const scenario = this.engine.getScenario();
    const step = this.engine.getCurrentStep();
    const summary = this.engine.computeSummary();
    const calReport = this.calibrator.getReport();
    const isPanel = scenario.id === 'panel_buildup';

    if (this.helicopterRig) {
      this.helicopterRig.visible = this.helicopterModeActive;
    }
    if (this.panelRig) {
      this.panelRig.visible = !this.helicopterModeActive && isPanel;
    }
    if (this.turbofanRig) {
      this.turbofanRig.visible = !this.helicopterModeActive && !isPanel;
    }

    const highlightState = this.workflowService.resolveArHighlightState(
      scenario.id,
      step.id,
    );

    this.portal?.updateLiveSnapshot({
      scenarioId: scenario.id,
      workOrderId: scenario.workOrderId,
      scenarioTitle: scenario.title,
      activeStepNumber: step.id,
      summary,
      steps: this.engine.getSteps(),
      workflowRecords: this.workflowService.getSteps(scenario.id),
      highlightState,
      completedStepCodes: this.engine.getCompletedStepCodes(),
      checkpoints: this.engine.getAllCheckpoints(),
      calibrationReport: calReport,
      helicopterViewActive: this.helicopterModeActive,
    });

    this.ui?.renderFromEngine(
      this.engine,
      this.portal?.getTraceabilityFooterSummary(),
      highlightState,
      calReport,
      this.helicopterModeActive,
    );

    if (typeof document === 'undefined') return;
    const cp = this.engine.getSelectedCheckpoint();
    const feedback = this.engine.getLastFeedback();

    const ds = document.body.dataset;
    ds.authMode = this.portal?.getAuthModeAttribute() ?? 'login_gate';
    ds.scenario = scenario.id;
    ds.activeStage3d = this.helicopterModeActive
      ? 'helicopter_cv'
      : scenario.id;
    ds.opticalHardware = 'xreal_aura';
    ds.calibrationMode = 'offline_cv_markerless';
    ds.qrScanningUsed = String(calReport.qrCodeScanningUsed);
    ds.helicopterVariant = calReport.variantId;
    ds.calibrationState = calReport.status;
    ds.calibrationRmsMm = calReport.rmsErrorMm.toFixed(2);
    ds.calibrationPass2mm = String(calReport.passes2mmGate);
    ds.calibrationKeypoints = `${calReport.inlierCount}/${calReport.totalLandmarks}`;
    ds.workOrder = scenario.workOrderId;
    ds.state = summary.signedOff ? 'airworthy_certified' : 'workbench_active';
    ds.step = String(step.id);
    ds.requiredTorqueNm = step.requiredTorqueNm.toFixed(2);
    ds.arHighlight = String(highlightState.enabled);
    ds.highlightedEntities = highlightState.entityIds.join(',');
    ds.installed = `${summary.installedCount}/${summary.totalSteps}`;
    ds.compliant = `${summary.compliantCount}/${summary.totalSteps}`;
    ds.defects = String(summary.activeDefectCount);
    ds.checkpoint = cp.spec.id;
    ds.cpStatus = cp.status;
    ds.tool = this.engine.getActiveTool();
    ds.exploded = String(Math.round(this.engine.getExplodedFactor() * 100));
    ds.cutaway = String(this.engine.isCutawayEnabled());
    ds.correlated = String(this.engine.isCorrelationGuideVisible());
    ds.docMode = this.engine.getDocViewMode();
    ds.uiUnrolled = String(this.ui?.isUnrolled() ?? true);
    ds.signedOff = String(summary.signedOff);

    if (this.srLiveRegion) {
      this.srLiveRegion.textContent =
        `XREAL Aura Offline CV (${calReport.variantName}, Zero QR): ${calReport.rmsErrorMm.toFixed(2)} mm RMS (${calReport.passes2mmGate ? 'PASS <= 2.00 mm' : calReport.status.toUpperCase()}). ` +
        `OmniStep AR Workbench (${scenario.workOrderId} — ${step.code}: ${step.name}, ${step.partNumber}, Required Torque ${step.requiredTorqueNm.toFixed(1)} N·m, AR Entities: ${highlightState.entityIds.join(', ') || 'None'}). ` +
        `Mounted ${summary.installedCount} of ${summary.totalSteps}. ` +
        `Validated OK ${summary.compliantCount} of ${summary.totalSteps}, Active KO Defects ${summary.activeDefectCount}. ` +
        `Checkpoint ${cp.spec.label}: ${cp.status.toUpperCase()}. ` +
        `Status: ${feedback.message}`;
    }
  }

  override dispose(): void {
    this.unsubscribeWorkflowSteps?.();
    this.unsubscribeRuns?.();
    this.unsubscribeAuth?.();
    this.portal?.dispose();
    this.ui?.dispose();
    this.helicopterRig?.dispose();
    this.panelRig?.dispose();
    this.turbofanRig?.dispose();
    this.materials?.dispose();
    this.envTexture?.dispose();
    this.sound.dispose();
    this.srLiveRegion?.remove();
  }
}
