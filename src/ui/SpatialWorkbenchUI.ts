import * as THREE from 'three';
import * as xb from 'xrblocks';

import {QC_TOOL_META, type QCToolType} from '../assembly/assemblyData';
import type {AeroAssemblyEngine} from '../assembly/assemblyEngine';
import {
  HELICOPTER_PROFILES,
  type HelicopterCalibrationReport,
} from '../calibration/helicopterOfflineCv';
import {DiagramCanvasGenerator} from '../scene/DiagramCanvasGenerator';
import type {ArEntityHighlightState} from '../services/workflowStepService';

export interface WorkbenchUIActions {
  onSelectStep: (stepId: number) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onInstallStep: () => void;
  onToggleDocMode: () => void;
  onToggleEntityHighlight: () => void;
  onExplodedChange: (value: number) => void;
  onToggleCutaway: () => void;
  onRotateEngine: (deltaRad: number) => void;
  onSelectTool: (tool: QCToolType) => void;
  onPrevCheckpoint: () => void;
  onNextCheckpoint: () => void;
  onInspectCheckpoint: () => void;
  onInspectAll: () => void;
  onReworkCheckpoint: () => void;
  onSignOff: () => void;
  onToggleCorrelation: () => void;
  onToggleHelicopterView: () => void;
  onRunAuraCalibration: () => void;
  onInjectAuraDrift: () => void;
  onSwitchScenario: () => void;
  onResetWorkbench: () => void;
  onUnrollChange?: (unrolled: boolean) => void;
}

const COMPACT_BTN_PADDING = {
  paddingTop: 8,
  paddingBottom: 8,
  paddingLeft: 14,
  paddingRight: 14,
} as const;

const RIBBON_BTN_PADDING = {
  paddingTop: 6,
  paddingBottom: 6,
  paddingLeft: 8,
  paddingRight: 8,
} as const;

/**
 * OmniStep-styled Mixed Reality Spatial Slates built with XR Blocks UI:
 * - Left World-Space UICard: Procedure Guidance, Poka-Yoke Warning, Live OK/KO vs 2D Blueprint Schematic, & Mounting Controls
 * - Right World-Space UICard: Native Step Validation ([Result] OK / KO), NDT Metrology, Rework, & Production Traceability Sign-Off
 * - Top View-Space UIOverlay: XREAL Aura Markerless (No-QR) <=2.00mm Helicopter CV Bar, Stage Switcher, & Gesture Controls
 */
export class SpatialWorkbenchUI {
  readonly assemblyCard: xb.UICard;
  readonly qcCard: xb.UICard;
  readonly bottomOverlay: xb.UIOverlay;

  private readonly diagramGenerator = new DiagramCanvasGenerator();

  // Assembly Slate elements
  private readonly workOrderHeaderText: xb.UIText;
  private readonly stepStateText: xb.UIText;
  private readonly stepBadgeText: xb.UIText;
  private readonly partNameText: xb.UIText;
  private readonly partSpecText: xb.UIText;
  private readonly torqueEntityMetaText: xb.UIText;
  private readonly warningBannerText: xb.UIText;
  private readonly diagramImage: xb.UIImage;
  private readonly instructionText: xb.UIText;
  private readonly installButton: xb.UIButton;
  private readonly docModeButton: xb.UIButton;
  private readonly explodedValueText: xb.UIText;
  private readonly explodedSlider: xb.UISlider;
  private readonly cutawayButton: xb.UIButton;
  private readonly entityHighlightButton: xb.UIButton;

  // Validation & Traceability Slate elements
  private readonly toolButtons: Record<QCToolType, xb.UIButton>;
  private readonly cpHeaderText: xb.UIText;
  private readonly cpStatusBadge: xb.UIText;
  private readonly cpLocationText: xb.UIText;
  private readonly cpMeasurementText: xb.UIText;
  private readonly cpToleranceText: xb.UIText;
  private readonly cpNoteText: xb.UIText;
  private readonly scanButton: xb.UIButton;
  private readonly reworkButton: xb.UIButton;
  private readonly scanAllButton: xb.UIButton;
  private readonly signOffButton: xb.UIButton;
  private readonly traceabilityFooterText: xb.UIText;

