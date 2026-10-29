import {
  MODEL_ENTITY_CATALOG,
  SCENARIO_CATALOG,
  type AssemblyStepSpec,
} from '../assembly/assemblyData';
import type {
  AssemblySummary,
  CheckpointRuntimeState,
} from '../assembly/assemblyEngine';
import {
  HELICOPTER_PROFILES,
  XREAL_AURA_OPTICS,
  type CalibrationOcclusionPreset,
  type HelicopterCalibrationReport,
  type HelicopterVariantId,
} from '../calibration/helicopterOfflineCv';
import type {
  OperatorProfile,
  TraceabilityRunRecord,
} from '../firebase/firebaseClient';
import type {
  ScenarioId,
  WorkflowStepPatchInput,
} from '../firebase/payloadValidation';
import type {
  ArEntityHighlightState,
  WorkflowStepRecord,
} from '../services/workflowStepService';

export interface OperatorPortalCallbacks {
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onEnterEvaluationMode: (selectedScenario: ScenarioId) => void;
  onSelectScenario: (scenario: ScenarioId) => void;
  onForceCloudSync: () => Promise<void>;
  onSelectWorkflowStep: (stepNumber: number) => void;
  onSaveWorkflowStep: (
    scenarioId: ScenarioId,
    stepNumber: number,
    patch: WorkflowStepPatchInput,
  ) => Promise<void>;
  onResetWorkflowSteps: (scenarioId: ScenarioId) => Promise<void>;
  onToggleArHighlight: () => void;
  onSpotlightEntity: (entityId: string) => void;
  onClearSpotlight: () => void;
  onRunAuraCalibration: () => void;
  onInjectAuraDrift: () => void;
  onSelectHelicopterVariant: (variant: HelicopterVariantId) => void;
  onSelectAuraStandoff: (meters: number) => void;
  onSelectAuraOcclusion: (preset: CalibrationOcclusionPreset) => void;
  onFocusHelicopterStage: (active: boolean) => void;
}

export interface LiveSessionSnapshot {
  readonly scenarioId: ScenarioId;
  readonly workOrderId: string;
  readonly scenarioTitle: string;
  readonly activeStepNumber: number;
  readonly summary: AssemblySummary;
  readonly steps: readonly AssemblyStepSpec[];
  readonly workflowRecords: readonly WorkflowStepRecord[];
  readonly highlightState: ArEntityHighlightState;
  readonly completedStepCodes: readonly string[];
  readonly checkpoints: readonly CheckpointRuntimeState[];
  readonly calibrationReport: HelicopterCalibrationReport;
  readonly helicopterViewActive: boolean;
}

type DrawerTab = 'calibration' | 'workflow' | 'traceability';

