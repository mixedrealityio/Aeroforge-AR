import type {ScenarioId} from '../firebase/payloadValidation';

export type QCToolType = 'torque' | 'laser_gap' | 'ultrasonic_ndt';

export type QCStatus = 'pending' | 'pass' | 'fail' | 'reworked';

export interface ModelEntityCatalogEntry {
  readonly entityId: string;
  readonly label: string;
  readonly stepId: number;
  readonly scenarioId: ScenarioId;
}

export interface PokaYokeDiagramSpec {
  readonly okLabel: string;
  readonly okDetail: string;
  readonly koLabel: string;
  readonly koDetail: string;
  readonly metricCallout: string;
  readonly motif:
    | 'pin_length'
    | 'bracket_tab'
    | 'blanket_film'
    | 'clamp_gap'
    | 'torque_star'
    | 'bond_seal';
}

export interface AssemblyStepSpec {
  readonly id: number; // 1..6
  readonly code: string;
  readonly canonicalCode: `STEP-0${1 | 2 | 3 | 4 | 5 | 6}`;
  readonly name: string;
  readonly shortName: string;
  readonly partNumber: string;
  readonly alloySpec: string;
  readonly requiredTool: string;
  readonly targetSpecLabel: string;
  readonly warningText: string;
  readonly instruction: string;
  /** Nominal required fastener torque setting in N·m (0 for non-torqued steps) */
  readonly requiredTorqueNm: number;
  /** Minimum allowable fastener torque in N·m */
  readonly torqueMinNm: number;
  /** Maximum allowable fastener torque in N·m */
  readonly torqueMaxNm: number;
  /** Associated 3D scene entity IDs highlighted in AR for this workflow step */
  readonly modelEntityIds: readonly string[];
  /** Hex color tint used for 3D AR entity highlighting */
  readonly highlightColorHex: string;
  readonly diagram: PokaYokeDiagramSpec;
  /** Installed local Z position along assembly datum (meters) */
  readonly installedZ: number;
  /** Pre-installation AR staging offset [x, y, z] relative to installed datum (meters) */
  readonly stagingOffset: readonly [number, number, number];
  /** Axial exploded-view Z displacement when explodedFactor === 1 (meters) */
  readonly explodedZDelta: number;
  /** Linked QC checkpoint ID */
  readonly checkpointId: string;
}

export interface InspectionCheckpointSpec {
  readonly id: string;
  readonly stepId: number;
  readonly label: string;
  readonly locationLabel: string;
  readonly tool: QCToolType;
  readonly unit: string;
  readonly nominal: number;
  readonly minAllowed: number;
  readonly maxAllowed: number;
  /** Deterministic raw shop-floor measurement before calibration/rework */
  readonly initialMeasured: number;
  /** Calibrated measurement achieved after precision rework */
  readonly calibratedMeasured: number;
  readonly reworkAction: string;
  /** Local 3D coordinates [x, y, z] relative to rig centerline origin */
  readonly anchorOffset: readonly [number, number, number];
}

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly title: string;
  readonly shortTitle: string;
  readonly subtitle: string;
  readonly workOrderId: string;
  readonly assetModel: string;
  readonly serialNumber: string;
  readonly station: string;
  readonly releaseCertificateCode: string;
  readonly steps: readonly AssemblyStepSpec[];
  readonly checkpoints: readonly InspectionCheckpointSpec[];
}

export const MODEL_ENTITY_CATALOG: Readonly<
  Record<ScenarioId, readonly ModelEntityCatalogEntry[]>