  // Top Command Ribbon elements
  private readonly hudProgressText: xb.UIText;
  private readonly hudCalibrationText: xb.UIText;
  private readonly hudFeedbackText: xb.UIText;
  private readonly togglePanelsButton: xb.UIButton;
  private readonly correlationButton: xb.UIButton;
  private readonly heliViewButton: xb.UIButton;
  private readonly auraCalibrateButton: xb.UIButton;
  private readonly auraDriftButton: xb.UIButton;
  private readonly scenarioButton: xb.UIButton;

  private cardsVisible = true;
  private readonly onUnrollChange?: (unrolled: boolean) => void;

  constructor(actions: WorkbenchUIActions) {
    this.onUnrollChange = actions.onUnrollChange;

    // Configure OmniStep HoloLens deep cobalt-navy spatial slate theme
    xb.ui.theme = 'glimmerOpaque';
    xb.ui.setTheme({
      colors: {
        surface: 'rgba(11, 27, 61, 0.95)',
        raisedSurface: 'rgba(20, 46, 97, 0.92)',
        primary: '#2563eb',
        primaryText: '#ffffff',
        text: '#f8fafc',
        secondaryText: '#bfdbfe',
        outline: 'rgba(96, 165, 250, 0.52)',
        sliderTrack: 'rgba(147, 197, 253, 0.28)',
      },
      borderRadius: 20,
    });

    // =========================================================================
    // 1. LEFT WORLD-SPACE SLATE: OMNISTEP PROCEDURE & POKA-YOKE GUIDANCE
    // =========================================================================
    this.workOrderHeaderText = new xb.UIText({
      text: 'OMNISTEP · WO-F6X-2277',
      style: {fontSize: 13, fontWeight: 'bold', color: '#93c5fd'},
    });
    this.stepStateText = new xb.UIText({
      text: 'HOLOGRAM ACTIVE',
      style: {fontSize: 14, fontWeight: 'bold', color: '#fbbf24'},
    });

    this.stepBadgeText = new xb.UIText({
      text: 'STEP 01 / 06 · ABS2277VV40B',
      style: {fontSize: 16, fontWeight: 'bold', color: '#60a5fa'},
    });
    this.partNameText = new xb.UIText({
      text: 'Bonding Pins 40mm (x8)',
      style: {fontSize: 22, fontWeight: 'bold', lineHeight: 1.2},
    });
    this.partSpecText = new xb.UIText({
      text: 'Polyamide Stud + Acrylic Base · 40.0 +/- 0.4 mm',
      style: {fontSize: 13, color: '#dbeafe', lineHeight: 1.28},
    });
    this.torqueEntityMetaText = new xb.UIText({
      text: 'Torque: 0.0 N·m (Non-Torqued) · AR: ENT-F6X-PINS-40MM +1',
      style: {fontSize: 12, fontWeight: 'bold', color: '#7dd3fc', lineHeight: 1.25},
    });

    this.warningBannerText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        padding: 10,
        backgroundColor: 'rgba(120, 53, 15, 0.55)',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 1.3,
        color: '#fde68a',
      },
    });

    this.diagramImage = new xb.UIImage({
      src: this.diagramGenerator.texture,
      ariaLabel: 'OmniStep OK versus KO Poka-Yoke schematic',
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        borderRadius: 12,
      },
    });

    const diagramFrame = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        position: 'relative',
        width: '100%',
        height: 120,
        overflow: 'hidden',
        borderRadius: 12,
        backgroundColor: '#07142b',
      },
      children: [this.diagramImage],
    });

    this.instructionText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        padding: 10,
        backgroundColor: 'rgba(7, 20, 46, 0.88)',
        borderRadius: 10,
        fontSize: 14,
        lineHeight: 1.32,
        color: '#e2e8f0',
      },
    });

    this.installButton = new xb.UIButton({
      label: 'Mount ABS2277VV40B',
      icon: 'precision_manufacturing',
      style: {
        width: '100%',
        ...COMPACT_BTN_PADDING,
        backgroundColor: '#2563eb',
      },
      onClick: actions.onInstallStep,
    });

    this.docModeButton = new xb.UIButton({
      label: 'Blueprint',
      icon: 'architecture',
      ariaLabel: 'Toggle OK/KO Poka-Yoke card and 2D technical blueprint',
      style: {
        flexGrow: 1,
        ...COMPACT_BTN_PADDING,
        backgroundColor: 'rgba(20, 46, 97, 0.95)',
      },
      onClick: actions.onToggleDocMode,
    });

    this.correlationButton = new xb.UIButton({
      label: 'Align',
      icon: 'view_in_ar',
      ariaLabel: 'Toggle Real/Virtual 3D correlation wireframe',
      style: {
        flexGrow: 1,
        ...COMPACT_BTN_PADDING,
        backgroundColor: '#1d4ed8',
      },
      onClick: actions.onToggleCorrelation,
    });

    this.explodedValueText = new xb.UIText({
      text: '0%',
      style: {fontSize: 14, fontWeight: 'bold', color: '#60a5fa'},
    });
    this.explodedSlider = new xb.UISlider({
      ariaLabel: 'Exploded view separation',
      min: 0,
      max: 100,
      step: 5,
      value: 0,
      style: {width: '100%', height: 34},
      onInput: (val) => actions.onExplodedChange(val / 100),
    });

    this.cutawayButton = new xb.UIButton({
      label: 'Cutaway',
      icon: 'visibility',
      style: {
        flexGrow: 1,
        ...COMPACT_BTN_PADDING,
        backgroundColor: 'rgba(20, 46, 97, 0.95)',
      },
      onClick: actions.onToggleCutaway,
    });

    this.entityHighlightButton = new xb.UIButton({
      label: 'AR Hi: ON',
      icon: 'center_focus_strong',
      ariaLabel: 'Toggle 3D AR entity highlight cages',
      style: {
        flexGrow: 1,
        ...COMPACT_BTN_PADDING,
        backgroundColor: '#1d4ed8',
      },
      onClick: actions.onToggleEntityHighlight,
    });

    this.assemblyCard = new xb.UICard({
      size: {width: 0.64, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 18,
      },
      children: [
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [this.workOrderHeaderText, this.stepStateText],
        }),
        this.stepBadgeText,
        this.partNameText,
        this.partSpecText,
        this.torqueEntityMetaText,
        this.warningBannerText,
        diagramFrame,
        this.instructionText,
        this.installButton,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 8},
          children: [
            new xb.UIButton({
              label: 'Prev',
              icon: 'arrow_back',
              style: {
                flexGrow: 1,
                ...COMPACT_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: actions.onPrevStep,
            }),
            new xb.UIButton({
              label: 'Next',
              icon: 'arrow_forward',
              style: {
                flexGrow: 1,
                ...COMPACT_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: actions.onNextStep,
            }),
            this.docModeButton,
            this.correlationButton,
          ],
        }),
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [
            new xb.UIText({
              text: 'Exploded Layer Separation',
              style: {fontSize: 13, color: '#bfdbfe'},
            }),
            this.explodedValueText,
          ],
        }),
        this.explodedSlider,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 8},
          children: [
            this.cutawayButton,
            this.entityHighlightButton,
            new xb.UIButton({
              icon: 'rotate_left',
              ariaLabel: 'Rotate jig left',
              style: {
                ...COMPACT_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: () => actions.onRotateEngine(-0.35),
            }),
            new xb.UIButton({
              icon: 'rotate_right',
              ariaLabel: 'Rotate jig right',
              style: {
                ...COMPACT_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: () => actions.onRotateEngine(0.35),
            }),
          ],
        }),
      ],
    });
    this.assemblyCard.name = 'OmniStep Procedure Slate';
    this.assemblyCard.position.set(-1.08, 1.38, -1.16);
    this.assemblyCard.rotation.y = 0.28;

    // =========================================================================
    // 2. RIGHT WORLD-SPACE SLATE: STEP VALIDATION (OK/KO) & TRACEABILITY
    // =========================================================================
    this.toolButtons = {
      laser_gap: new xb.UIButton({
        label: 'Gap',
        icon: 'straighten',
        ariaLabel: 'Select Laser Gap and Flushness Gauge',
        style: {flexGrow: 1, ...COMPACT_BTN_PADDING},
        onClick: () => actions.onSelectTool('laser_gap'),
      }),
      torque: new xb.UIButton({
        label: 'Torque',
        icon: 'build',
        ariaLabel: 'Select Digital Torque Wrench',
        style: {flexGrow: 1, ...COMPACT_BTN_PADDING},
        onClick: () => actions.onSelectTool('torque'),
      }),
      ultrasonic_ndt: new xb.UIButton({
        label: 'NDT',
        icon: 'radar',
        ariaLabel: 'Select Ultrasonic Phased-Array NDT Probe',
        style: {flexGrow: 1, ...COMPACT_BTN_PADDING},
        onClick: () => actions.onSelectTool('ultrasonic_ndt'),
      }),
    };

    this.cpHeaderText = new xb.UIText({
      text: 'CP-01 Pin Height 40mm Poka-Yoke',
      style: {
        fontSize: 18,
        fontWeight: 'bold',
        lineHeight: 1.22,
        textAlign: 'center',
      },
    });
    this.cpStatusBadge = new xb.UIText({
      text: '[RESULT] PENDING',
      style: {fontSize: 14, fontWeight: 'bold', color: '#60a5fa'},
    });
    this.cpLocationText = new xb.UIText({
      text: 'Frame FR-14 Upper Pin Row',
      style: {fontSize: 14, color: '#bfdbfe', textAlign: 'center'},
    });
    this.cpMeasurementText = new xb.UIText({
      text: 'Measured: --',
      style: {fontSize: 21, fontWeight: 'bold', color: '#f8fafc'},
    });
    this.cpToleranceText = new xb.UIText({
      text: 'Spec Band: 39.60 – 40.40 mm (Nom 40.00)',
      style: {fontSize: 14, color: '#dbeafe'},
    });
    this.cpNoteText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        padding: 11,
        backgroundColor: 'rgba(7, 20, 46, 0.88)',
        borderRadius: 12,
        fontSize: 14,
        lineHeight: 1.32,
        color: '#e2e8f0',
      },
    });

    this.scanButton = new xb.UIButton({
      label: 'Validate CP-01',
      icon: 'radar',
      style: {flexGrow: 1, ...COMPACT_BTN_PADDING, backgroundColor: '#2563eb'},
      onClick: actions.onInspectCheckpoint,
    });
    this.reworkButton = new xb.UIButton({
      label: 'Rework KO',
      icon: 'handyman',
      disabled: true,
      style: {flexGrow: 1, ...COMPACT_BTN_PADDING, backgroundColor: '#d97706'},
      onClick: actions.onReworkCheckpoint,
    });
    this.scanAllButton = new xb.UIButton({
      label: 'Batch Validate Mounted Steps',
      icon: 'fact_check',
      style: {
        width: '100%',
        ...COMPACT_BTN_PADDING,
        backgroundColor: 'rgba(20, 46, 97, 0.95)',
      },
      onClick: actions.onInspectAll,
    });
    this.signOffButton = new xb.UIButton({
      label: 'Certify & Sync Form 8130-3',
      icon: 'verified',
      disabled: true,
      style: {
        width: '100%',
        ...COMPACT_BTN_PADDING,
        backgroundColor: '#059669',
      },
      onClick: actions.onSignOff,
    });
    this.traceabilityFooterText = new xb.UIText({
      text: 'Traceability: Evaluation Session · Sign in with Google for Cloud Log',
      style: {
        fontSize: 13,
        color: '#93c5fd',
        lineHeight: 1.28,
      },
    });

    this.qcCard = new xb.UICard({
      size: {width: 0.62, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 20,
      },
      children: [
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [
            new xb.UIText({
              text: 'STEP VALIDATION & NDT',
              style: {fontSize: 13, fontWeight: 'bold', color: '#93c5fd'},
            }),
            this.cpStatusBadge,
          ],
        }),
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 8},
          children: [
            this.toolButtons.laser_gap,
            this.toolButtons.torque,
            this.toolButtons.ultrasonic_ndt,
          ],
        }),
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          },
          children: [
            new xb.UIButton({
              icon: 'chevron_left',
              ariaLabel: 'Previous QC checkpoint',
              style: {
                ...COMPACT_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: actions.onPrevCheckpoint,
            }),
            new xb.UIPanel({
              style: {
                flexGrow: 1,
                flexBasis: 0,
                flexDirection: 'column',
                alignItems: 'center',
              },
              children: [this.cpHeaderText, this.cpLocationText],
            }),
            new xb.UIButton({
              icon: 'chevron_right',
              ariaLabel: 'Next QC checkpoint',
              style: {
                ...COMPACT_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: actions.onNextCheckpoint,
            }),
          ],
        }),
        this.cpMeasurementText,
        this.cpToleranceText,
        this.cpNoteText,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 8},
          children: [this.scanButton, this.reworkButton],
        }),
        this.scanAllButton,
        this.signOffButton,
        this.traceabilityFooterText,
      ],
    });
    this.qcCard.name = 'OmniStep Validation & Traceability Slate';
    this.qcCard.position.set(1.08, 1.38, -1.16);
    this.qcCard.rotation.y = -0.28;

    // =========================================================================
    // 3. TOP-CENTER VIEW-SPACE OVERLAY: XREAL AURA <=2.00MM CV & GESTURE RIBBON
    // =========================================================================
    this.hudProgressText = new xb.UIText({
      text: 'OMNISTEP · WO-F6X-2277 · MOUNTED 0/6 · VALIDATED 0/6',
      pointerEvents: 'none',
      style: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#93c5fd',
      },
    });
    this.hudCalibrationText = new xb.UIText({
      text: 'XREAL AURA · OFFLINE CV (NO QR) · H145M LOCKED <= 2.00 MM',
      pointerEvents: 'none',
      style: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#34d399',
        lineHeight: 1.25,
      },
    });
    this.hudFeedbackText = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {
        fontSize: 13,
        color: '#f1f5f9',
        lineHeight: 1.28,
      },
    });

    this.heliViewButton = new xb.UIButton({
      label: 'Workcell',
      icon: 'flight',
      ariaLabel: 'Switch between 3D Helicopter XREAL Aura calibration stage and assembly workcell',
      style: {
        flexGrow: 1,
        ...RIBBON_BTN_PADDING,
        backgroundColor: '#1d4ed8',
      },
      onClick: actions.onToggleHelicopterView,
    });

    this.auraCalibrateButton = new xb.UIButton({
      label: 'Calibrate',
      icon: 'my_location',
      ariaLabel: 'Run markerless offline stereo computer vision calibration to <= 2mm accuracy',
      style: {
        flexGrow: 1,
        ...RIBBON_BTN_PADDING,
        backgroundColor: '#059669',
      },
      onClick: actions.onRunAuraCalibration,
    });

    this.auraDriftButton = new xb.UIButton({
      label: 'Drift',
      ariaLabel: 'Inject 35mm uncalibrated head-pose drift before offline CV lock',
      style: {
        flexGrow: 1,
        ...RIBBON_BTN_PADDING,
        backgroundColor: 'rgba(20, 46, 97, 0.95)',
      },
      onClick: actions.onInjectAuraDrift,
    });

    this.togglePanelsButton = new xb.UIButton({
      label: 'Roll Up',
      ariaLabel: 'Roll up or unroll OmniStep spatial slates',
      style: {
        flexGrow: 1,
        ...RIBBON_BTN_PADDING,
        backgroundColor: 'rgba(20, 46, 97, 0.95)',
      },
      onClick: () => this.toggleCardsVisibility(),
    });

    this.scenarioButton = new xb.UIButton({
      label: 'Turbofan',
      ariaLabel: 'Switch manufacturing procedure',
      style: {
        flexGrow: 1,
        ...RIBBON_BTN_PADDING,
        backgroundColor: 'rgba(20, 46, 97, 0.95)',
      },
      onClick: actions.onSwitchScenario,
    });

    this.bottomOverlay = new xb.UIOverlay({
      style: {
        width: 680,
        position: 'absolute',
        left: '50%',
        top: 12,
        transform: {translateX: '-50%'},
        flexDirection: 'column',
        gap: 6,
        padding: 13,
        backgroundColor: 'rgba(9, 22, 50, 0.95)',
        borderRadius: 18,
      },
      children: [
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'column',
            gap: 3,
          },
          children: [
            this.hudProgressText,
            this.hudCalibrationText,
            this.hudFeedbackText,
          ],
        }),
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
          },
          children: [
            this.heliViewButton,
            this.auraCalibrateButton,
            this.auraDriftButton,
            this.togglePanelsButton,
            this.scenarioButton,
            new xb.UIButton({
              label: 'Reset',
              ariaLabel: 'Reset manufacturing procedure',
              style: {
                flexGrow: 1,
                ...RIBBON_BTN_PADDING,
                backgroundColor: 'rgba(20, 46, 97, 0.95)',
              },
              onClick: actions.onResetWorkbench,
            }),
          ],
        }),
      ],
    });
    this.bottomOverlay.name = 'OmniStep Command Ribbon';

    for (const card of [this.assemblyCard, this.qcCard]) {
      card.userData.initialPose = {
        position: card.position.clone(),
        quaternion: card.quaternion.clone(),
        scale: card.scale.clone(),
      };
    }
  }

  isUnrolled(): boolean {
    return this.cardsVisible;
  }

  toggleCardsVisibility(force?: boolean): boolean {
    this.cardsVisible = force ?? !this.cardsVisible;
    this.assemblyCard.visible = this.cardsVisible;
    this.qcCard.visible = this.cardsVisible;
    this.togglePanelsButton.label = this.cardsVisible ? 'Roll Up' : 'Unroll';
    this.togglePanelsButton.icon = this.cardsVisible
      ? 'layers_clear'
      : 'layers';
    this.onUnrollChange?.(this.cardsVisible);
    return this.cardsVisible;
  }

  resetCardPoses(): void {
    this.toggleCardsVisibility(true);
    for (const card of [this.assemblyCard, this.qcCard]) {
      const initPose = card.userData.initialPose as
        | {
            position: THREE.Vector3;
            quaternion: THREE.Quaternion;
            scale: THREE.Vector3;
          }
        | undefined;
      if (initPose) {
        card.position.copy(initPose.position);
        card.quaternion.copy(initPose.quaternion);
        card.scale.copy(initPose.scale);
      }
    }
  }

  renderFromEngine(
    engine: AeroAssemblyEngine,
    traceabilityLine?: string,
    highlightState?: ArEntityHighlightState,
    calibrationReport?: HelicopterCalibrationReport,
    helicopterViewActive = false,
  ): void {
    const scenario = engine.getScenario();
    const step = engine.getCurrentStep();
    const installed = engine.isStepInstalled(step.id);
    const summary = engine.computeSummary();
    const activeTool = engine.getActiveTool();
    const cp = engine.getSelectedCheckpoint();
    const feedback = engine.getLastFeedback();
    const docMode = engine.getDocViewMode();
    const corrVisible = engine.isCorrelationGuideVisible();

    // Update Poka-Yoke / 2D Blueprint CanvasTexture
    this.diagramGenerator.render(scenario, step, docMode, installed);

    // 1. Procedure Slate updates
    this.workOrderHeaderText.text = `OMNISTEP · ${scenario.workOrderId}`;
    this.stepBadgeText.text = `${step.code} OF 06 · ${step.partNumber}`;

    if (installed) {
      this.stepStateText.text = 'MOUNTED AT DATUM';
      this.stepStateText.style.color = '#34d399';
    } else {
      this.stepStateText.text = 'HOLOGRAM ACTIVE';
      this.stepStateText.style.color = '#fbbf24';
    }

    this.partNameText.text = step.name;
    this.partSpecText.text = `${step.alloySpec} · ${step.targetSpecLabel}`;

    const torqueLabel =
      step.requiredTorqueNm > 0
        ? `Torque: ${step.requiredTorqueNm.toFixed(1)} N·m [${step.torqueMinNm.toFixed(1)}–${step.torqueMaxNm.toFixed(1)}]`
        : 'Torque: 0.0 N·m (Non-Torqued)';
    const activeEntities = highlightState?.enabled
      ? highlightState.entityIds
      : step.modelEntityIds;
    const primaryEntity = activeEntities[0] ?? 'NONE';
    const extraCount =
      activeEntities.length > 1 ? ` +${activeEntities.length - 1}` : '';
    const arPrefix =
      highlightState && !highlightState.enabled
        ? 'AR Off'
        : highlightState?.mode === 'spotlight'
          ? 'Spotlight'
          : 'AR';
    this.torqueEntityMetaText.text = `${torqueLabel} · ${arPrefix}: ${primaryEntity}${extraCount}`;

    this.warningBannerText.text = step.warningText;
    this.instructionText.text = step.instruction;

    if (installed) {
      const nextPending = engine.getNextUninstalledStepId();
      this.installButton.label =
        nextPending !== null
          ? `Mounted · Next 0${nextPending}`
          : 'All 6 Steps Mounted';
      this.installButton.disabled = nextPending === null;
      this.installButton.style.backgroundColor =
        nextPending !== null ? '#1d4ed8' : 'rgba(51, 65, 85, 0.65)';
    } else {
      this.installButton.label = `Mount ${step.partNumber}`;
      this.installButton.disabled = false;
      this.installButton.style.backgroundColor = '#2563eb';
    }

    this.docModeButton.label = docMode === 'ok_ko' ? 'Blueprint' : 'OK / KO';
    this.docModeButton.style.backgroundColor =
      docMode === 'blueprint' ? '#1d4ed8' : 'rgba(20, 46, 97, 0.95)';

    const expPct = Math.round(engine.getExplodedFactor() * 100);
    this.explodedValueText.text = `${expPct}%`;
    this.explodedSlider.value = expPct;

    const cutaway = engine.isCutawayEnabled();
    this.cutawayButton.label = cutaway ? 'Close Leaf' : 'Cutaway';
    this.cutawayButton.style.backgroundColor = cutaway
      ? '#2563eb'
      : 'rgba(20, 46, 97, 0.95)';

    const hiEnabled = highlightState?.enabled ?? true;
    this.entityHighlightButton.label = hiEnabled ? 'AR Hi: ON' : 'AR Hi: OFF';
    this.entityHighlightButton.style.backgroundColor = hiEnabled
      ? '#1d4ed8'
      : 'rgba(20, 46, 97, 0.95)';

    // 2. Validation & Traceability Slate updates
    for (const tool of ['laser_gap', 'torque', 'ultrasonic_ndt'] as const) {
      const btn = this.toolButtons[tool];
      const active = tool === activeTool;
      btn.style.backgroundColor = active
        ? QC_TOOL_META[tool].accentCss
        : 'rgba(20, 46, 97, 0.95)';
      btn.style.color = active ? '#08142c' : '#f8fafc';
    }

    this.cpHeaderText.text = cp.spec.label;
    this.cpLocationText.text = `${cp.spec.locationLabel} (${QC_TOOL_META[cp.spec.tool].shortLabel})`;

    if (cp.status === 'pass') {
      this.cpStatusBadge.text = '[RESULT] OK';
      this.cpStatusBadge.style.color = '#34d399';
    } else if (cp.status === 'reworked') {
      this.cpStatusBadge.text = '[RESULT] REWORK OK';
      this.cpStatusBadge.style.color = '#34d399';
    } else if (cp.status === 'fail') {
      this.cpStatusBadge.text = '[RESULT] KO';
      this.cpStatusBadge.style.color = '#f87171';
    } else {
      this.cpStatusBadge.text = '[RESULT] PENDING';
      this.cpStatusBadge.style.color = '#60a5fa';
    }

    if (cp.measuredValue === null) {
      this.cpMeasurementText.text = `Measured: -- ${cp.spec.unit}`;
      this.cpMeasurementText.style.color = '#93c5fd';
    } else {
      this.cpMeasurementText.text = `Measured: ${cp.measuredValue.toFixed(2)} ${cp.spec.unit}`;
      this.cpMeasurementText.style.color =
        cp.status === 'fail' ? '#f87171' : '#34d399';
    }

    this.cpToleranceText.text = `Allowable: ${cp.spec.minAllowed.toFixed(2)} – ${cp.spec.maxAllowed.toFixed(2)} ${cp.spec.unit} (Nom ${cp.spec.nominal.toFixed(2)})`;
    this.cpNoteText.text = cp.lastNote;

    const cpStageInstalled = engine.isStepInstalled(cp.spec.stepId);
    this.scanButton.disabled = !cpStageInstalled;
    this.scanButton.label = cpStageInstalled
      ? `Validate ${cp.spec.id}`
      : `Mount 0${cp.spec.stepId} First`;

    this.reworkButton.disabled = cp.status !== 'fail';
    this.scanAllButton.disabled = summary.installedCount === 0;

    if (summary.signedOff) {
      this.signOffButton.disabled = true;
      this.signOffButton.label = `Certified: ${summary.certificateCode}`;
    } else {
      this.signOffButton.disabled = !summary.canSignOff;
      this.signOffButton.label = summary.canSignOff
        ? 'Certify & Sync Form 8130-3'
        : `Release (${summary.compliantCount}/6 Validated OK)`;
    }

    if (traceabilityLine) {
      this.traceabilityFooterText.text = traceabilityLine;
    }

    // 3. Top Ribbon & XREAL Aura Offline CV updates
    this.correlationButton.label = corrVisible ? 'Align' : 'Align Off';
    this.correlationButton.style.backgroundColor = corrVisible
      ? '#1d4ed8'
      : 'rgba(20, 46, 97, 0.95)';

    this.heliViewButton.label = helicopterViewActive ? 'Workcell' : 'Heli CV';
    this.heliViewButton.icon = helicopterViewActive
      ? 'precision_manufacturing'
      : 'flight';
    this.heliViewButton.style.backgroundColor = helicopterViewActive
      ? '#1d4ed8'
      : 'rgba(20, 46, 97, 0.95)';

    if (calibrationReport) {
      const heliShort = HELICOPTER_PROFILES[calibrationReport.variantId].shortName;
      if (calibrationReport.status === 'calibrated_pass') {
        this.hudCalibrationText.text = `XREAL AURA OFFLINE CV (NO QR) · ${heliShort} LOCKED ${calibrationReport.rmsErrorMm.toFixed(2)} mm <= 2.00 mm (${calibrationReport.inlierCount}/${calibrationReport.totalLandmarks} KP)`;
        this.hudCalibrationText.style.color = '#34d399';
        this.auraCalibrateButton.style.backgroundColor = '#059669';
        this.auraDriftButton.style.backgroundColor = 'rgba(20, 46, 97, 0.95)';
      } else if (calibrationReport.status === 'uncalibrated_drift') {
        this.hudCalibrationText.text = `XREAL AURA VIO DRIFT · ${heliShort} ${calibrationReport.rmsErrorMm.toFixed(2)} mm RMS (> 2.00 mm) · CLICK CALIBRATE`;
        this.hudCalibrationText.style.color = '#fbbf24';
        this.auraCalibrateButton.style.backgroundColor = '#2563eb';
        this.auraDriftButton.style.backgroundColor = '#d97706';
      } else {
        this.hudCalibrationText.text = `XREAL AURA 2MM GATE BLOCKED · ${heliShort} ${calibrationReport.rmsErrorMm.toFixed(2)} mm (${calibrationReport.inlierCount}/${calibrationReport.totalLandmarks} KP VISIBLE)`;
        this.hudCalibrationText.style.color = '#f87171';
        this.auraCalibrateButton.style.backgroundColor = '#dc2626';
        this.auraDriftButton.style.backgroundColor = 'rgba(20, 46, 97, 0.95)';
      }
    }

    this.scenarioButton.label =
      scenario.id === 'panel_buildup' ? 'Turbofan' : 'Panel Rig';

    const statusSuffix =
      summary.activeDefectCount > 0
        ? ` · ${summary.activeDefectCount} KO ALERT`
        : summary.signedOff
          ? ' · CERTIFIED'
          : '';
    this.hudProgressText.text = `${scenario.workOrderId} · MOUNTED ${summary.installedCount}/6 · VALIDATED ${summary.compliantCount}/6 · FPY ${summary.firstPassYieldPercent}%${statusSuffix}`;
    this.hudProgressText.style.color =
      summary.activeDefectCount > 0
        ? '#f87171'
        : summary.signedOff
          ? '#34d399'
          : '#93c5fd';

    this.hudFeedbackText.text = feedback.message;
  }

  dispose(): void {
    this.diagramGenerator.dispose();
  }
}