const HIGHLIGHT_COLOR_OPTIONS: ReadonlyArray<{
  readonly hex: string;
  readonly label: string;
}> = [
  {hex: '#38bdf8', label: 'Sky Cyan (#38bdf8)'},
  {hex: '#60a5fa', label: 'Cobalt Blue (#60a5fa)'},
  {hex: '#fbbf24', label: 'Aerospace Amber (#fbbf24)'},
  {hex: '#34d399', label: 'Compliant Emerald (#34d399)'},
  {hex: '#a78bfa', label: 'Sensor Violet (#a78bfa)'},
  {hex: '#f87171', label: 'Alert Coral (#f87171)'},
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GOOGLE_G_SVG = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

/**
 * Accessible 2D DOM Google Account Login Portal, Bottom-Left Operator Bar,
 * Firebase Workflow Step Manager (Step Descriptions, Torque Settings & 3D Entity Highlighting),
 * and Production Traceability Audit Drawer modeled on Theoris OmniStep.
 */
export class OperatorAuthPortal {
  private readonly callbacks: OperatorPortalCallbacks;
  private readonly root: HTMLElement;
  private readonly gateOverlay: HTMLElement;
  private readonly errorAlert: HTMLElement;
  private readonly googleGateBtn: HTMLButtonElement;
  private readonly evalGateBtn: HTMLButtonElement;
  private readonly dockBar: HTMLElement;
  private readonly drawer: HTMLElement;
  private readonly drawerTitleEl: HTMLElement;
  private readonly tabCalibrationBtn: HTMLButtonElement;
  private readonly tabWorkflowBtn: HTMLButtonElement;
  private readonly tabTraceBtn: HTMLButtonElement;
  private readonly drawerContent: HTMLElement;
  private pyramidScratchCanvas: HTMLCanvasElement | null = null;

  private profile: OperatorProfile | null = null;
  private evaluationDismissedGate = false;
  private gateExplicitlyOpened = false;
  private selectedScenario: ScenarioId;
  private cloudRecords: TraceabilityRunRecord[] = [];
  private liveSnapshot: LiveSessionSnapshot | null = null;
  private syncStatusMessage = 'Ready';
  private isSigningIn = false;
  private drawerOpen = false;
  private activeTab: DrawerTab = 'calibration';
  private editingStepNumber = 1;
  private workflowFormAlert = '';
  private workflowFormSavedMsg = '';
  private isSavingStep = false;

  constructor(
    initialScenario: ScenarioId,
    autostartEvaluation: boolean,
    callbacks: OperatorPortalCallbacks,
  ) {
    this.selectedScenario = initialScenario;
    this.evaluationDismissedGate = autostartEvaluation;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'omnistep-portal-root';

    // 1. Google Account Login Gate Modal
    this.gateOverlay = document.createElement('section');
    this.gateOverlay.id = 'omnistep-login-gate';
    this.gateOverlay.className = 'os-gate-backdrop';
    this.gateOverlay.setAttribute('role', 'dialog');
    this.gateOverlay.setAttribute('aria-modal', 'true');
    this.gateOverlay.setAttribute('aria-labelledby', 'omnistep-login-title');

    this.gateOverlay.innerHTML = `
      <div class="os-gate-card">
        <header class="os-gate-header">
          <div class="os-brand-kicker">OMNISTEP MIXED REALITY · AERONAUTICS MANUFACTURING</div>
          <h1 id="omnistep-login-title" class="os-gate-title">AeroForge AR Assembly &amp; QC</h1>
          <p class="os-gate-subtitle">
            Step-by-step 3D holographic mounting guidance, Real/Virtual spatial correlation, Poka-Yoke OK/KO error-proofing, and cloud-synced Form 8130-3 production traceability.
          </p>
        </header>

        <fieldset class="os-scenario-fieldset">
          <legend class="os-fieldset-legend">SELECT MANUFACTURING WORK ORDER</legend>
          <div class="os-scenario-grid">
            <label class="os-scenario-option" id="os-opt-panel">
              <input type="radio" name="omnistep-scenario" value="panel_buildup" ${
                initialScenario === 'panel_buildup' ? 'checked' : ''
              } />
              <span class="os-scenario-code">${escapeHtml(SCENARIO_CATALOG.panel_buildup.workOrderId)} · 6 STEPS</span>
              <span class="os-scenario-name">Fuselage Panel Build-Up (Habillage Panneau)</span>
              <span class="os-scenario-meta">ABS2277VV40B 40mm Pins · G537700011 Blanket · OK/KO Poka-Yoke</span>
            </label>

            <label class="os-scenario-option" id="os-opt-turbofan">
              <input type="radio" name="omnistep-scenario" value="turbofan_core" ${
                initialScenario === 'turbofan_core' ? 'checked' : ''
              } />
              <span class="os-scenario-code">${escapeHtml(SCENARIO_CATALOG.turbofan_core.workOrderId)} · 6 STEPS</span>
              <span class="os-scenario-name">CFM-X90 High-Bypass Turbofan Core</span>
              <span class="os-scenario-meta">Ti-6Al-4V Spool · Wide-Chord Fan · Ultrasonic Phased-Array NDT</span>
            </label>
          </div>
        </fieldset>

        <div id="omnistep-auth-error" class="os-auth-error" role="alert" hidden></div>

        <div class="os-gate-actions">
          <button type="button" id="omnistep-google-signin" class="os-btn os-btn-google">
            ${GOOGLE_G_SVG}
            <span>Sign in with Google</span>
          </button>
          <button type="button" id="omnistep-eval-continue" class="os-btn os-btn-secondary">
            Continue in Evaluation Mode
          </button>
        </div>

        <footer class="os-gate-footer">
          <span>Google Account login links operator badge &amp; syncs workflow steps + traceability to Cloud Firestore</span>
          <span>·</span>
          <span>XREAL Aura (&lt;=2mm Markerless Helicopter CV) / Android XR / Simulator</span>
        </footer>
      </div>
    `;

    this.errorAlert = this.gateOverlay.querySelector('#omnistep-auth-error')!;
    this.googleGateBtn = this.gateOverlay.querySelector(
      '#omnistep-google-signin',
    )!;
    this.evalGateBtn = this.gateOverlay.querySelector(
      '#omnistep-eval-continue',
    )!;

    const radios = this.gateOverlay.querySelectorAll<HTMLInputElement>(
      'input[name="omnistep-scenario"]',
    );
    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.selectedScenario =
            radio.value === 'turbofan_core' ? 'turbofan_core' : 'panel_buildup';
          this.syncScenarioRadioStyles();
          this.callbacks.onSelectScenario(this.selectedScenario);
        }
      });
    });

    this.googleGateBtn.addEventListener('click', () => {
      void this.triggerGoogleSignIn();
    });

    this.evalGateBtn.addEventListener('click', () => {
      this.clearError();
      this.evaluationDismissedGate = true;
      this.gateExplicitlyOpened = false;
      this.callbacks.onEnterEvaluationMode(this.selectedScenario);
      this.render();
    });

    // 2. Compact Bottom-Left Operator & Workflow Controls Dock
    this.dockBar = document.createElement('nav');
    this.dockBar.id = 'omnistep-operator-dock';
    this.dockBar.className = 'os-operator-dock';
    this.dockBar.setAttribute(
      'aria-label',
      'Operator Account, Workflow Steps, and Traceability Controls',
    );

    // 3. Slide-Over Workflow Steps & Production Traceability Drawer
    this.drawer = document.createElement('aside');
    this.drawer.id = 'omnistep-traceability-drawer';
    this.drawer.className = 'os-drawer';
    this.drawer.setAttribute(
      'aria-label',
      'Assembly Workflow Steps and Production Traceability Drawer',
    );
    this.drawer.hidden = true;
    this.drawer.innerHTML = `
      <div class="os-drawer-header">
        <div>
          <div class="os-brand-kicker">AS9100 REV D · XREAL AURA CV &amp; FIREBASE</div>
          <h2 id="os-drawer-heading" class="os-drawer-title">XREAL Aura &lt;=2.00 mm Helicopter CV</h2>
        </div>
        <button type="button" id="os-drawer-close" class="os-btn os-btn-compact" aria-label="Close operator drawer">
          Close
        </button>
      </div>
      <div class="os-drawer-tabs" role="tablist" aria-label="Operator Drawer Views">
        <button type="button" role="tab" id="os-tab-calibration" class="os-tab-btn" aria-selected="true" aria-controls="os-drawer-body">
          Aura CV (&lt;=2mm)
        </button>
        <button type="button" role="tab" id="os-tab-workflow" class="os-tab-btn" aria-selected="false" aria-controls="os-drawer-body">
          Workflow (6)
        </button>
        <button type="button" role="tab" id="os-tab-traceability" class="os-tab-btn" aria-selected="false" aria-controls="os-drawer-body">
          Audit Log
        </button>
      </div>
      <div id="os-drawer-body" class="os-drawer-body" role="tabpanel"></div>
    `;

    this.drawerTitleEl = this.drawer.querySelector('#os-drawer-heading')!;
    this.tabCalibrationBtn = this.drawer.querySelector('#os-tab-calibration')!;
    this.tabWorkflowBtn = this.drawer.querySelector('#os-tab-workflow')!;
    this.tabTraceBtn = this.drawer.querySelector('#os-tab-traceability')!;
    this.drawerContent = this.drawer.querySelector('#os-drawer-body')!;

    this.tabCalibrationBtn.addEventListener('click', () => {
      this.activeTab = 'calibration';
      this.render(true);
    });
    this.tabWorkflowBtn.addEventListener('click', () => {
      this.activeTab = 'workflow';
      this.workflowFormAlert = '';
      this.workflowFormSavedMsg = '';
      this.render(true);
    });
    this.tabTraceBtn.addEventListener('click', () => {
      this.activeTab = 'traceability';
      this.render(true);
    });
    this.drawer
      .querySelector('#os-drawer-close')!
      .addEventListener('click', () => {
        this.drawerOpen = false;
        this.render(true);
      });

    this.root.append(this.gateOverlay, this.dockBar, this.drawer);
    document.body.appendChild(this.root);

    this.syncScenarioRadioStyles();
    this.render(true);
  }

  isGateOpen(): boolean {
    if (this.gateExplicitlyOpened) return true;
    return !this.profile && !this.evaluationDismissedGate;
  }

  getAuthModeAttribute(): 'google' | 'evaluation' | 'login_gate' {
    if (this.isGateOpen()) return 'login_gate';
    return this.profile ? 'google' : 'evaluation';
  }

  setOperatorProfile(profile: OperatorProfile | null): void {
    this.profile = profile;
    if (profile) {
      this.gateExplicitlyOpened = false;
      this.clearError();
      this.syncStatusMessage = profile.emailVerified
        ? 'Cloud Traceability Active'
        : 'Unverified Email (Read/Write Restricted)';
    } else {
      this.cloudRecords = [];
      this.syncStatusMessage = 'Evaluation Session (Local)';
    }
    this.render(true);
  }

  setSelectedScenario(scenarioId: ScenarioId): void {
    this.selectedScenario = scenarioId;
    this.editingStepNumber = 1;
    this.workflowFormAlert = '';
    this.workflowFormSavedMsg = '';
    const radios = this.gateOverlay.querySelectorAll<HTMLInputElement>(
      'input[name="omnistep-scenario"]',
    );
    radios.forEach((r) => {
      r.checked = r.value === scenarioId;
    });
    this.syncScenarioRadioStyles();
    this.render(true);
  }

  setCloudRecords(records: TraceabilityRunRecord[]): void {
    this.cloudRecords = records;
    this.render(false);
  }

  setSyncStatus(message: string): void {
    this.syncStatusMessage = message;
    this.render(false);
  }

  updateLiveSnapshot(snapshot: LiveSessionSnapshot): void {
    const prevScenario = this.liveSnapshot?.scenarioId;
    this.liveSnapshot = snapshot;
    if (prevScenario && prevScenario !== snapshot.scenarioId) {
      this.editingStepNumber = snapshot.activeStepNumber;
      this.workflowFormAlert = '';
      this.workflowFormSavedMsg = '';
    }
    this.renderDockBar();
    if (this.drawerOpen) {
      if (this.activeTab !== 'workflow' || !this.isUserTypingInWorkflowForm()) {
        this.renderDrawerBody();
      }
    }
  }

  getTraceabilityFooterSummary(): string {
    if (this.profile) {
      return `Operator: ${this.profile.displayName} (${this.profile.operatorBadge}) · ${this.syncStatusMessage}`;
    }
    return 'Evaluation Mode · Sign in with Google (bottom-left) for Cloud Sync';
  }

  private isUserTypingInWorkflowForm(): boolean {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (!active || !this.drawerContent.contains(active)) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private async triggerGoogleSignIn(): Promise<void> {
    if (this.isSigningIn) return;
    this.isSigningIn = true;
    this.clearError();
    this.render(false);
    try {
      await this.callbacks.onGoogleSignIn();
      this.gateExplicitlyOpened = false;
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      let friendly =
        'Google Sign-In could not complete. Please allow the sign-in popup or continue in Evaluation Mode.';
      if (raw.includes('popup-closed-by-user')) {
        friendly =
          'Sign-in popup was closed before completing Google authentication.';
      } else if (raw.includes('popup-blocked')) {
        friendly =
          'Browser blocked the Google Sign-In popup. Allow popups for this site and try again.';
      } else if (raw.includes('unauthorized-domain')) {
        friendly =
          'Preview domain is awaiting Firebase OAuth authorization. Use Evaluation Mode or authorized host.';
      }
      this.showError(friendly);
    } finally {
      this.isSigningIn = false;
      this.render(false);
    }
  }

  private showError(msg: string): void {
    this.errorAlert.textContent = msg;
    this.errorAlert.hidden = false;
  }

  private clearError(): void {
    this.errorAlert.textContent = '';
    this.errorAlert.hidden = true;
  }

  private syncScenarioRadioStyles(): void {
    const panelCard = this.gateOverlay.querySelector('#os-opt-panel');
    const turbofanCard = this.gateOverlay.querySelector('#os-opt-turbofan');
    panelCard?.classList.toggle(
      'is-selected',
      this.selectedScenario === 'panel_buildup',
    );
    turbofanCard?.classList.toggle(
      'is-selected',
      this.selectedScenario === 'turbofan_core',
    );
  }

  private openDrawerTab(tab: DrawerTab): void {
    if (this.drawerOpen && this.activeTab === tab) {
      this.drawerOpen = false;
    } else {
      this.drawerOpen = true;
      this.activeTab = tab;
      if (tab === 'workflow' && this.liveSnapshot) {
        this.editingStepNumber = this.liveSnapshot.activeStepNumber;
      }
      this.workflowFormAlert = '';
      this.workflowFormSavedMsg = '';
    }
    this.render(true);
  }

  private render(forceDrawerRebuild = false): void {
    const gateOpen = this.isGateOpen();
    this.gateOverlay.hidden = !gateOpen;
    this.dockBar.hidden = gateOpen;
    this.drawer.hidden = gateOpen || !this.drawerOpen;

    this.googleGateBtn.disabled = this.isSigningIn;
    const span = this.googleGateBtn.querySelector('span');
    if (span) {
      span.textContent = this.isSigningIn
        ? 'Signing in with Google…'
        : this.profile
          ? `Continue as ${this.profile.displayName}`
          : 'Sign in with Google';
    }

    const isCal = this.activeTab === 'calibration';
    const isWorkflow = this.activeTab === 'workflow';
    const isTrace = this.activeTab === 'traceability';

    this.drawerTitleEl.textContent = isCal
      ? 'XREAL Aura <=2.00 mm Helicopter CV'
      : isWorkflow
        ? 'Workflow Steps & AR Highlighting'
        : 'Operator Validation & Audit Log';

    this.tabCalibrationBtn.setAttribute('aria-selected', String(isCal));
    this.tabWorkflowBtn.setAttribute('aria-selected', String(isWorkflow));
    this.tabTraceBtn.setAttribute('aria-selected', String(isTrace));
    this.tabCalibrationBtn.classList.toggle('is-active', isCal);
    this.tabWorkflowBtn.classList.toggle('is-active', isWorkflow);
    this.tabTraceBtn.classList.toggle('is-active', isTrace);

    this.dockBar.classList.toggle('is-drawer-open', this.drawerOpen && !gateOpen);
    this.renderDockBar();
    if (this.drawerOpen && !gateOpen) {
      if (
        forceDrawerRebuild ||
        this.activeTab !== 'workflow' ||
        !this.isUserTypingInWorkflowForm()
      ) {
        this.renderDrawerBody();
      }
    }

    if (typeof document !== 'undefined') {
      document.body.dataset.authMode = this.getAuthModeAttribute();
      document.body.dataset.operatorBadge =
        this.profile?.operatorBadge ?? 'EVAL-LOCAL';
    }
  }

  private renderDockBar(): void {
    const cal = this.liveSnapshot?.calibrationReport;
    const calBtnClass = !cal || cal.passes2mmGate ? 'os-btn-emerald' : 'os-btn-amber';
    const calBtnLabel = cal
      ? cal.passes2mmGate
        ? `Aura CV: ${cal.rmsErrorMm.toFixed(2)}mm OK`
        : cal.status === 'uncalibrated_drift'
          ? `Aura CV: ${cal.rmsErrorMm.toFixed(1)}mm DRIFT`
          : `Aura CV: ${cal.rmsErrorMm.toFixed(1)}mm BLOCKED`
      : 'Aura CV (<=2mm)';

    if (this.profile) {
      const avatarHtml = this.profile.photoUrl
        ? `<img src="${escapeHtml(this.profile.photoUrl)}" alt="" class="os-avatar" referrerpolicy="no-referrer" />`
        : `<span class="os-avatar-fallback" aria-hidden="true">${escapeHtml(this.profile.displayName.charAt(0).toUpperCase())}</span>`;

      this.dockBar.innerHTML = `
        <div class="os-dock-identity">
          ${avatarHtml}
          <span class="os-dock-name">${escapeHtml(this.profile.displayName)}</span>
          <span class="os-sep">·</span>
          <span class="os-dock-mono">${escapeHtml(this.profile.operatorBadge)}</span>
          <span class="os-sep">·</span>
          <span class="os-dock-sync">${escapeHtml(this.syncStatusMessage)}</span>
        </div>
        <div class="os-dock-actions">
          <button type="button" id="os-dock-calibration-btn" class="os-btn os-btn-compact ${calBtnClass}">
            ${escapeHtml(calBtnLabel)}
          </button>
          <button type="button" id="os-dock-workflow-btn" class="os-btn os-btn-compact os-btn-accent">
            Workflow
          </button>
          <button type="button" id="os-dock-trace-btn" class="os-btn os-btn-compact">
            Audit (${this.cloudRecords.length})
          </button>
          <button type="button" id="os-dock-portal-btn" class="os-btn os-btn-compact">
            Work Orders
          </button>
          <button type="button" id="os-dock-signout-btn" class="os-btn os-btn-compact os-btn-muted">
            Sign Out
          </button>
        </div>
      `;

      this.dockBar
        .querySelector('#os-dock-calibration-btn')
        ?.addEventListener('click', () => {
          this.openDrawerTab('calibration');
        });
      this.dockBar
        .querySelector('#os-dock-workflow-btn')
        ?.addEventListener('click', () => {
          this.openDrawerTab('workflow');
        });
      this.dockBar
        .querySelector('#os-dock-trace-btn')
        ?.addEventListener('click', () => {
          this.openDrawerTab('traceability');
        });
      this.dockBar
        .querySelector('#os-dock-portal-btn')
        ?.addEventListener('click', () => {
          this.gateExplicitlyOpened = true;
          this.drawerOpen = false;
          this.render(true);
        });
      this.dockBar
        .querySelector('#os-dock-signout-btn')
        ?.addEventListener('click', () => {
          void this.callbacks.onSignOut();
        });
    } else {
      this.dockBar.innerHTML = `
        <div class="os-dock-identity">
          <span class="os-dock-mono">XREAL AURA · NO-QR</span>
          <span class="os-sep">·</span>
          <span class="os-dock-sync">Eval</span>
        </div>
        <div class="os-dock-actions">
          <button type="button" id="os-dock-google-btn" class="os-btn os-btn-compact os-btn-google-mini">
            ${GOOGLE_G_SVG}
            <span>${this.isSigningIn ? 'Signing in…' : 'Sign in'}</span>
          </button>
          <button type="button" id="os-dock-calibration-btn" class="os-btn os-btn-compact ${calBtnClass}">
            ${escapeHtml(calBtnLabel)}
          </button>
          <button type="button" id="os-dock-workflow-btn" class="os-btn os-btn-compact os-btn-accent">
            Workflow
          </button>
          <button type="button" id="os-dock-trace-btn" class="os-btn os-btn-compact">
            Audit Log
          </button>
          <button type="button" id="os-dock-portal-btn" class="os-btn os-btn-compact">
            Work Orders
          </button>
        </div>
      `;

      this.dockBar
        .querySelector('#os-dock-google-btn')
        ?.addEventListener('click', () => {
          this.gateExplicitlyOpened = true;
          void this.triggerGoogleSignIn();
        });
      this.dockBar
        .querySelector('#os-dock-calibration-btn')
        ?.addEventListener('click', () => {
          this.openDrawerTab('calibration');
        });
      this.dockBar
        .querySelector('#os-dock-workflow-btn')
        ?.addEventListener('click', () => {
          this.openDrawerTab('workflow');
        });
      this.dockBar
        .querySelector('#os-dock-trace-btn')
        ?.addEventListener('click', () => {
          this.openDrawerTab('traceability');
        });
      this.dockBar
        .querySelector('#os-dock-portal-btn')
        ?.addEventListener('click', () => {
          this.gateExplicitlyOpened = true;
          this.drawerOpen = false;
          this.render(true);
        });
    }
  }

  private renderDrawerBody(): void {
    if (this.activeTab === 'calibration') {
      this.renderCalibrationTab();
    } else if (this.activeTab === 'workflow') {
      this.renderWorkflowManagerTab();
    } else {
      this.renderTraceabilityTab();
    }
  }

  private renderCalibrationTab(): void {
    const snap = this.liveSnapshot;
    if (!snap) {
      this.drawerContent.innerHTML = `<p class="os-empty-note">Initializing XREAL Aura offline computer vision calibrator…</p>`;
      return;
    }

    const rep = snap.calibrationReport;
    const statusClass =
      rep.status === 'calibrated_pass'
        ? 'os-status-ok'
        : rep.status === 'uncalibrated_drift'
          ? 'os-status-amber'
          : 'os-status-ko';

    const bannerModifier =
      rep.status === 'calibrated_pass'
        ? ''
        : rep.status === 'uncalibrated_drift'
          ? 'is-drift'
          : 'is-blocked';

    const gateLabel =
      rep.status === 'calibrated_pass'
        ? 'PASS <= 2.00 MM'
        : rep.status === 'uncalibrated_drift'
          ? 'VIO DRIFT (> 2.00 MM)'
          : 'GATE BLOCKED';

    const variantOptionsHtml = (
      ['h145m', 'h160', 'as350'] as readonly HelicopterVariantId[]
    )
      .map((id) => {
        const p = HELICOPTER_PROFILES[id];
        const sel = rep.variantId === id ? 'selected' : '';
        return `<option value="${id}" ${sel}>${escapeHtml(p.name)}</option>`;
      })
      .join('');

    const standoffChoices: ReadonlyArray<{val: number; label: string}> = [
      {val: 1.55, label: '1.55 m · Close Bay'},
      {val: 1.85, label: '1.85 m · Nominal Aura'},
      {val: 2.35, label: '2.35 m · Mid Apron'},
      {val: 3.35, label: '3.35 m · Far Apron'},
    ];
    const standoffOptionsHtml = standoffChoices
      .map((item) => {
        const sel = Math.abs(rep.standoffMeters - item.val) < 0.08 ? 'selected' : '';
        return `<option value="${item.val}" ${sel}>${escapeHtml(item.label)}</option>`;
      })
      .join('');

    const occlusionChoices: ReadonlyArray<{
      val: CalibrationOcclusionPreset;
      label: string;
    }> = [
      {
        val: 'clear_line_of_sight',
        label: 'Clear Sight (10/10 KP)',
      },
      {
        val: 'partial_rotor_shadow',
        label: 'Rotor Shadow (8/10 KP)',
      },
      {
        val: 'severe_glare_occlusion',
        label: 'Canopy Glare (Block)',
      },
    ];
    const occlusionOptionsHtml = occlusionChoices
      .map((item) => {
        const sel = rep.occlusionPreset === item.val ? 'selected' : '';
        return `<option value="${item.val}" ${sel}>${escapeHtml(item.label)}</option>`;
      })
      .join('');

    const landmarkRowsHtml = rep.landmarks
      .map((lm) => {
        const rowClass = !lm.visible
          ? 'os-status-pending'
          : lm.residualMm <= 2.0
            ? 'os-status-ok'
            : rep.status === 'uncalibrated_drift'
              ? 'os-status-amber'
              : 'os-status-ko';
        const dispNccText = lm.visible
          ? `${lm.disparityPx.toFixed(1)}px · ${lm.nccScore.toFixed(2)}`
          : 'OCCLUDED';
        const errText = lm.visible ? `${lm.residualMm.toFixed(2)} mm` : '--';
        return `
          <tr>
            <td class="os-mono">${escapeHtml(lm.id)}</td>
            <td>
              <div class="os-table-part">${escapeHtml(lm.label)}</div>
              <div class="os-table-sub">CAD [${lm.cadPosition[0].toFixed(2)}, ${lm.cadPosition[1].toFixed(2)}, ${lm.cadPosition[2].toFixed(2)}] m</div>
            </td>
            <td class="os-mono">${escapeHtml(dispNccText)}</td>
            <td class="os-mono ${rowClass}">${escapeHtml(errText)}</td>
          </tr>
        `;
      })
      .join('');

    this.drawerContent.innerHTML = `
      <section class="os-drawer-section">
        <div class="os-section-header">
          <h3 class="os-section-title">XREAL Aura Stereo Rig · Markerless (Zero QR)</h3>
          <span class="os-mono ${statusClass}">${escapeHtml(gateLabel)}</span>
        </div>

        <div class="os-kpi-strip">
          <div>
            <div class="os-kpi-label">3D RMS ERROR</div>
            <div class="os-kpi-val ${statusClass}">${rep.rmsErrorMm.toFixed(2)} mm</div>
          </div>
          <div>
            <div class="os-kpi-label">MAX LANDMARK</div>
            <div class="os-kpi-val">${rep.maxLandmarkErrorMm.toFixed(2)} mm</div>
          </div>
          <div>
            <div class="os-kpi-label">INLIER KP</div>
            <div class="os-kpi-val">${rep.inlierCount} / ${rep.totalLandmarks}</div>
          </div>
          <div>
            <div class="os-kpi-label">QR SCANNING</div>
            <div class="os-kpi-val os-status-ok">OFF (0 QR)</div>
          </div>
        </div>

        <div class="os-cal-summary-banner ${bannerModifier}" role="status">
          ${escapeHtml(rep.statusSummary)}
        </div>

        <div class="os-cv-canvas-wrap">
          <canvas
            id="os-aura-cv-canvas"
            class="os-cv-canvas"
            width="452"
            height="168"
            aria-label="Offline XREAL Aura Sobel edge, Shi-Tomasi corner, stereo disparity, and SE(3) PnP convergence feed"
          ></canvas>
          <div class="os-cv-caption">
            <span>SOBEL: ${rep.sobelEdgePixels} PX · CORNERS: ${rep.shiTomasiCorners}</span>
            <span>B=${(XREAL_AURA_OPTICS.stereoBaselineMeters * 1000).toFixed(0)}mm · ${rep.burstFramesFused}-FRM LM (${rep.lmIterations} IT)</span>
          </div>
        </div>

        <div class="os-drawer-cta-row">
          <button type="button" id="os-cal-run-btn" class="os-btn os-btn-accent">
            Run Offline CV Calibration
          </button>
          <button type="button" id="os-cal-drift-btn" class="os-btn os-btn-compact os-btn-amber">
            Inject 35mm Drift
          </button>
          <button type="button" id="os-cal-stage-btn" class="os-btn os-btn-compact os-btn-muted">
            ${snap.helicopterViewActive ? 'View Workcell' : 'Focus 3D Heli'}
          </button>
        </div>
      </section>

      <section class="os-drawer-section">
        <div class="os-section-header">
          <h3 class="os-section-title">Helicopter Airframe &amp; Optical Envelope</h3>
          <span class="os-mono">${XREAL_AURA_OPTICS.displayFovDiagonalDeg}° FOV · OFFLINE</span>
        </div>

        <div class="os-field">
          <label class="os-field-label" for="os-cal-variant">Target Helicopter Airframe in Front of Wearer</label>
          <select id="os-cal-variant" class="os-select">
            ${variantOptionsHtml}
          </select>
        </div>

        <div class="os-cal-grid">
          <div class="os-field">
            <label class="os-field-label" for="os-cal-standoff">Wearer Standoff Distance</label>
            <select id="os-cal-standoff" class="os-select">
              ${standoffOptionsHtml}
            </select>
          </div>
          <div class="os-field">
            <label class="os-field-label" for="os-cal-occlusion">Optical Line-of-Sight</label>
            <select id="os-cal-occlusion" class="os-select">
              ${occlusionOptionsHtml}
            </select>
          </div>
        </div>
      </section>

      <section class="os-drawer-section">
        <div class="os-section-header">
          <h3 class="os-section-title">Natural Airframe Keypoint Residuals (K01–K10)</h3>
          <span class="os-mono">REPROJ ${rep.reprojectionRmsPx.toFixed(2)} PX</span>
        </div>
        <table class="os-trace-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>AIRFRAME FEATURE (NO QR)</th>
              <th>DISP · NCC</th>
              <th>3D ERR</th>
            </tr>
          </thead>
          <tbody>${landmarkRowsHtml}</tbody>
        </table>
      </section>
    `;

    const cvCanvas = this.drawerContent.querySelector<HTMLCanvasElement>(
      '#os-aura-cv-canvas',
    );
    if (cvCanvas) {
      this.drawOfflineCvDiagnosticCanvas(cvCanvas, rep);
    }

    this.drawerContent
      .querySelector('#os-cal-run-btn')
      ?.addEventListener('click', () => {
        this.callbacks.onRunAuraCalibration();
      });

    this.drawerContent
      .querySelector('#os-cal-drift-btn')
      ?.addEventListener('click', () => {
        this.callbacks.onInjectAuraDrift();
      });

    this.drawerContent
      .querySelector('#os-cal-stage-btn')
      ?.addEventListener('click', () => {
        this.callbacks.onFocusHelicopterStage(!snap.helicopterViewActive);
      });

    this.drawerContent
      .querySelector<HTMLSelectElement>('#os-cal-variant')
      ?.addEventListener('change', (ev) => {
        const val = (ev.target as HTMLSelectElement).value;
        if (val === 'h145m' || val === 'h160' || val === 'as350') {
          this.callbacks.onSelectHelicopterVariant(val);
        }
      });

    this.drawerContent
      .querySelector<HTMLSelectElement>('#os-cal-standoff')
      ?.addEventListener('change', (ev) => {
        const meters = Number((ev.target as HTMLSelectElement).value);
        if (Number.isFinite(meters) && meters > 0) {
          this.callbacks.onSelectAuraStandoff(meters);
        }
      });

    this.drawerContent
      .querySelector<HTMLSelectElement>('#os-cal-occlusion')
      ?.addEventListener('change', (ev) => {
        const val = (ev.target as HTMLSelectElement).value;
        if (
          val === 'clear_line_of_sight' ||
          val === 'partial_rotor_shadow' ||
          val === 'severe_glare_occlusion'
        ) {
          this.callbacks.onSelectAuraOcclusion(val);
        }
      });
  }

  private drawOfflineCvDiagnosticCanvas(
    canvas: HTMLCanvasElement,
    rep: HelicopterCalibrationReport,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#030916';
    ctx.fillRect(0, 0, cw, ch);

    // 1. Left Viewport: 320x180 Left Camera Pyramid + Sobel Edge Map + Stereo Disparity Vectors
    const vx = 6;
    const vy = 6;
    const vw = 256;
    const vh = 144;

    if (!this.pyramidScratchCanvas && typeof document !== 'undefined') {
      this.pyramidScratchCanvas = document.createElement('canvas');
      this.pyramidScratchCanvas.width = rep.pyramidWidth;
      this.pyramidScratchCanvas.height = rep.pyramidHeight;
    }

    if (
      this.pyramidScratchCanvas &&
      rep.leftPyramidLuma.length === rep.pyramidWidth * rep.pyramidHeight
    ) {
      if (this.pyramidScratchCanvas.width !== rep.pyramidWidth) {
        this.pyramidScratchCanvas.width = rep.pyramidWidth;
      }
      if (this.pyramidScratchCanvas.height !== rep.pyramidHeight) {
        this.pyramidScratchCanvas.height = rep.pyramidHeight;
      }
      const pCtx = this.pyramidScratchCanvas.getContext('2d');
      if (pCtx) {
        const img = pCtx.createImageData(rep.pyramidWidth, rep.pyramidHeight);
        const dst = img.data;
        const luma = rep.leftPyramidLuma;
        const sobel = rep.sobelEdgeLuma;
        for (let i = 0; i < luma.length; i++) {
          const base = luma[i];
          const edge = sobel[i];
          const o = i * 4;
          dst[o] = Math.min(255, Math.round(base * 0.65 + edge * 0.14));
          dst[o + 1] = Math.min(255, Math.round(base * 0.74 + edge * 0.8));
          dst[o + 2] = Math.min(255, Math.round(base * 0.88 + edge * 0.98));
          dst[o + 3] = 255;
        }
        pCtx.putImageData(img, 0, 0);
        ctx.drawImage(this.pyramidScratchCanvas, vx, vy, vw, vh);
      }
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);

    // Optical center reticle
    const cx = vx + vw * 0.5;
    const cy = vy + vh * 0.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // Overlay natural helicopter airframe landmarks & stereo disparity ticks
    const scaleU = vw / XREAL_AURA_OPTICS.sensorWidthPx;
    const scaleV = vh / XREAL_AURA_OPTICS.sensorHeightPx;
    ctx.font = '600 9px "JetBrains Mono", monospace';

    for (const lm of rep.landmarks) {
      if (!lm.visible || !lm.leftPixel || !lm.rightPixel) continue;
      const lu = vx + lm.leftPixel[0] * scaleU;
      const lv = vy + lm.leftPixel[1] * scaleV;
      const ru = vx + lm.rightPixel[0] * scaleU;

      // Epipolar disparity line
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ru, lv);
      ctx.lineTo(lu, lv);
      ctx.stroke();

      const kpColor =
        rep.status === 'calibrated_pass'
          ? '#34d399'
          : rep.status === 'uncalibrated_drift'
            ? '#fbbf24'
            : lm.residualMm <= 2.0
              ? '#38bdf8'
              : '#f87171';

      ctx.strokeStyle = kpColor;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(lu - 3.5, lv - 3.5, 7, 7);

      ctx.fillStyle = kpColor;
      ctx.fillText(lm.id, lu + 5, lv + 3);
    }

    ctx.fillStyle = 'rgba(4, 12, 28, 0.82)';
    ctx.fillRect(vx + 4, vy + 4, 178, 15);
    ctx.fillStyle = '#93c5fd';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillText('LEFT PYRAMID + SOBEL + STEREO KP', vx + 8, vy + 14);

    // 2. Right Viewport: 4-Stage SE(3) Stereo-PnP Convergence vs 2.00 mm Aerospace Gate
    const gx = 268;
    const gy = 6;
    const gw = 178;
    const gh = 144;

    ctx.fillStyle = '#061229';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillText('SE(3) RMS CONVERGENCE', gx + 8, gy + 14);

    const plotTop = gy + 28;
    const plotBottom = gy + gh - 20;
    const plotH = plotBottom - plotTop;
    const maxMm = 42;
    const mapY = (mm: number): number => {
      const clamped = Math.max(0, Math.min(maxMm, mm));
      const norm = Math.sqrt(clamped / maxMm);
      return plotBottom - norm * plotH;
    };

    // 2.00 mm threshold gate line
    const gateY = mapY(2.0);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(gx + 8, gateY);
    ctx.lineTo(gx + gw - 8, gateY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#34d399';
    ctx.font = '600 8px "JetBrains Mono", monospace';
    ctx.fillText('2.0mm GATE', gx + gw - 58, gateY - 3);

    const shortLabels = ['VIO', 'COARSE', 'STEREO', '8-FRM'];
    const colW = (gw - 24) / 4;

    for (let i = 0; i < 4; i++) {
      const stage = rep.stageHistory[i];
      const bx = gx + 12 + i * colW + 4;
      const bw = colW - 8;

      const isActiveStage = rep.status !== 'uncalibrated_drift' || i === 0;
      const valMm =
        rep.status === 'uncalibrated_drift' && i === 0
          ? rep.rmsErrorMm
          : stage?.rmsErrorMm ?? 0;

      if (isActiveStage && stage) {
        const by = mapY(valMm);
        const bh = Math.max(2, plotBottom - by);
        ctx.fillStyle =
          valMm <= 2.0
            ? '#10b981'
            : i === 0
              ? '#f59e0b'
              : '#38bdf8';
        ctx.fillRect(bx, by, bw, bh);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 8px "JetBrains Mono", monospace';
        ctx.fillText(valMm.toFixed(1), bx - 1, Math.max(gy + 24, by - 3));
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.fillRect(bx, plotBottom - 4, bw, 4);
      }

      ctx.fillStyle = '#93c5fd';
      ctx.font = '600 8px "JetBrains Mono", monospace';
      ctx.fillText(shortLabels[i], bx - 1, gy + gh - 6);
    }

    // Footer status strip inside canvas
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillText(
      `OPTICS: 1920x1080 f=${XREAL_AURA_OPTICS.fxPx}px · QR CODES: 0 · SOLVE ${rep.executionTimeMs.toFixed(1)}ms`,
      6,
      ch - 4,
    );
  }

  private renderWorkflowManagerTab(): void {
    const snap = this.liveSnapshot;
    if (!snap) {
      this.drawerContent.innerHTML = `<p class="os-empty-note">Initializing workflow step service…</p>`;
      return;
    }

    const records = snap.workflowRecords;
    const activeRecord =
      records.find((r) => r.stepNumber === this.editingStepNumber) ??
      records[0];
    if (!activeRecord) return;

    const entityCatalog = MODEL_ENTITY_CATALOG[snap.scenarioId];
    const selectedEntitySet = new Set<string>(activeRecord.modelEntityIds);
    const hi = snap.highlightState;

    const stepSelectorHtml = records
      .map((rec) => {
        const isCurrent = rec.stepNumber === activeRecord.stepNumber;
        const torqueBadge =
          rec.requiredTorqueNm > 0
            ? `${rec.requiredTorqueNm.toFixed(1)} N·m`
            : '0 N·m';
        return `
          <button
            type="button"
            class="os-step-pill ${isCurrent ? 'is-selected' : ''}"
            data-wf-step="${rec.stepNumber}"
            aria-pressed="${isCurrent}"
          >
            <span class="os-mono">S0${rec.stepNumber} · ${escapeHtml(rec.partNumber)}</span>
            <span class="os-step-pill-meta">${escapeHtml(torqueBadge)} · ${rec.modelEntityIds.length} ent</span>
          </button>
        `;
      })
      .join('');

    const entityChecklistHtml = entityCatalog
      .map((item) => {
        const checked = selectedEntitySet.has(item.entityId);
        const isSpotlighted =
          hi.mode === 'spotlight' &&
          hi.enabled &&
          hi.entityIds.includes(item.entityId);
        const checkboxId = `os-ent-${item.entityId}`;
        return `
          <div class="os-entity-row ${checked ? 'is-checked' : ''}">
            <label class="os-entity-label" for="${escapeHtml(checkboxId)}">
              <input
                type="checkbox"
                id="${escapeHtml(checkboxId)}"
                name="modelEntityIds"
                value="${escapeHtml(item.entityId)}"
                ${checked ? 'checked' : ''}
              />
              <span class="os-entity-text">
                <span class="os-mono">${escapeHtml(item.entityId)}</span>
                <span class="os-entity-sub">S0${item.stepId} · ${escapeHtml(item.label)}</span>
              </span>
            </label>
            <button
              type="button"
              class="os-btn os-btn-compact ${isSpotlighted ? 'os-btn-accent' : 'os-btn-muted'}"
              data-spotlight-entity="${escapeHtml(item.entityId)}"
              aria-label="Spotlight ${escapeHtml(item.entityId)} in AR"
            >
              ${isSpotlighted ? 'Active' : 'Spotlight'}
            </button>
          </div>
        `;
      })
      .join('');

    const colorOptionsHtml = HIGHLIGHT_COLOR_OPTIONS.map((opt) => {
      const sel =
        opt.hex.toLowerCase() === activeRecord.highlightColorHex.toLowerCase();
      return `<option value="${escapeHtml(opt.hex)}" ${sel ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`;
    }).join('');

    const syncOriginBadge =
      this.profile && this.profile.emailVerified
        ? 'Cloud Firestore (/workflowSteps)'
        : 'Local Session (Sign in for Firebase Sync)';

    this.drawerContent.innerHTML = `
      <section class="os-drawer-section">
        <div class="os-section-header">
          <h3 class="os-section-title">${escapeHtml(snap.workOrderId)} · Step Configuration</h3>
          <span class="os-mono">${escapeHtml(syncOriginBadge)}</span>
        </div>

        <div class="os-ar-bar">
          <div class="os-ar-bar-info">
            <span class="os-kpi-label">AR ENTITY HIGHLIGHTING (${hi.mode.toUpperCase()})</span>
            <span class="os-mono">${
              hi.enabled && hi.entityIds.length > 0
                ? escapeHtml(hi.entityIds.join(', '))
                : 'DISABLED'
            }</span>
          </div>
          <div class="os-ar-bar-actions">
            ${
              hi.mode === 'spotlight'
                ? `<button type="button" id="os-wf-clear-spotlight" class="os-btn os-btn-compact os-btn-muted">Clear Spotlight</button>`
                : ''
            }
            <button type="button" id="os-wf-toggle-ar" class="os-btn os-btn-compact ${
              hi.enabled ? 'os-btn-accent' : ''
            }">
              ${hi.enabled ? 'AR Highlight: ON' : 'AR Highlight: OFF'}
            </button>
          </div>
        </div>

        <div class="os-step-pill-grid" role="group" aria-label="Select workflow step to configure">
          ${stepSelectorHtml}
        </div>
      </section>

      <form id="os-workflow-step-form" class="os-wf-form" novalidate>
        <div class="os-section-header">
          <h3 class="os-section-title">Edit ${escapeHtml(activeRecord.canonicalCode)} · ${escapeHtml(activeRecord.partNumber)}</h3>
          <span class="os-mono">Source: ${escapeHtml(activeRecord.source.toUpperCase())}</span>
        </div>

        <div id="os-wf-form-alert" class="os-auth-error" role="alert" ${
          this.workflowFormAlert ? '' : 'hidden'
        }>${escapeHtml(this.workflowFormAlert)}</div>

        <div id="os-wf-form-saved" class="os-save-banner" role="status" ${
          this.workflowFormSavedMsg ? '' : 'hidden'
        }>${escapeHtml(this.workflowFormSavedMsg)}</div>

        <div class="os-field">
          <label class="os-field-label" for="os-wf-title">Step Title</label>
          <input
            id="os-wf-title"
            name="title"
            type="text"
            class="os-input"
            maxlength="120"
            value="${escapeHtml(activeRecord.title)}"
            required
          />
        </div>

        <div class="os-field">
          <label class="os-field-label" for="os-wf-desc">Step Description &amp; AR Mounting Guidance</label>
          <textarea
            id="os-wf-desc"
            name="description"
            rows="3"
            class="os-textarea"
            maxlength="500"
            required
          >${escapeHtml(activeRecord.description)}</textarea>
        </div>

        <div class="os-field">
          <label class="os-field-label" for="os-wf-warn">Poka-Yoke Warning Callout</label>
          <input
            id="os-wf-warn"
            name="warningText"
            type="text"
            class="os-input"
            maxlength="280"
            value="${escapeHtml(activeRecord.warningText)}"
          />
        </div>

        <div class="os-torque-grid">
          <div class="os-field">
            <label class="os-field-label" for="os-wf-torque-min">Min Torque (N·m)</label>
            <input
              id="os-wf-torque-min"
              name="torqueMinNm"
              type="number"
              step="0.1"
              min="0"
              max="2000"
              class="os-input os-input-mono"
              value="${activeRecord.torqueMinNm}"
              required
            />
          </div>
          <div class="os-field">
            <label class="os-field-label" for="os-wf-torque-req">Required Torque (N·m)</label>
            <input
              id="os-wf-torque-req"
              name="requiredTorqueNm"
              type="number"
              step="0.1"
              min="0"
              max="2000"
              class="os-input os-input-mono"
              value="${activeRecord.requiredTorqueNm}"
              required
            />
          </div>
          <div class="os-field">
            <label class="os-field-label" for="os-wf-torque-max">Max Torque (N·m)</label>
            <input
              id="os-wf-torque-max"
              name="torqueMaxNm"
              type="number"
              step="0.1"
              min="0"
              max="2000"
              class="os-input os-input-mono"
              value="${activeRecord.torqueMaxNm}"
              required
            />
          </div>
        </div>

        <div class="os-field">
          <label class="os-field-label" for="os-wf-color">AR Entity Highlight Tint</label>
          <select id="os-wf-color" name="highlightColorHex" class="os-select">
            ${colorOptionsHtml}
          </select>
        </div>

        <fieldset class="os-entity-fieldset">
          <legend class="os-field-label">Associated 3D Model Entity IDs (1–6 Required)</legend>
          <div class="os-entity-list">
            ${entityChecklistHtml}
          </div>
        </fieldset>

        <div class="os-drawer-cta-row">
          <button type="submit" id="os-wf-save-btn" class="os-btn os-btn-accent" ${
            this.isSavingStep ? 'disabled' : ''
          }>
            ${this.isSavingStep ? 'Saving…' : 'Save Step to Workflow'}
          </button>
          <button type="button" id="os-wf-reset-btn" class="os-btn os-btn-compact os-btn-muted" ${
            this.isSavingStep ? 'disabled' : ''
          }>
            Reset Factory Specs
          </button>
        </div>
      </form>
    `;

    // Wire step selector pills
    this.drawerContent
      .querySelectorAll<HTMLButtonElement>('[data-wf-step]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const stepNum = Number(btn.dataset.wfStep);
          if (stepNum >= 1 && stepNum <= 6) {
            this.editingStepNumber = stepNum;
            this.workflowFormAlert = '';
            this.workflowFormSavedMsg = '';
            this.callbacks.onSelectWorkflowStep(stepNum);
            this.render(true);
          }
        });
      });

    // Wire AR highlight toggle & clear spotlight
    this.drawerContent
      .querySelector('#os-wf-toggle-ar')
      ?.addEventListener('click', () => {
        this.callbacks.onToggleArHighlight();
        this.render(true);
      });

    this.drawerContent
      .querySelector('#os-wf-clear-spotlight')
      ?.addEventListener('click', () => {
        this.callbacks.onClearSpotlight();
        this.render(true);
      });

    // Wire individual entity spotlight buttons
    this.drawerContent
      .querySelectorAll<HTMLButtonElement>('[data-spotlight-entity]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const entityId = btn.dataset.spotlightEntity;
          if (entityId) {
            this.callbacks.onSpotlightEntity(entityId);
            this.render(true);
          }
        });
      });

    // Wire Save Step form submission
    const form = this.drawerContent.querySelector<HTMLFormElement>(
      '#os-workflow-step-form',
    );
    form?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      void this.handleWorkflowFormSubmit(form, snap.scenarioId, activeRecord.stepNumber);
    });

    // Wire Reset Factory Specs button
    this.drawerContent
      .querySelector('#os-wf-reset-btn')
      ?.addEventListener('click', () => {
        void this.handleWorkflowReset(snap.scenarioId);
      });
  }

  private async handleWorkflowFormSubmit(
    form: HTMLFormElement,
    scenarioId: ScenarioId,
    stepNumber: number,
  ): Promise<void> {
    if (this.isSavingStep) return;

    const titleInput = form.querySelector<HTMLInputElement>('#os-wf-title');
    const descInput = form.querySelector<HTMLTextAreaElement>('#os-wf-desc');
    const warnInput = form.querySelector<HTMLInputElement>('#os-wf-warn');
    const minInput = form.querySelector<HTMLInputElement>('#os-wf-torque-min');
    const reqInput = form.querySelector<HTMLInputElement>('#os-wf-torque-req');
    const maxInput = form.querySelector<HTMLInputElement>('#os-wf-torque-max');
    const colorSelect = form.querySelector<HTMLSelectElement>('#os-wf-color');
    const checkedBoxes = form.querySelectorAll<HTMLInputElement>(
      'input[name="modelEntityIds"]:checked',
    );

    const minRaw = minInput?.value.trim() ?? '';
    const reqRaw = reqInput?.value.trim() ?? '';
    const maxRaw = maxInput?.value.trim() ?? '';

    const torqueMinNm = minRaw === '' ? Number.NaN : Number(minRaw);
    const requiredTorqueNm = reqRaw === '' ? Number.NaN : Number(reqRaw);
    const torqueMaxNm = maxRaw === '' ? Number.NaN : Number(maxRaw);

    const modelEntityIds: string[] = [];
    checkedBoxes.forEach((cb) => modelEntityIds.push(cb.value));

    const patch: WorkflowStepPatchInput = {
      title: titleInput?.value ?? '',
      description: descInput?.value ?? '',
      warningText: warnInput?.value ?? '',
      requiredTorqueNm,
      torqueMinNm,
      torqueMaxNm,
      modelEntityIds,
      highlightColorHex: colorSelect?.value ?? '#38bdf8',
    };

    this.isSavingStep = true;
    this.workflowFormAlert = '';
    this.workflowFormSavedMsg = '';

    try {
      await this.callbacks.onSaveWorkflowStep(scenarioId, stepNumber, patch);
      this.workflowFormSavedMsg = this.profile?.emailVerified
        ? `STEP-0${stepNumber} saved & synced to Cloud Firestore.`
        : `STEP-0${stepNumber} updated in live AR workflow (${patch.requiredTorqueNm.toFixed(1)} N·m · ${modelEntityIds.length} entity target(s)).`;
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      this.workflowFormAlert = raw;
      // Reveal validation error inline without wiping user's current form values!
      const alertBox = form.querySelector<HTMLElement>('#os-wf-form-alert');
      const savedBox = form.querySelector<HTMLElement>('#os-wf-form-saved');
      if (savedBox) savedBox.hidden = true;
      if (alertBox) {
        alertBox.textContent = raw;
        alertBox.hidden = false;
      }
      this.isSavingStep = false;
      return;
    }

    this.isSavingStep = false;
    this.render(true);
  }

  private async handleWorkflowReset(scenarioId: ScenarioId): Promise<void> {
    if (this.isSavingStep) return;
    this.isSavingStep = true;
    this.workflowFormAlert = '';
    this.workflowFormSavedMsg = '';
    try {
      await this.callbacks.onResetWorkflowSteps(scenarioId);
      this.workflowFormSavedMsg = 'All 6 workflow steps restored to factory specifications.';
    } catch (error) {
      this.workflowFormAlert =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.isSavingStep = false;
      this.render(true);
    }
  }

  private renderTraceabilityTab(): void {
    const snap = this.liveSnapshot;
    const currentRowsHtml = snap
      ? snap.steps
          .map((step) => {
            const mounted = snap.completedStepCodes.includes(step.canonicalCode);
            const cp = snap.checkpoints.find((c) => c.spec.stepId === step.id);
            const cpText =
              cp?.status === 'pass' || cp?.status === 'reworked'
                ? `OK (${cp.measuredValue?.toFixed(2)} ${cp.spec.unit})`
                : cp?.status === 'fail'
                  ? `KO (${cp.measuredValue?.toFixed(2)} ${cp.spec.unit})`
                  : 'PENDING';
            const statusClass =
              cp?.status === 'pass' || cp?.status === 'reworked'
                ? 'os-status-ok'
                : cp?.status === 'fail'
                  ? 'os-status-ko'
                  : 'os-status-pending';
            return `
              <tr>
                <td class="os-mono">${escapeHtml(step.canonicalCode)}</td>
                <td>
                  <div class="os-table-part">${escapeHtml(step.partNumber)}</div>
                  <div class="os-table-sub">${escapeHtml(step.shortName)} · ${step.requiredTorqueNm.toFixed(1)} N·m</div>
                </td>
                <td class="os-mono">${mounted ? 'MOUNTED' : 'STAGED'}</td>
                <td class="os-mono ${statusClass}">${escapeHtml(cpText)}</td>
              </tr>
            `;
          })
          .join('')
      : '';

    const cloudHistoryHtml = this.profile
      ? this.cloudRecords.length > 0
        ? this.cloudRecords
            .slice(0, 8)
            .map((rec) => {
              const badgeClass =
                rec.status === 'certified' ? 'os-status-ok' : 'os-status-pending';
              const shortTime = rec.updatedAtIso.slice(0, 19).replace('T', ' ');
              return `
                <div class="os-history-item">
                  <div class="os-history-row">
                    <span class="os-mono">${escapeHtml(rec.workOrderId)}</span>
                    <span class="os-mono ${badgeClass}">${
                      rec.status === 'certified'
                        ? escapeHtml(rec.certificateCode || 'CERTIFIED')
                        : 'IN PROGRESS'
                    }</span>
                  </div>
                  <div class="os-history-meta">
                    Mounted ${rec.installedCount}/6 · Validated OK ${rec.compliantCount}/6 · FPY ${rec.firstPassYieldPercent}% · ${escapeHtml(shortTime)} UTC
                  </div>
                </div>
              `;
            })
            .join('')
        : `<p class="os-empty-note">No cloud traceability runs recorded yet for ${escapeHtml(this.profile.operatorBadge)}. Mount or validate any step to sync automatically.</p>`
      : `<p class="os-empty-note">Sign in with your Google Account to persist immutable FAA Form 8130-3 traceability runs to Cloud Firestore.</p>`;

    this.drawerContent.innerHTML = `
      <section class="os-drawer-section">
        <div class="os-section-header">
          <h3 class="os-section-title">Active Workcell Traceability</h3>
          <span class="os-mono">${escapeHtml(snap?.workOrderId ?? '')}</span>
        </div>
        ${
          snap
            ? `
          <div class="os-kpi-strip">
            <div>
              <div class="os-kpi-label">MOUNTED</div>
              <div class="os-kpi-val">${snap.summary.installedCount} / ${snap.summary.totalSteps}</div>
            </div>
            <div>
              <div class="os-kpi-label">VALIDATED OK</div>
              <div class="os-kpi-val">${snap.summary.compliantCount} / ${snap.summary.totalSteps}</div>
            </div>
            <div>
              <div class="os-kpi-label">FPY</div>
              <div class="os-kpi-val">${snap.summary.firstPassYieldPercent}%</div>
            </div>
            <div>
              <div class="os-kpi-label">RELEASE</div>
              <div class="os-kpi-val ${snap.summary.signedOff ? 'os-status-ok' : ''}">${
                snap.summary.signedOff
                  ? escapeHtml(snap.summary.certificateCode ?? '8130-3')
                  : 'OPEN'
              }</div>
            </div>
          </div>
          <table class="os-trace-table">
            <thead>
              <tr>
                <th>STEP</th>
                <th>PART / TORQUE</th>
                <th>MOUNT</th>
                <th>QC RESULT</th>
              </tr>
            </thead>
            <tbody>${currentRowsHtml}</tbody>
          </table>
        `
            : ''
        }
        <div class="os-drawer-cta-row">
          ${
            this.profile
              ? `<button type="button" id="os-sync-now-btn" class="os-btn os-btn-compact">Sync Snapshot to Cloud</button>`
              : `<button type="button" id="os-drawer-signin-btn" class="os-btn os-btn-google">${GOOGLE_G_SVG}<span>Sign in with Google to Sync Cloud Audit</span></button>`
          }
        </div>
      </section>

      <section class="os-drawer-section">
        <div class="os-section-header">
          <h3 class="os-section-title">Cloud Firestore Audit Runs</h3>
          <span class="os-mono">${escapeHtml(this.syncStatusMessage)}</span>
        </div>
        <div class="os-history-list">${cloudHistoryHtml}</div>
      </section>
    `;

    this.drawerContent
      .querySelector('#os-sync-now-btn')
      ?.addEventListener('click', () => {
        void this.callbacks.onForceCloudSync();
      });
    this.drawerContent
      .querySelector('#os-drawer-signin-btn')
      ?.addEventListener('click', () => {
        this.drawerOpen = false;
        this.gateExplicitlyOpened = true;
        void this.triggerGoogleSignIn();
      });
  }

  dispose(): void {
    this.root.remove();
  }
}