> = Object.freeze({
  panel_buildup: Object.freeze<ModelEntityCatalogEntry[]>([
    {
      entityId: 'ENT-F6X-PINS-40MM',
      label: 'Bonding Pin Shafts (8x 40mm)',
      stepId: 1,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-PIN-BASES',
      label: 'Ti-6Al-4V Pin Adhesive Bases',
      stepId: 1,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-CLICK-BRACKETS',
      label: 'Click-Stud Bracket Bodies (6x)',
      stepId: 2,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-BRACKET-TABS',
      label: 'Upper Slotted Retention Tabs',
      stepId: 2,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-KAPTON-BLANKET',
      label: 'Kapton Thermal-Acoustic Quilt',
      stepId: 3,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-VAPOR-TAPES',
      label: 'Metallic Vapor Tapes & Grommets',
      stepId: 3,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-HARNESS-BUNDLE',
      label: 'Braided Avionics Harness Conduit',
      stepId: 4,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-PCLAMPS',
      label: 'EPDM-Cushioned P-Clamps (4x)',
      stepId: 4,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-LOCKING-CAPS',
      label: 'Self-Locking Pin Dome Caps (8x)',
      stepId: 5,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-SHEAR-TIES',
      label: 'Frame FR-15 Shear-Tie Lugs (4x)',
      stepId: 5,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-DADO-PORT',
      label: 'Port Carbon-Nomex Dado Leaf',
      stepId: 6,
      scenarioId: 'panel_buildup',
    },
    {
      entityId: 'ENT-F6X-DADO-STARBOARD',
      label: 'Starboard Carbon-Nomex Dado Leaf',
      stepId: 6,
      scenarioId: 'panel_buildup',
    },
  ]),
  turbofan_core: Object.freeze<ModelEntityCatalogEntry[]>([
    {
      entityId: 'ENT-TF90-LP-SHAFT',
      label: 'LP Forged Titanium Spool Shaft',
      stepId: 1,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-FWD-BEARING',
      label: 'No. 1 Forward Bearing & Rollers',
      stepId: 1,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-AFT-BEARING',
      label: 'No. 2 Aft Inconel Bearing Housing',
      stepId: 1,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-FAN-HUB',
      label: 'Fan Hub Disk, Spinner & Shroud',
      stepId: 2,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-FAN-BLADES',
      label: '18x Wide-Chord Ti Airfoil Blades',
      stepId: 2,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-SPINNER-LOCKNUT',
      label: 'Conical Hub Retaining Locknut',
      stepId: 2,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-HPC-BARREL',
      label: '5-Stage Inconel HPC Stator Barrel',
      stepId: 3,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-VSV-RING',
      label: 'Variable Stator Vane Actuator Ring',
      stepId: 3,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-HPC-BOLTS',
      label: '16x HPC Perimeter Flange Tie-Bolts',
      stepId: 3,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-COMBUSTOR-LINER',
      label: 'Ceramic TBC Annular Combustor Liner',
      stepId: 4,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-FUEL-MANIFOLD',
      label: '360° Braided Fuel Manifold Ring',
      stepId: 4,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-FUEL-NOZZLES',
      label: '12x Anodized Fuel Injector Nozzles',
      stepId: 4,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-HPT-BLISK',
      label: 'CMSX-4 Single-Crystal HPT Blisk',
      stepId: 5,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-EXHAUST-CONE',
      label: 'Titanium Acoustic Exhaust Tailcone',
      stepId: 5,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-HPT-BOLTS',
      label: '16x Aft Turbine Coupling Ring Bolts',
      stepId: 5,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-COWL-PORT',
      label: 'Port Acoustic CFRP Nacelle Cowl',
      stepId: 6,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-COWL-STARBOARD',
      label: 'Starboard Acoustic CFRP Nacelle Cowl',
      stepId: 6,
      scenarioId: 'turbofan_core',
    },
    {
      entityId: 'ENT-TF90-FADEC-UNIT',
      label: 'FADEC Controller & Kapton Harness',
      stepId: 6,
      scenarioId: 'turbofan_core',
    },
  ]),
});

export const QC_TOOL_META: Readonly<
  Record<
    QCToolType,
    {
      readonly label: string;
      readonly shortLabel: string;
      readonly icon: string;
      readonly accentHex: number;
      readonly accentCss: string;
    }
  >
> = Object.freeze({
  torque: {
    label: 'Digital Torque Wrench',
    shortLabel: 'Torque',
    icon: 'build',
    accentHex: 0x38bdf8,
    accentCss: '#38bdf8',
  },
  laser_gap: {
    label: 'Laser Gap & Pin Gauge',
    shortLabel: 'Laser Gap',
    icon: 'straighten',
    accentHex: 0xa78bfa,
    accentCss: '#a78bfa',
  },
  ultrasonic_ndt: {
    label: 'Ultrasonic Phased-Array NDT',
    shortLabel: 'Ultrasonic',
    icon: 'radar',
    accentHex: 0x2dd4bf,
    accentCss: '#2dd4bf',
  },
});

// ============================================================================
// SCENARIO 1: OMNISTEP FUSELAGE PANEL BUILD-UP (ABS2277VV40B / G537700011)
// ============================================================================
export const PANEL_BUILDUP_STEPS: readonly AssemblyStepSpec[] = Object.freeze([
  {
    id: 1,
    code: 'STEP 01',
    canonicalCode: 'STEP-01',
    name: 'Bonding Pins — 40 mm Set (8x Spots)',
    shortName: 'Bonding Pins 40mm',
    partNumber: 'ABS2277VV40B',
    alloySpec: 'Polyamide-Imide / Ti-6Al-4V Base Stud',
    requiredTool: 'Pneumatic Adhesive Applicator',
    targetSpecLabel: 'Pin Height 40.0 mm (±0.4 mm)',
    warningText:
      'WARNING: Verify 40.0 mm pin length! Do NOT confuse with shorter reference ABS2277VV30B (30.0 mm).',
    instruction:
      'Strip and degrease the 8 holographic fuselage spots. Apply structural adhesive to pin base and press each ABS2277VV40B pin normal to skin.',
    requiredTorqueNm: 0,
    torqueMinNm: 0,
    torqueMaxNm: 0,
    modelEntityIds: ['ENT-F6X-PINS-40MM', 'ENT-F6X-PIN-BASES'],
    highlightColorHex: '#38bdf8',
    diagram: {
      okLabel: 'OK · ABS2277VV40B (40 mm)',
      okDetail: 'Full 40.0 mm shaft clears acoustic blanket',
      koLabel: 'KO · ABS2277VV30B (30 mm)',
      koDetail: 'Short 30.0 mm shaft fails washer lock',
      metricCallout: 'L = 40.0 ± 0.4 mm · Skin Spot P1–P8',
      motif: 'pin_length',
    },
    installedZ: 0.04,
    stagingOffset: [0, 0.06, 0.24],
    explodedZDelta: 0.1,
    checkpointId: 'CP-01',
  },
  {
    id: 2,
    code: 'STEP 02',
    canonicalCode: 'STEP-02',
    name: 'Click-Stud Retention Brackets (Stringer S-14)',
    shortName: 'Click-Stud Brackets',
    partNumber: 'ABS1423FA02',
    alloySpec: 'Anodized 7075-T6 Aerospace Aluminum',
    requiredTool: 'Digital Quarter-Turn Torque Driver',
    targetSpecLabel: 'Stud Seat Torque 8.5 N·m (8.0–9.0 N·m)',
    warningText:
      'WARNING: Orient locking tab UPWARD (+Y) toward Frame FR-14 web. Inverted brackets obstruct ECS ducting.',
    instruction:
      'Snap 6 ABS1423FA02 click-stud standoffs onto stringer S-14 & S-15 flanges following the holographic orientation arrows.',
    requiredTorqueNm: 8.5,
    torqueMinNm: 8.0,
    torqueMaxNm: 9.0,
    modelEntityIds: ['ENT-F6X-CLICK-BRACKETS', 'ENT-F6X-BRACKET-TABS'],
    highlightColorHex: '#60a5fa',
    diagram: {
      okLabel: 'OK · Tab Upward (+Y)',
      okDetail: 'Slotted latch faces upper frame web',
      koLabel: 'KO · Inverted (-Y)',
      koDetail: 'Blocks harness clamp rail clearance',
      metricCallout: 'Torque 8.5 N·m · Flange Datum S-14',
      motif: 'bracket_tab',
    },
    installedZ: 0.06,
    stagingOffset: [0, 0.14, 0.25],
    explodedZDelta: 0.16,
    checkpointId: 'CP-02',
  },
  {
    id: 3,
    code: 'STEP 03',
    canonicalCode: 'STEP-03',
    name: 'Primary Thermal-Acoustic Insulation Blanket',
    shortName: 'Acoustic Blanket',
    partNumber: 'G537700011',
    alloySpec: 'Metallized Polyimide / Melamine Foam Core',
    requiredTool: 'Ultrasonic Seam & Overlap Scanner',
    targetSpecLabel: 'Seam Attenuation <= 1.60 dB',
    warningText:
      'WARNING: Gold metallized vapor barrier MUST face cabin interior (+Z). Do not compress blanket thickness below 28 mm.',
    instruction:
      'Align cutout bay G537700011 between frames FR-14 and FR-16 and impale cleanly over all 8 ABS2277VV40B pins.',
    requiredTorqueNm: 0,
    torqueMinNm: 0,
    torqueMaxNm: 0,
    modelEntityIds: ['ENT-F6X-KAPTON-BLANKET', 'ENT-F6X-VAPOR-TAPES'],
    highlightColorHex: '#fbbf24',
    diagram: {
      okLabel: 'OK · Vapor Film Inward (+Z)',
      okDetail: 'Gold Kapton barrier faces cabin side',
      koLabel: 'KO · Reversed / Torn',
      koDetail: 'Condensation trap against aluminum skin',
      metricCallout: 'Overlap >= 15 mm · Atten <= 1.60 dB',
      motif: 'blanket_film',
    },
    installedZ: 0.08,
    stagingOffset: [0, 0.02, 0.28],
    explodedZDelta: 0.23,
    checkpointId: 'CP-03',
  },
  {
    id: 4,
    code: 'STEP 04',
    canonicalCode: 'STEP-04',
    name: 'Avionics & ECS Harness P-Clamp Rail',
    shortName: 'Harness Clamp Rail',
    partNumber: 'ABS2259A07',
    alloySpec: 'EPDM-Cushioned Ti-3Al-2.5V Conduit Clamps',
    requiredTool: 'Laser Optical Standoff Gauge',
    targetSpecLabel: 'Blanket Clearance 8.0 mm (6.5–9.5 mm)',
    warningText:
      'WARNING: Maintain >= 6.5 mm standoff from insulation film to prevent chafing under flight vibration.',
    instruction:
      'Mount braided harness rail across click-stud brackets and close cushioned ABS2259A07 P-clamps at stations A–D.',
    requiredTorqueNm: 4.5,
    torqueMinNm: 4.0,
    torqueMaxNm: 5.0,
    modelEntityIds: ['ENT-F6X-HARNESS-BUNDLE', 'ENT-F6X-PCLAMPS'],
    highlightColorHex: '#38bdf8',
    diagram: {
      okLabel: 'OK · Gap 6.5–9.5 mm',
      okDetail: 'Shimmed standoff prevents skin chafing',
      koLabel: 'KO · Gap < 6.5 mm (Chafe)',
      koDetail: 'Direct contact abrades vapor barrier',
      metricCallout: 'Clearance 8.0 ± 1.5 mm · Frame FR-15',
      motif: 'clamp_gap',
    },
    installedZ: 0.12,
    stagingOffset: [0, 0.12, 0.28],
    explodedZDelta: 0.31,
    checkpointId: 'CP-04',
  },
  {
    id: 5,
    code: 'STEP 05',
    canonicalCode: 'STEP-05',
    name: 'Self-Locking Pin Washers & Frame Shear Ties',
    shortName: 'Locking Caps & Ties',
    partNumber: 'F6X-534-810',
    alloySpec: 'A286 Corrosion-Resistant Steel / Ti-6Al-4V',
    requiredTool: 'Digital Angle-Sensing Torque Wrench',
    targetSpecLabel: 'Shear-Tie Torque 18.5 N·m (17.5–19.5 N·m)',
    warningText:
      'WARNING: Seat self-locking dome caps flush onto all 8 pins before torquing frame shear-tie fasteners in cross order.',
    instruction:
      'Press locking caps onto protruding ABS2277VV40B tips and torque upper/lower shear-tie bolts in star sequence.',
    requiredTorqueNm: 18.5,
    torqueMinNm: 17.5,
    torqueMaxNm: 19.5,
    modelEntityIds: ['ENT-F6X-LOCKING-CAPS', 'ENT-F6X-SHEAR-TIES'],
    highlightColorHex: '#34d399',
    diagram: {
      okLabel: 'OK · Cross Torque 18.5 N·m',
      okDetail: 'Balanced preload across shear-tie lugs',
      koLabel: 'KO · Under-Torqued (<17.5)',
      koDetail: 'Fastener backoff under cabin pressurization',
      metricCallout: 'Preload 18.5 ± 1.0 N·m · Star Sequence',
      motif: 'torque_star',
    },
    installedZ: 0.14,
    stagingOffset: [0, -0.08, 0.28],
    explodedZDelta: 0.38,
    checkpointId: 'CP-05',
  },
  {
    id: 6,
    code: 'STEP 06',
    canonicalCode: 'STEP-06',
    name: 'Carbon-Nomex Cabin Dado Lining Panel',
    shortName: 'Carbon Dado Panel',
    partNumber: 'F6X-537-920',
    alloySpec: 'CFRP Prepreg / Nomex Honeycomb Core',
    requiredTool: 'Phased-Array Ultrasonic Bond Scanner',
    targetSpecLabel: 'Acoustic Bondline <= 1.50 dB',
    warningText:
      'WARNING: Verify decompression vent louver alignment before engaging quarter-turn panel latches.',
    instruction:
      'Close port and starboard Carbon-Nomex dado panel leaves over the insulated bay and engage perimeter latches.',
    requiredTorqueNm: 6.2,
    torqueMinNm: 5.8,
    torqueMaxNm: 6.6,
    modelEntityIds: ['ENT-F6X-DADO-PORT', 'ENT-F6X-DADO-STARBOARD'],
    highlightColorHex: '#a78bfa',
    diagram: {
      okLabel: 'OK · Flush Latch & Bond',
      okDetail: 'Decompression louver clear, <= 1.50 dB',
      koLabel: 'KO · Unlatched / Delam',
      koDetail: 'Step mismatch > 0.5 mm at frame joint',
      metricCallout: 'Bond Echo <= 1.50 dB · Bay 14 Dado',
      motif: 'bond_seal',
    },
    installedZ: 0.17,
    stagingOffset: [0, 0.18, 0.3],
    explodedZDelta: 0.46,
    checkpointId: 'CP-06',
  },
]);

export const PANEL_BUILDUP_CHECKPOINTS: readonly InspectionCheckpointSpec[] =
  Object.freeze([
    {
      id: 'CP-01',
      stepId: 1,
      label: 'CP-01 Bonding Pin ABS2277VV40B Height',
      locationLabel: 'Fuselage Skin Spot P3 / P6',
      tool: 'laser_gap',
      unit: 'mm',
      nominal: 40.0,
      minAllowed: 39.6,
      maxAllowed: 40.4,
      initialMeasured: 40.05,
      calibratedMeasured: 40.0,
      reworkAction: 'Replace mis-seated stud with calibrated 40.0 mm ABS2277VV40B pin',
      anchorOffset: [-0.18, 0.14, 0.07],
    },
    {
      id: 'CP-02',
      stepId: 2,
      label: 'CP-02 Click-Stud Bracket Flange Torque',
      locationLabel: 'Stringer S-14 Upper Standoff',
      tool: 'torque',
      unit: 'N·m',
      nominal: 8.5,
      minAllowed: 8.0,
      maxAllowed: 9.0,
      initialMeasured: 8.55,
      calibratedMeasured: 8.5,
      reworkAction: 'Re-seat click-stud collar and torque to nominal N·m',
      anchorOffset: [0.19, 0.18, 0.08],
    },
    {
      id: 'CP-03',
      stepId: 3,
      label: 'CP-03 Acoustic Blanket Vapor-Seam NDT',
      locationLabel: 'G537700011 Frame FR-15 Lap Joint',
      tool: 'ultrasonic_ndt',
      unit: 'dB',
      nominal: 0.95,
      minAllowed: 0.0,
      maxAllowed: 1.6,
      initialMeasured: 1.02,
      calibratedMeasured: 0.92,
      reworkAction: 'Roller-burnish Kapton vapor tape seam and re-verify',
      anchorOffset: [-0.12, -0.05, 0.11],
    },
    {
      id: 'CP-04',
      stepId: 4,
      label: 'CP-04 Harness Rail Chafe Standoff Gap',
      locationLabel: 'ABS2259A07 Clamp Station C',
      tool: 'laser_gap',
      unit: 'mm',
      nominal: 8.0,
      minAllowed: 6.5,
      maxAllowed: 9.5,
      initialMeasured: 4.2, // Intentional shop-floor chafe-gap non-conformance (KO)!
      calibratedMeasured: 8.05,
      reworkAction: 'Insert 3.8 mm NAS1149 anodized standoff shim under Clamp C',
      anchorOffset: [0.14, 0.03, 0.15],
    },
    {
      id: 'CP-05',
      stepId: 5,
      label: 'CP-05 Shear-Tie Fastener #2 Preload',
      locationLabel: 'Frame FR-15 Lower Shear Tie',
      tool: 'torque',
      unit: 'N·m',
      nominal: 18.5,
      minAllowed: 17.5,
      maxAllowed: 19.5,
      initialMeasured: 14.2, // Intentional under-torque KO anomaly!
      calibratedMeasured: 18.55,
      reworkAction: 'Execute cross-pattern digital re-torque to nominal N·m',
      anchorOffset: [-0.2, -0.16, 0.16],
    },
    {
      id: 'CP-06',
      stepId: 6,
      label: 'CP-06 Carbon-Nomex Dado Honeycomb Bond',
      locationLabel: 'Starboard Decompression Grille Frame',
      tool: 'ultrasonic_ndt',
      unit: 'dB',
      nominal: 0.85,
      minAllowed: 0.0,
      maxAllowed: 1.5,
      initialMeasured: 0.88,
      calibratedMeasured: 0.82,
      reworkAction: 'Resin-inject edge insert and re-scan Nomex bondline',
      anchorOffset: [0.22, -0.12, 0.19],
    },
  ]);

// ============================================================================
// SCENARIO 2: CFM-X90 HIGH-BYPASS TURBOFAN CORE (WO-AX90-2026)
// ============================================================================
export const WORK_ORDER_META = Object.freeze({
  workOrderId: 'WO-AX90-2026',
  engineModel: 'CFM-X90 High-Bypass Turbofan Core',
  serialNumber: 'SN-X90-0418',
  station: 'Final Aero-Mechanical Bay 04',
});

export const ASSEMBLY_STEPS: readonly AssemblyStepSpec[] = Object.freeze([
  {
    id: 1,
    code: 'STEP 01',
    canonicalCode: 'STEP-01',
    name: 'LP Titanium Spool & Main Bearing Housing',
    shortName: 'LP Spool Shaft',
    partNumber: 'PN-TF90-101',
    alloySpec: 'Ti-6Al-4V AMS-4928 Forged Titanium',
    requiredTool: 'Laser Axial Collimator',
    targetSpecLabel: 'Concentric Runout <= 0.040 mm',
    warningText:
      'WARNING: Align anodized blue No. 1 bearing journal FORWARD (+Z). Reversed shaft blocks fan spline coupling.',
    instruction:
      'Align main bearing trunnions onto gantry datum pins and seat the low-pressure spool shaft along centerline Z0.',
    requiredTorqueNm: 95.0,
    torqueMinNm: 90.0,
    torqueMaxNm: 100.0,
    modelEntityIds: [
      'ENT-TF90-LP-SHAFT',
      'ENT-TF90-FWD-BEARING',
      'ENT-TF90-AFT-BEARING',
    ],
    highlightColorHex: '#38bdf8',
    diagram: {
      okLabel: 'OK · Blue Sump Fwd (+Z)',
      okDetail: 'Spline collar faces forward fan intake',
      koLabel: 'KO · Reversed Journal',
      koDetail: 'Runout > 0.04 mm & blocked fan hub',
      metricCallout: 'Runout <= 0.040 mm · Datum Z0',
      motif: 'pin_length',
    },
    installedZ: 0.0,
    stagingOffset: [0, 0.22, 0.18],
    explodedZDelta: 0.0,
    checkpointId: 'CP-01',
  },
  {
    id: 2,
    code: 'STEP 02',
    canonicalCode: 'STEP-02',
    name: '18-Blade Wide-Chord Titanium Fan Rotor',
    shortName: 'Fan Rotor Disk',
    partNumber: 'PN-TF90-204',
    alloySpec: 'Hollow Ti-6Al-4V / Titanium Aluminide',
    requiredTool: 'Hydraulic Hub Nut Torquer',
    targetSpecLabel: 'Hub Torque 420.0 N·m (412.0–428.0 N·m)',
    warningText:
      'WARNING: Match master spline index mark #01 before torquing conical spinner locknut to 420 N·m.',
    instruction:
      'Slide the 18-blade wide-chord fan disk onto forward LP splines and torque the conical spinner retaining nut.',
    requiredTorqueNm: 420.0,
    torqueMinNm: 412.0,
    torqueMaxNm: 428.0,
    modelEntityIds: [
      'ENT-TF90-FAN-HUB',
      'ENT-TF90-FAN-BLADES',
      'ENT-TF90-SPINNER-LOCKNUT',
    ],
    highlightColorHex: '#60a5fa',
    diagram: {
      okLabel: 'OK · Index #01 Aligned',
      okDetail: 'Full spline engagement · 420 N·m',
      koLabel: 'KO · Cross-Splined',
      koDetail: 'Axial cocking & dynamic rotor imbalance',
      metricCallout: 'Torque 420 ± 8 N·m · Fwd Hub',
      motif: 'torque_star',
    },
    installedZ: 0.24,
    stagingOffset: [0, 0.04, 0.34],
    explodedZDelta: 0.34,
    checkpointId: 'CP-02',
  },
  {
    id: 3,
    code: 'STEP 03',
    canonicalCode: 'STEP-03',
    name: '5-Stage HP Axial Compressor Stator Case',
    shortName: 'HP Compressor',
    partNumber: 'PN-TF90-312',
    alloySpec: 'Inconel 718 Blisk & Variable Stator Vanes',
    requiredTool: 'Ultrasonic Case Weld Probe',
    targetSpecLabel: 'Weld Attenuation <= 2.00 dB',
    warningText:
      'WARNING: Verify VSV actuator ring clearance at 12 o’clock before seating 16 perimeter tie-bolts.',
    instruction:
      'Mate the 5-stage high-pressure compressor stator barrel to the intermediate flange and lock 16 perimeter tie-bolts.',
    requiredTorqueNm: 78.0,
    torqueMinNm: 74.0,
    torqueMaxNm: 82.0,
    modelEntityIds: [
      'ENT-TF90-HPC-BARREL',
      'ENT-TF90-VSV-RING',
      'ENT-TF90-HPC-BOLTS',
    ],
    highlightColorHex: '#fbbf24',
    diagram: {
      okLabel: 'OK · Flush Splitline',
      okDetail: 'VSV ring free · Attenuation <= 2.0 dB',
      koLabel: 'KO · Pinched VSV Ring',
      koDetail: 'Stator vane binding on spool-up',
      metricCallout: 'NDT <= 2.00 dB · 16x Tie-Bolts',
      motif: 'bracket_tab',
    },
    installedZ: 0.07,
    stagingOffset: [0, 0.24, 0.08],
    explodedZDelta: 0.14,
    checkpointId: 'CP-03',
  },
  {
    id: 4,
    code: 'STEP 04',
    canonicalCode: 'STEP-04',
    name: 'Annular Combustor Liner & 12-Nozzle Fuel Rail',
    shortName: 'Combustor Module',
    partNumber: 'PN-TF90-418',
    alloySpec: 'Inconel 625 TBC Ceramic Matrix Liner',
    requiredTool: 'Laser Optical Gap Profiler',
    targetSpecLabel: 'Flange Gap 0.15 mm (0.07–0.23 mm)',
    warningText:
      'WARNING: Check diffuser-to-liner mating seal gap! Unshimmed flange cocking exceeds 0.23 mm hot-gas limit.',
    instruction:
      'Seat the annular combustor diffuser case and connect the 12-point braided fuel manifold ring without flange cocking.',
    requiredTorqueNm: 52.0,
    torqueMinNm: 48.0,
    torqueMaxNm: 56.0,
    modelEntityIds: [
      'ENT-TF90-COMBUSTOR-LINER',
      'ENT-TF90-FUEL-MANIFOLD',
      'ENT-TF90-FUEL-NOZZLES',
    ],
    highlightColorHex: '#38bdf8',
    diagram: {
      okLabel: 'OK · Seal Gap 0.15 mm',
      okDetail: 'Uniform 360° Inconel peel-shim compression',
      koLabel: 'KO · Gap > 0.23 mm',
      koDetail: 'Hot-gas bleed & thermal liner distress',
      metricCallout: 'Gap 0.07–0.23 mm · Aft Diffuser',
      motif: 'clamp_gap',
    },
    installedZ: -0.09,
    stagingOffset: [0, 0.24, -0.08],
    explodedZDelta: -0.14,
    checkpointId: 'CP-04',
  },
  {
    id: 5,
    code: 'STEP 05',
    canonicalCode: 'STEP-05',
    name: 'Single-Crystal HP Turbine Rotor & Exhaust Cone',
    shortName: 'HP Turbine & Cone',
    partNumber: 'PN-TF90-525',
    alloySpec: 'CMSX-4 Single-Crystal Nickel Superalloy',
    requiredTool: 'Digital Angle-Sensing Torque Wrench',
    targetSpecLabel: 'Coupling Torque 160.0 N·m (154.0–166.0 N·m)',
    warningText:
      'WARNING: Torque 16 coupling bolts in strict star pattern to 160 N·m; Bolt #4 requires secondary angle verification.',
    instruction:
      'Couple the high-pressure turbine stage and tailcone to the aft combustor flange using star-pattern torque sequence.',
    requiredTorqueNm: 160.0,
    torqueMinNm: 154.0,
    torqueMaxNm: 166.0,
    modelEntityIds: [
      'ENT-TF90-HPT-BLISK',
      'ENT-TF90-EXHAUST-CONE',
      'ENT-TF90-HPT-BOLTS',
    ],
    highlightColorHex: '#34d399',
    diagram: {
      okLabel: 'OK · Star Torque 160 N·m',
      okDetail: 'Concentric HPT tip clearance verified',
      koLabel: 'KO · Bolt #4 Under-Torque',
      koDetail: '138 N·m preload causes turbine rub',
      metricCallout: 'Torque 154–166 N·m · HPT Ring',
      motif: 'torque_star',
    },
    installedZ: -0.24,
    stagingOffset: [0, 0.04, -0.34],
    explodedZDelta: -0.34,
    checkpointId: 'CP-05',
  },
  {
    id: 6,
    code: 'STEP 06',
    canonicalCode: 'STEP-06',
    name: 'Acoustic CFRP Split Nacelle & FADEC Sensor Harness',
    shortName: 'CFRP Split Nacelle',
    partNumber: 'PN-TF90-640',
    alloySpec: 'Carbon-Epoxy Acoustic Honeycomb Laminate',
    requiredTool: 'Phased-Array Ultrasonic Bond Scanner',
    targetSpecLabel: 'Bondline Echo <= 1.80 dB',
    warningText:
      'WARNING: Route Kapton FADEC harness clear of V-band cowl latches before locking port & starboard shells.',
    instruction:
      'Close port and starboard acoustic CFRP fan cowls around the core, latch V-band clamps, and terminate FADEC harness.',
    requiredTorqueNm: 28.0,
    torqueMinNm: 25.0,
    torqueMaxNm: 31.0,
    modelEntityIds: [
      'ENT-TF90-COWL-PORT',
      'ENT-TF90-COWL-STARBOARD',
      'ENT-TF90-FADEC-UNIT',
    ],
    highlightColorHex: '#a78bfa',
    diagram: {
      okLabel: 'OK · V-Band Latched',
      okDetail: 'Acoustic honeycomb echo <= 1.80 dB',
      koLabel: 'KO · Pinched Harness',
      koDetail: 'Delamination or unseated cowl latch',
      metricCallout: 'Bond <= 1.80 dB · Starboard Cowl',
      motif: 'bond_seal',
    },
    installedZ: 0.03,
    stagingOffset: [0, 0.28, 0.0],
    explodedZDelta: 0.06,
    checkpointId: 'CP-06',
  },
]);

export const INSPECTION_CHECKPOINTS: readonly InspectionCheckpointSpec[] =
  Object.freeze([
    {
      id: 'CP-01',
      stepId: 1,
      label: 'CP-01 Main Bearing Concentricity',
      locationLabel: 'No. 1 Forward Bearing Journal',
      tool: 'laser_gap',
      unit: 'mm',
      nominal: 0.02,
      minAllowed: 0.0,
      maxAllowed: 0.04,
      initialMeasured: 0.022,
      calibratedMeasured: 0.019,
      reworkAction: 'Re-index forward bearing eccentric liner ring',
      anchorOffset: [0.09, 0.11, 0.02],
    },
    {
      id: 'CP-02',
      stepId: 2,
      label: 'CP-02 Fan Hub Retaining Nut Torque',
      locationLabel: 'Forward Conical Spinner Locknut',
      tool: 'torque',
      unit: 'N·m',
      nominal: 420.0,
      minAllowed: 412.0,
      maxAllowed: 428.0,
      initialMeasured: 422.5,
      calibratedMeasured: 420.0,
      reworkAction: 'Re-torque conical hub nut to nominal N·m',
      anchorOffset: [-0.14, 0.16, 0.27],
    },
    {
      id: 'CP-03',
      stepId: 3,
      label: 'CP-03 HPC Case Seam Ultrasonic Scan',
      locationLabel: 'Stage-3 Stator Splitline Flange',
      tool: 'ultrasonic_ndt',
      unit: 'dB',
      nominal: 1.1,
      minAllowed: 0.0,
      maxAllowed: 2.0,
      initialMeasured: 1.15,
      calibratedMeasured: 1.05,
      reworkAction: 'Polish mating boss and re-verify ultrasonic coupling',
      anchorOffset: [0.18, 0.16, 0.09],
    },
    {
      id: 'CP-04',
      stepId: 4,
      label: 'CP-04 Combustor Aft Flange Gap',
      locationLabel: 'Diffuser-to-Liner Mating Seal',
      tool: 'laser_gap',
      unit: 'mm',
      nominal: 0.15,
      minAllowed: 0.07,
      maxAllowed: 0.23,
      initialMeasured: 0.34,
      calibratedMeasured: 0.15,
      reworkAction: 'Insert 0.19 mm laminated Inconel peel shim & re-seat seal',
      anchorOffset: [-0.18, 0.17, -0.09],
    },
    {
      id: 'CP-05',
      stepId: 5,
      label: 'CP-05 HPT Flange Bolt #4 Preload',
      locationLabel: 'Aft Turbine Coupling Ring',
      tool: 'torque',
      unit: 'N·m',
      nominal: 160.0,
      minAllowed: 154.0,
      maxAllowed: 166.0,
      initialMeasured: 138.0,
      calibratedMeasured: 160.2,
      reworkAction: 'Apply star-pattern digital re-torque to nominal N·m',
      anchorOffset: [0.16, 0.14, -0.23],
    },
    {
      id: 'CP-06',
      stepId: 6,
      label: 'CP-06 CFRP Nacelle Honeycomb Bond',
      locationLabel: 'Starboard Acoustic Cowl Skin',
      tool: 'ultrasonic_ndt',
      unit: 'dB',
      nominal: 0.9,
      minAllowed: 0.0,
      maxAllowed: 1.8,
      initialMeasured: 0.92,
      calibratedMeasured: 0.88,
      reworkAction: 'Vacuum-infuse resin port and re-scan acoustic panel',
      anchorOffset: [0.27, 0.09, 0.04],
    },
  ]);

export const SCENARIO_CATALOG: Readonly<Record<ScenarioId, ScenarioDefinition>> =
  Object.freeze({
    panel_buildup: {
      id: 'panel_buildup',
      title: 'Fuselage Panel Build-Up (Habillage Panneau)',
      shortTitle: 'Panel Build-Up',
      subtitle: 'Falcon 6X Bay 14 · ABS2277VV40B Pins & G537700011 Insulation',
      workOrderId: 'WO-F6X-2277',
      assetModel: 'Falcon 6X Fuselage Section FR14–FR16',
      serialNumber: 'SN-F6X-0042',
      station: 'Aerostructures Clean Bay 02',
      releaseCertificateCode: 'FAA-8130-3-F6X-2277-PASS',
      steps: PANEL_BUILDUP_STEPS,
      checkpoints: PANEL_BUILDUP_CHECKPOINTS,
    },
    turbofan_core: {
      id: 'turbofan_core',
      title: 'CFM-X90 High-Bypass Turbofan Core',
      shortTitle: 'Turbofan Core',
      subtitle: '6-Stage Rotating Spool, Combustor & CFRP Nacelle',
      workOrderId: WORK_ORDER_META.workOrderId,
      assetModel: WORK_ORDER_META.engineModel,
      serialNumber: WORK_ORDER_META.serialNumber,
      station: WORK_ORDER_META.station,
      releaseCertificateCode: 'FAA-8130-3-X90-0418-PASS',
      steps: ASSEMBLY_STEPS,
      checkpoints: INSPECTION_CHECKPOINTS,
    },
  });
