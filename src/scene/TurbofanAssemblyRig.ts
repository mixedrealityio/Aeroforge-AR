import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  ASSEMBLY_STEPS,
  INSPECTION_CHECKPOINTS,
  QC_TOOL_META,
  type AssemblyStepSpec,
  type InspectionCheckpointSpec,
  type QCStatus,
  type QCToolType,
} from '../assembly/assemblyData';
import type {
  CheckpointRuntimeState,
  PartTransformTarget,
} from '../assembly/assemblyEngine';
import type {ArEntityHighlightState} from '../services/workflowStepService';
import {EntityHighlightOverlay} from './EntityHighlightOverlay';
import {AeroMaterialLibrary} from './materials';

// Pre-allocated math scratch objects for zero-GC update loops
const _scratchDir = new THREE.Vector3();
const _scratchPos = new THREE.Vector3();

function markPassThrough(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.xb = {pointerEvents: 'none'};
  });
}

/**
 * Invisible 3D selection proxy attached to each turbofan subassembly so technicians
 * can click or pinch directly on the staged 3D part in AR space to install or focus it.
 */
export class StageHitProxy extends xb.MeshScript {
  readonly stepId: number;
  private readonly onTrigger: (stepId: number) => void;
  private readonly onHoverChange?: (stepId: number, hovered: boolean) => void;

  constructor(
    stepId: number,
    radius: number,
    length: number,
    onTrigger: (stepId: number) => void,
    onHoverChange?: (stepId: number, hovered: boolean) => void,
  ) {
    const geom = new THREE.CylinderGeometry(radius, radius, length, 16);
    geom.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    super(geom, mat);
    this.stepId = stepId;
    this.name = `Stage 0${stepId} Hit Proxy`;
    this.onTrigger = onTrigger;
    this.onHoverChange = onHoverChange;
  }

  override onObjectSelectStart(event: xb.SelectEvent): void {
    (this.material as THREE.MeshBasicMaterial).opacity = 0.14;
    event.stopPropagation();
  }

  override onObjectSelectEnd(event: xb.SelectEndEvent): void {
    (this.material as THREE.MeshBasicMaterial).opacity = 0.0;
    if (event.completed) {
      this.onTrigger(this.stepId);
    }
    event.stopPropagation();
  }

  disposeResources(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
  }
}

/**
 * Interactive 3D QC Inspection Beacon mounted at critical tolerance datums on the engine.
 */
export class CheckpointBeacon extends xb.MeshScript {
  readonly spec: InspectionCheckpointSpec;
  private readonly outerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly stemLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly onInspectClick: (cpId: string) => void;
  private isSelected = false;
  private currentStatus: QCStatus = 'pending';

  constructor(
    spec: InspectionCheckpointSpec,
    sharedSphereGeo: THREE.SphereGeometry,
    sharedRingGeo: THREE.TorusGeometry,
    onInspectClick: (cpId: string) => void,
  ) {
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    super(sharedSphereGeo, coreMat);
    this.spec = spec;
    this.name = `${spec.id} Inspection Beacon`;
    this.onInspectClick = onInspectClick;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.outerRing = new THREE.Mesh(sharedRingGeo, ringMat);
    this.outerRing.xb = {pointerEvents: 'none'};
    this.add(this.outerRing);

    const stemGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(
        -spec.anchorOffset[0] * 0.35,
        -spec.anchorOffset[1] * 0.35,
        0,
      ),
    ]);
    const stemMat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.65,
    });
    this.stemLine = new THREE.Line(stemGeo, stemMat);
    this.stemLine.xb = {pointerEvents: 'none'};
    this.add(this.stemLine);
  }

  setState(status: QCStatus, selected: boolean, installed: boolean): void {
    this.visible = installed;
    this.currentStatus = status;
    this.isSelected = selected;

    let hex = 0x38bdf8; // pending cyan
    if (status === 'pass' || status === 'reworked') {
      hex = 0x10b981; // compliant emerald
    } else if (status === 'fail') {
      hex = 0xef4444; // non-conformance crimson
    }

    (this.material as THREE.MeshBasicMaterial).color.setHex(hex);
    this.outerRing.material.color.setHex(selected ? 0xfbbf24 : hex);
    this.stemLine.material.color.setHex(selected ? 0xfbbf24 : hex);
    this.outerRing.scale.setScalar(selected ? 1.45 : 1.0);
  }

  animateBeacon(elapsed: number, cameraWorldPos: THREE.Vector3): void {
    if (!this.visible) return;
    this.outerRing.lookAt(cameraWorldPos);
    if (this.isSelected || this.currentStatus === 'fail') {
      const s = 1.3 + Math.sin(elapsed * 4.5) * 0.16;
      this.outerRing.scale.setScalar(s);
    }
  }

  override onObjectSelectStart(event: xb.SelectEvent): void {
    this.scale.setScalar(1.25);
    event.stopPropagation();
  }

  override onObjectSelectEnd(event: xb.SelectEndEvent): void {
    this.scale.setScalar(1.0);
    if (event.completed) {
      this.onInspectClick(this.spec.id);
    }
    event.stopPropagation();
  }

  disposeResources(): void {
    (this.material as THREE.Material).dispose();
    this.outerRing.material.dispose();
    this.stemLine.geometry.dispose();
    this.stemLine.material.dispose();
  }
}

interface StageVisualEntry {
  readonly spec: AssemblyStepSpec;
  readonly root: THREE.Group;
  readonly ghostGroup: THREE.Group;
  readonly proxy: StageHitProxy;
  spinGroup?: THREE.Group;
  portCowl?: THREE.Group;
  starboardCowl?: THREE.Group;
}

export class TurbofanAssemblyRig extends THREE.Group {
  readonly engineCenter = new THREE.Group();
  private readonly materials: AeroMaterialLibrary;
  private readonly stages = new Map<number, StageVisualEntry>();
  private readonly beacons = new Map<string, CheckpointBeacon>();
  private readonly entityMap = new Map<string, THREE.Object3D>();
  private readonly entityToStage = new Map<string, number>();
  private readonly entityHighlightOverlay = new EntityHighlightOverlay();
  private readonly correlationBox = new THREE.Group();
  private readonly arGuidanceGroup = new THREE.Group();
  private readonly arChevrons: THREE.Mesh[] = [];
  private readonly arDatumBeamMesh: THREE.Mesh;
  private readonly activeScanEffect = new THREE.Group();
  private readonly scanConeMesh: THREE.Mesh<
    THREE.ConeGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly scanLaserDisc: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly spinnerMat: THREE.MeshStandardMaterial;

  private readonly disposables: Array<{dispose(): void}> = [];
  private targetTurntableYaw = -1.02;
  private currentTurntableYaw = -1.02;
  private rotorAngle = 0;
  private scanPulseTimer = 0;

  constructor(
    materials: AeroMaterialLibrary,
    onStageInteract: (stepId: number) => void,
    onBeaconInteract: (cpId: string) => void,
  ) {
    super();
    this.name = 'AeroForge Turbofan Workcell';
    this.materials = materials;
    this.spinnerMat = materials.createSpinnerMaterial();

    // Position grounded workstand in front of user in world space at comfortable 3/4 profile
    this.position.set(0, 0, -1.48);
    this.rotation.y = this.currentTurntableYaw;

    // 1. Build grounded Aerospace Gantry & Calibration Workstand (y = 0 .. 1.24m)
    const gantry = this.buildWorkstandGantry();
    markPassThrough(gantry);
    this.add(gantry);

    // 2. Engine centerline mount at y = 1.24m (flush with gantry trunnion saddles)
    this.engineCenter.position.set(0, 1.24, 0);
    this.add(this.engineCenter);

    // 2b. OmniStep Real/Virtual Spatial Correlation Wireframe Box
    this.buildCorrelationFrame();
    markPassThrough(this.correlationBox);
    this.engineCenter.add(this.correlationBox);

    // 3. Build 6 composite aerospace subassemblies + holographic AR ghost targets
    for (const spec of ASSEMBLY_STEPS) {
      const solidMeshGroup = this.buildStageGeometry(spec.id);
      markPassThrough(solidMeshGroup);

      const stageRoot = new THREE.Group();
      stageRoot.name = `${spec.code} — ${spec.shortName}`;
      stageRoot.position.set(
        spec.stagingOffset[0],
        spec.stagingOffset[1],
        spec.installedZ + spec.stagingOffset[2],
      );
      stageRoot.add(solidMeshGroup);

      // Interactive hit proxy
      const [proxyRadius, proxyLen] = this.getProxyDimensions(spec.id);
      const proxy = new StageHitProxy(
        spec.id,
        proxyRadius,
        proxyLen,
        onStageInteract,
      );
      stageRoot.add(proxy);

      // Ghost wireframe + translucent shell anchored at installedZ datum
      const ghostGroup = this.buildGhostCounterpart(solidMeshGroup, spec);
      ghostGroup.position.set(0, 0, spec.installedZ);
      markPassThrough(ghostGroup);

      this.engineCenter.add(stageRoot, ghostGroup);

      const entry: StageVisualEntry = {
        spec,
        root: stageRoot,
        ghostGroup,
        proxy,
        spinGroup: solidMeshGroup.getObjectByName('RotorSpinGroup') as
          | THREE.Group
          | undefined,
        portCowl: solidMeshGroup.getObjectByName('PortNacelleCowl') as
          | THREE.Group
          | undefined,
        starboardCowl: solidMeshGroup.getObjectByName('StarboardNacelleCowl') as
          | THREE.Group
          | undefined,
      };
      this.stages.set(spec.id, entry);
    }

    // 4. Build Real-Time AR Axial Insertion Vector Chevrons & Laser Datum Beam
    const chevronGeo = this.track(new THREE.RingGeometry(0.055, 0.075, 24));
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(chevronGeo, this.materials.arChevronGuide);
      this.arChevrons.push(ring);
      this.arGuidanceGroup.add(ring);
    }
    const beamGeo = this.track(new THREE.CylinderGeometry(0.004, 0.004, 1, 8));
    beamGeo.rotateX(Math.PI / 2);
    this.arDatumBeamMesh = new THREE.Mesh(beamGeo, this.materials.arDatumBeam);
    this.arGuidanceGroup.add(this.arDatumBeamMesh);
    markPassThrough(this.arGuidanceGroup);
    this.engineCenter.add(this.arGuidanceGroup);

    // 5. Build 6 Interactive 3D QC Inspection Checkpoint Beacons
    const beaconSphereGeo = this.track(new THREE.SphereGeometry(0.018, 16, 16));
    const beaconRingGeo = this.track(
      new THREE.TorusGeometry(0.03, 0.0035, 10, 28),
    );
    for (const cpSpec of INSPECTION_CHECKPOINTS) {
      const beacon = new CheckpointBeacon(
        cpSpec,
        beaconSphereGeo,
        beaconRingGeo,
        onBeaconInteract,
      );
      beacon.position.set(
        cpSpec.anchorOffset[0],
        cpSpec.anchorOffset[1],
        cpSpec.anchorOffset[2],
      );
      this.beacons.set(cpSpec.id, beacon);
      this.engineCenter.add(beacon);
    }

    // 6. Active NDT Tool 3D Scan Visualizer (Laser Ring + Ultrasonic Beam Cone)
    const coneGeo = this.track(
      new THREE.ConeGeometry(0.055, 0.14, 20, 1, true),
    );
    coneGeo.translate(0, -0.07, 0);
    const coneMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.scanConeMesh = new THREE.Mesh(coneGeo, coneMat);

    const discGeo = this.track(new THREE.RingGeometry(0.032, 0.052, 28));
    discGeo.rotateX(-Math.PI / 2);
    this.scanLaserDisc = new THREE.Mesh(discGeo, this.materials.scanRingLaser);
    this.activeScanEffect.add(this.scanConeMesh, this.scanLaserDisc);
    this.activeScanEffect.visible = false;
    markPassThrough(this.activeScanEffect);
    this.engineCenter.add(this.activeScanEffect);

    // 7. 3D AR Entity Highlight Overlay
    this.engineCenter.add(this.entityHighlightOverlay);
  }

  rotateTurntable(deltaRad: number): void {
    this.targetTurntableYaw += deltaRad;
  }

  resetTurntable(): void {
    this.targetTurntableYaw = -1.02;
  }

  triggerScanPulse(): void {
    this.scanPulseTimer = 1.4;
  }

  syncAndAnimate(
    dt: number,
    elapsed: number,
    partTargets: readonly PartTransformTarget[],
    checkpoints: readonly CheckpointRuntimeState[],
    selectedCheckpointId: string,
    activeTool: QCToolType,
    rpmPercent: number,
    explodedFactor: number,
    correlationVisible: boolean,
    highlightState: ArEntityHighlightState,
    cameraWorldPos: THREE.Vector3,
  ): void {
    this.correlationBox.visible = correlationVisible;
    // Smoothly damp turntable orientation
    this.currentTurntableYaw = THREE.MathUtils.damp(
      this.currentTurntableYaw,
      this.targetTurntableYaw,
      7.5,
      dt,
    );
    this.rotation.y = this.currentTurntableYaw;

    // Advance rotor spin when Stage 1 or Stage 2 is installed
    const stage1Installed =
      partTargets.find((p) => p.stepId === 1)?.installed ?? false;
    if (stage1Installed && rpmPercent > 0) {
      const omega = (rpmPercent / 100) * 9.5; // rad/s visual spin
      this.rotorAngle = (this.rotorAngle + omega * dt) % (Math.PI * 2);
    }

    let activeGhostTarget: PartTransformTarget | null = null;

    // Update all 6 subassemblies with exponential damping
    for (const target of partTargets) {
      const entry = this.stages.get(target.stepId);
      if (!entry) continue;

      let stageSpotlighted = false;
      if (highlightState.enabled) {
        for (let i = 0; i < highlightState.entityIds.length; i++) {
          if (this.entityToStage.get(highlightState.entityIds[i]) === target.stepId) {
            stageSpotlighted = true;
            break;
          }
        }
      }

      const showSolid = target.visibleAsSolid || stageSpotlighted;
      entry.root.visible = showSolid;
      entry.proxy.visible = target.visibleAsSolid;
      entry.ghostGroup.visible = target.visibleAsGhost;

      if (target.visibleAsGhost) {
        activeGhostTarget = target;
      }

      if (showSolid) {
        entry.root.position.x = THREE.MathUtils.damp(
          entry.root.position.x,
          target.targetPosition[0],
          8.5,
          dt,
        );
        entry.root.position.y = THREE.MathUtils.damp(
          entry.root.position.y,
          target.targetPosition[1],
          8.5,
          dt,
        );
        entry.root.position.z = THREE.MathUtils.damp(
          entry.root.position.z,
          target.targetPosition[2],
          8.5,
          dt,
        );
      } else {
        // Snap uninstalled hidden parts to their staging start pose so when revealed they glide cleanly
        entry.root.position.set(
          target.targetPosition[0],
          target.targetPosition[1],
          target.targetPosition[2],
        );
      }

      if (entry.spinGroup && target.installed) {
        entry.spinGroup.rotation.z = this.rotorAngle;
      }

      // Split CFRP Nacelle port (-X) & starboard (+X) radial spread
      if (entry.portCowl && entry.starboardCowl) {
        const targetSpread = target.nacelleHalfSpreadX;
        entry.portCowl.position.x = THREE.MathUtils.damp(
          entry.portCowl.position.x,
          -targetSpread,
          7.5,
          dt,
        );
        entry.starboardCowl.position.x = THREE.MathUtils.damp(
          entry.starboardCowl.position.x,
          targetSpread,
          7.5,
          dt,
        );
      }
    }

    // Animate AR Ghost Insertion Vector Chevrons
    if (activeGhostTarget) {
      const entry = this.stages.get(activeGhostTarget.stepId)!;
      const startPos = entry.root.position;
      const endZ = entry.spec.installedZ;
      _scratchPos.set(0, 0, endZ);
      _scratchDir.copy(_scratchPos).sub(startPos);
      const dist = _scratchDir.length();

      if (dist > 0.025) {
        this.arGuidanceGroup.visible = true;
        this.arDatumBeamMesh.position.copy(startPos).lerp(_scratchPos, 0.5);
        this.arDatumBeamMesh.scale.set(1, 1, dist);
        this.arDatumBeamMesh.lookAt(
          this.engineCenter.localToWorld(_scratchPos.clone()),
        );

        for (let i = 0; i < this.arChevrons.length; i++) {
          const t = ((elapsed * 0.85 + i / this.arChevrons.length) % 1 + 1) % 1;
          const chev = this.arChevrons[i];
          chev.position.lerpVectors(startPos, _scratchPos, t);
          chev.scale.setScalar(1.0 - t * 0.32);
        }
      } else {
        this.arGuidanceGroup.visible = false;
      }
    } else {
      this.arGuidanceGroup.visible = false;
    }

    // Update 6 QC Checkpoint Beacons (following axial exploded offset of their parent stage)
    let selectedBeacon: CheckpointBeacon | null = null;
    for (const cpState of checkpoints) {
      const beacon = this.beacons.get(cpState.spec.id);
      const stageEntry = this.stages.get(cpState.spec.stepId);
      const pTarget = partTargets.find((t) => t.stepId === cpState.spec.stepId);
      if (!beacon || !stageEntry || !pTarget) continue;

      const isSelected = cpState.spec.id === selectedCheckpointId;
      beacon.setState(cpState.status, isSelected, pTarget.installed);

      const axialShift = stageEntry.spec.explodedZDelta * explodedFactor;
      const radialShift =
        cpState.spec.stepId === 6 ? pTarget.nacelleHalfSpreadX : 0;

      beacon.position.set(
        cpState.spec.anchorOffset[0] +
          (cpState.spec.anchorOffset[0] >= 0 ? radialShift : -radialShift),
        cpState.spec.anchorOffset[1],
        cpState.spec.anchorOffset[2] + axialShift,
      );
      beacon.animateBeacon(elapsed, cameraWorldPos);

      if (isSelected && pTarget.installed) {
        selectedBeacon = beacon;
      }
    }

    // Animate 3D NDT Laser / Ultrasonic Cone on selected installed checkpoint
    if (selectedBeacon) {
      this.activeScanEffect.visible = true;
      this.activeScanEffect.position.copy(selectedBeacon.position);
      this.activeScanEffect.position.y += 0.14;

      const toolColor = QC_TOOL_META[activeTool].accentHex;
      this.scanConeMesh.material.color.setHex(toolColor);
      this.materials.scanRingLaser.color.setHex(toolColor);

      if (this.scanPulseTimer > 0) {
        this.scanPulseTimer = Math.max(0, this.scanPulseTimer - dt);
      }
      const pulseBoost = this.scanPulseTimer > 0 ? 0.35 : 0;
      this.scanConeMesh.material.opacity =
        0.22 + pulseBoost + Math.sin(elapsed * 6) * 0.06;
      const sweepY = -0.13 + ((Math.sin(elapsed * 4.5) + 1) * 0.5) * 0.06;
      this.scanLaserDisc.position.y = sweepY;
      this.scanLaserDisc.scale.setScalar(
        0.95 + Math.sin(elapsed * 6) * 0.12 + pulseBoost * 0.3,
      );
    } else {
      this.activeScanEffect.visible = false;
    }

    this.entityHighlightOverlay.syncHighlights(
      this.engineCenter,
      this.entityMap,
      highlightState.entityIds,
      highlightState.colorHex,
      highlightState.enabled,
      elapsed,
      cameraWorldPos,
    );
  }

  private registerEntity(
    entityId: string,
    stageId: number,
    object: THREE.Object3D,
  ): void {
    this.entityMap.set(entityId, object);
    this.entityToStage.set(entityId, stageId);
  }

  private getProxyDimensions(stepId: number): [number, number] {
    switch (stepId) {
      case 1:
        return [0.1, 0.62];
      case 2:
        return [0.25, 0.16];
      case 3:
        return [0.18, 0.2];
      case 4:
        return [0.19, 0.18];
      case 5:
        return [0.18, 0.24];
      case 6:
        return [0.28, 0.56];
      default:
        return [0.2, 0.2];
    }
  }

  private buildCorrelationFrame(): void {
    const boxGeo = this.track(new THREE.BoxGeometry(0.64, 0.62, 0.78));
    const edges = this.track(new THREE.EdgesGeometry(boxGeo));
    const wire = new THREE.LineSegments(edges, this.materials.correlationWire);
    wire.position.z = 0.02;
    this.correlationBox.add(wire);

    const cornerGeo = this.track(new THREE.BoxGeometry(0.024, 0.024, 0.024));
    for (const sx of [-0.32, 0.32]) {
      for (const sy of [-0.31, 0.31]) {
        for (const sz of [-0.37, 0.41]) {
          const corner = new THREE.Mesh(cornerGeo, this.materials.arChevronGuide);
          corner.position.set(sx, sy, sz);
          this.correlationBox.add(corner);
        }
      }
    }
  }

  /**
   * Grounded aerospace assembly gantry & calibration cradle sitting flush on y = 0.
   */
  private buildWorkstandGantry(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Aerospace Calibration Gantry';

    // Soft contact shadow disc at y = 0.004 (prevents floating appearance & Z-fighting)
    const shadowGeo = this.track(new THREE.CircleGeometry(0.78, 32));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadowMesh.position.y = 0.004;
    group.add(shadowMesh);

    // Calibrated deck plate at y = 0.022
    const deckGeo = this.track(new THREE.BoxGeometry(1.04, 0.036, 0.92));
    const deckMesh = new THREE.Mesh(deckGeo, this.materials.workstandDeck);
    deckMesh.position.y = 0.022;
    group.add(deckMesh);

    // Twin heavy steel H-beam skids
    const skidGeo = this.track(new THREE.BoxGeometry(0.08, 0.06, 0.86));
    for (const x of [-0.38, 0.38]) {
      const skid = new THREE.Mesh(skidGeo, this.materials.gantrySteelDark);
      skid.position.set(x, 0.07, 0);
      group.add(skid);
    }

    // Forward & Aft vertical A-frame trunnion columns supporting engine centerline flush at y = 1.24m
    const pillarGeo = this.track(new THREE.BoxGeometry(0.052, 1.08, 0.062));
    const saddleGeo = this.track(
      new THREE.TorusGeometry(0.105, 0.016, 12, 24, Math.PI),
    );
    for (const z of [-0.18, 0.14]) {
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, this.materials.gantrySteelDark);
        pillar.position.set(side * 0.17, 0.6, z);
        pillar.rotation.z = -side * 0.08;
        group.add(pillar);
      }
      const saddle = new THREE.Mesh(saddleGeo, this.materials.gantrySafetyRail);
      saddle.position.set(0, 1.24, z);
      saddle.rotation.z = Math.PI;
      group.add(saddle);
    }

    // Longitudinal datum calibration rail at y = 0.98m
    const railGeo = this.track(
      new THREE.CylinderGeometry(0.012, 0.012, 0.76, 12),
    );
    railGeo.rotateX(Math.PI / 2);
    for (const x of [-0.17, 0.17]) {
      const rail = new THREE.Mesh(railGeo, this.materials.titaniumPolished);
      rail.position.set(x, 0.98, -0.02);
      group.add(rail);
    }

    return group;
  }

  /**
   * Builds composite 5-10 part procedural 3D aerospace models for each stage.
   */
  private buildStageGeometry(stepId: number): THREE.Group {
    switch (stepId) {
      case 1:
        return this.buildStage1Spool();
      case 2:
        return this.buildStage2FanRotor();
      case 3:
        return this.buildStage3Compressor();
      case 4:
        return this.buildStage4Combustor();
      case 5:
        return this.buildStage5Turbine();
      case 6:
        return this.buildStage6Nacelle();
      default:
        return new THREE.Group();
    }
  }

  private buildStage1Spool(): THREE.Group {
    const group = new THREE.Group();
    const spinGroup = new THREE.Group();
    spinGroup.name = 'RotorSpinGroup';

    // Stepped hollow Ti-6Al-4V LP shaft via LatheGeometry
    const shaftPoints = [
      new THREE.Vector2(0.026, -0.31),
      new THREE.Vector2(0.044, -0.28),
      new THREE.Vector2(0.044, -0.05),
      new THREE.Vector2(0.054, 0.0),
      new THREE.Vector2(0.046, 0.18),
      new THREE.Vector2(0.036, 0.29),
      new THREE.Vector2(0.022, 0.31),
    ];
    const shaftGeo = this.track(new THREE.LatheGeometry(shaftPoints, 28));
    shaftGeo.rotateX(Math.PI / 2);
    const shaftMesh = new THREE.Mesh(shaftGeo, this.materials.titaniumForged);
    spinGroup.add(shaftMesh);

    // Spline coupling collar
    const splineGeo = this.track(
      new THREE.CylinderGeometry(0.052, 0.052, 0.06, 18),
    );
    splineGeo.rotateX(Math.PI / 2);
    const splineMesh = new THREE.Mesh(
      splineGeo,
      this.materials.titaniumPolished,
    );
    splineMesh.position.z = 0.22;
    spinGroup.add(splineMesh);
    this.registerEntity('ENT-TF90-LP-SHAFT', 1, spinGroup);
    group.add(spinGroup);

    // Static No.1 & No.2 Bearing Housings + Anodized Blue Sump Collar
    const housingGeo = this.track(
      new THREE.CylinderGeometry(0.088, 0.088, 0.048, 24),
    );
    housingGeo.rotateX(Math.PI / 2);
    const fwdBearingGroup = new THREE.Group();
    const fwdBearing = new THREE.Mesh(housingGeo, this.materials.anodizedBlue);
    fwdBearing.position.z = 0.14;
    fwdBearingGroup.add(fwdBearing);

    const aftBearing = new THREE.Mesh(
      housingGeo,
      this.materials.inconelSuperalloy,
    );
    aftBearing.position.z = -0.18;
    this.registerEntity('ENT-TF90-AFT-BEARING', 1, aftBearing);
    group.add(fwdBearingGroup, aftBearing);

    // Instanced cylindrical bearing rollers (14 rollers)
    const rollerGeo = this.track(
      new THREE.CylinderGeometry(0.008, 0.008, 0.032, 10),
    );
    rollerGeo.rotateX(Math.PI / 2);
    const rollers = new THREE.InstancedMesh(
      rollerGeo,
      this.materials.titaniumPolished,
      14,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.068, Math.sin(a) * 0.068, 0.14);
      dummy.updateMatrix();
      rollers.setMatrixAt(i, dummy.matrix);
    }
    rollers.instanceMatrix.needsUpdate = true;
    rollers.computeBoundingSphere();
    rollers.computeBoundingBox();
    fwdBearingGroup.add(rollers);
    this.registerEntity('ENT-TF90-FWD-BEARING', 1, fwdBearingGroup);

    return group;
  }

  private buildStage2FanRotor(): THREE.Group {
    const group = new THREE.Group();
    const spinGroup = new THREE.Group();
    spinGroup.name = 'RotorSpinGroup';

    const fanHubGroup = new THREE.Group();
    // Forged Fan Hub Disk
    const hubGeo = this.track(new THREE.CylinderGeometry(0.09, 0.1, 0.075, 28));
    hubGeo.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, this.materials.titaniumForged);
    fanHubGroup.add(hub);

    // Conical Aerodynamic Spinner with safety spiral CanvasTexture
    const conePoints = [
      new THREE.Vector2(0.001, 0.13),
      new THREE.Vector2(0.038, 0.09),
      new THREE.Vector2(0.072, 0.04),
      new THREE.Vector2(0.09, 0.0),
    ];
    const spinnerGeo = this.track(new THREE.LatheGeometry(conePoints, 28));
    spinnerGeo.rotateX(Math.PI / 2);
    const spinner = new THREE.Mesh(spinnerGeo, this.spinnerMat);
    spinner.position.z = 0.036;
    fanHubGroup.add(spinner);
    this.registerEntity('ENT-TF90-FAN-HUB', 2, fanHubGroup);
    spinGroup.add(fanHubGroup);

    // Anodized Hub Retaining Locknut
    const nutGeo = this.track(new THREE.CylinderGeometry(0.03, 0.034, 0.024, 6));
    nutGeo.rotateX(Math.PI / 2);
    const nut = new THREE.Mesh(nutGeo, this.materials.anodizedBlue);
    nut.position.z = 0.045;
    this.registerEntity('ENT-TF90-SPINNER-LOCKNUT', 2, nut);
    spinGroup.add(nut);

    // 18 Wide-Chord Airfoil Fan Blades via ExtrudeGeometry + InstancedMesh
    const airfoil = new THREE.Shape();
    airfoil.moveTo(-0.028, 0);
    airfoil.quadraticCurveTo(0.0, 0.011, 0.032, 0.002);
    airfoil.quadraticCurveTo(0.0, -0.005, -0.028, 0);

    const bladeGeo = this.track(
      new THREE.ExtrudeGeometry(airfoil, {
        steps: 1,
        depth: 0.145,
        bevelEnabled: true,
        bevelThickness: 0.002,
        bevelSize: 0.002,
        bevelSegments: 2,
      }),
    );
    // Orient blade span radially along +Y, chord pitched 34 deg
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateY(0.58);

    const bladeCount = 18;
    const blades = new THREE.InstancedMesh(
      bladeGeo,
      this.materials.titaniumPolished,
      bladeCount,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < bladeCount; i++) {
      const angle = (i / bladeCount) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * 0.084, Math.sin(angle) * 0.084, 0);
      dummy.rotation.set(0, 0, angle - Math.PI / 2);
      dummy.updateMatrix();
      blades.setMatrixAt(i, dummy.matrix);
    }
    blades.instanceMatrix.needsUpdate = true;
    blades.computeBoundingSphere();
    blades.computeBoundingBox();
    this.registerEntity('ENT-TF90-FAN-BLADES', 2, blades);
    spinGroup.add(blades);

    group.add(spinGroup);

    // Outer Kevlar/Titanium Fan Containment Ring
    const shroudGeo = this.track(
      new THREE.CylinderGeometry(0.242, 0.236, 0.09, 36, 1, true),
    );
    shroudGeo.rotateX(Math.PI / 2);
    const shroud = new THREE.Mesh(shroudGeo, this.materials.inconelSuperalloy);
    group.add(shroud);

    return group;
  }

  private buildStage3Compressor(): THREE.Group {
    const group = new THREE.Group();
    const barrelGroup = new THREE.Group();

    // Tapered 5-stage HP Compressor Barrel via LatheGeometry
    const barrelPts = [
      new THREE.Vector2(0.175, -0.085),
      new THREE.Vector2(0.155, -0.04),
      new THREE.Vector2(0.162, 0.02),
      new THREE.Vector2(0.182, 0.085),
    ];
    const barrelGeo = this.track(new THREE.LatheGeometry(barrelPts, 32));
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, this.materials.inconelSuperalloy);
    barrelGroup.add(barrel);

    // Variable Stator Vane Actuator Ring
    const ringGeo = this.track(new THREE.TorusGeometry(0.172, 0.008, 10, 32));
    const actuatorRing = new THREE.Mesh(ringGeo, this.materials.anodizedAmber);
    actuatorRing.position.z = 0.015;
    this.registerEntity('ENT-TF90-VSV-RING', 3, actuatorRing);
    group.add(actuatorRing);

    // Forward & Aft Mating Flanges
    const flangeGeo = this.track(new THREE.RingGeometry(0.145, 0.192, 32));
    const fwdFlange = new THREE.Mesh(flangeGeo, this.materials.titaniumForged);
    fwdFlange.position.z = 0.085;
    const aftFlange = new THREE.Mesh(flangeGeo, this.materials.titaniumForged);
    aftFlange.position.z = -0.085;
    aftFlange.rotation.y = Math.PI;
    barrelGroup.add(fwdFlange, aftFlange);

    // 24 Stator Vanes + 16 Flange Tie-Bolts via InstancedMesh
    const vaneGeo = this.track(new THREE.BoxGeometry(0.005, 0.055, 0.022));
    const vanes = new THREE.InstancedMesh(
      vaneGeo,
      this.materials.titaniumPolished,
      24,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0.075);
      dummy.rotation.set(0.35, 0, a - Math.PI / 2);
      dummy.updateMatrix();
      vanes.setMatrixAt(i, dummy.matrix);
    }
    vanes.instanceMatrix.needsUpdate = true;
    vanes.computeBoundingSphere();
    vanes.computeBoundingBox();
    barrelGroup.add(vanes);
    this.registerEntity('ENT-TF90-HPC-BARREL', 3, barrelGroup);
    group.add(barrelGroup);

    const boltGeo = this.track(
      new THREE.CylinderGeometry(0.005, 0.005, 0.022, 6),
    );
    boltGeo.rotateX(Math.PI / 2);
    const bolts = new THREE.InstancedMesh(
      boltGeo,
      this.materials.titaniumPolished,
      16,
    );
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.182, Math.sin(a) * 0.182, 0.085);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bolts.setMatrixAt(i, dummy.matrix);
    }
    bolts.instanceMatrix.needsUpdate = true;
    bolts.computeBoundingSphere();
    bolts.computeBoundingBox();
    this.registerEntity('ENT-TF90-HPC-BOLTS', 3, bolts);
    group.add(bolts);

    return group;
  }

  private buildStage4Combustor(): THREE.Group {
    const group = new THREE.Group();
    const linerGroup = new THREE.Group();

    // Ceramic-coated Annular Combustor Chamber
    const linerGeo = this.track(
      new THREE.CylinderGeometry(0.168, 0.174, 0.145, 32),
    );
    linerGeo.rotateX(Math.PI / 2);
    const liner = new THREE.Mesh(linerGeo, this.materials.ceramicLinerMatte);
    linerGroup.add(liner);

    // Aft Inconel Diffuser Flange
    const aftFlangeGeo = this.track(
      new THREE.TorusGeometry(0.175, 0.011, 12, 32),
    );
    const aftFlange = new THREE.Mesh(
      aftFlangeGeo,
      this.materials.inconelSuperalloy,
    );
    aftFlange.position.z = -0.07;
    linerGroup.add(aftFlange);
    this.registerEntity('ENT-TF90-COMBUSTOR-LINER', 4, linerGroup);
    group.add(linerGroup);

    // 360-deg Braided Fuel Manifold Ring
    const fuelRailGeo = this.track(
      new THREE.TorusGeometry(0.192, 0.007, 10, 36),
    );
    const fuelRail = new THREE.Mesh(
      fuelRailGeo,
      this.materials.titaniumPolished,
    );
    fuelRail.position.z = 0.025;
    this.registerEntity('ENT-TF90-FUEL-MANIFOLD', 4, fuelRail);
    group.add(fuelRail);

    // 12 Anodized Blue Fuel Injector Nozzles via InstancedMesh
    const nozzleGeo = this.track(
      new THREE.CylinderGeometry(0.009, 0.007, 0.036, 10),
    );
    const nozzles = new THREE.InstancedMesh(
      nozzleGeo,
      this.materials.anodizedBlue,
      12,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.025);
      dummy.rotation.set(0, 0, a - Math.PI / 2);
      dummy.updateMatrix();
      nozzles.setMatrixAt(i, dummy.matrix);
    }
    nozzles.instanceMatrix.needsUpdate = true;
    nozzles.computeBoundingSphere();
    nozzles.computeBoundingBox();
    this.registerEntity('ENT-TF90-FUEL-NOZZLES', 4, nozzles);
    group.add(nozzles);

    return group;
  }

  private buildStage5Turbine(): THREE.Group {
    const group = new THREE.Group();
    const spinGroup = new THREE.Group();
    spinGroup.name = 'RotorSpinGroup';

    // CMSX-4 Single-Crystal HPT Rotor Blisk (24 gold-nickel blades)
    const diskGeo = this.track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 28));
    diskGeo.rotateX(Math.PI / 2);
    const disk = new THREE.Mesh(
      diskGeo,
      this.materials.singleCrystalGoldNickel,
    );
    disk.position.z = 0.05;
    spinGroup.add(disk);

    const hptBladeGeo = this.track(new THREE.BoxGeometry(0.006, 0.058, 0.028));
    const hptBlades = new THREE.InstancedMesh(
      hptBladeGeo,
      this.materials.singleCrystalGoldNickel,
      24,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.132, Math.sin(a) * 0.132, 0.05);
      dummy.rotation.set(-0.42, 0, a - Math.PI / 2);
      dummy.updateMatrix();
      hptBlades.setMatrixAt(i, dummy.matrix);
    }
    hptBlades.instanceMatrix.needsUpdate = true;
    hptBlades.computeBoundingSphere();
    hptBlades.computeBoundingBox();
    spinGroup.add(hptBlades);
    this.registerEntity('ENT-TF90-HPT-BLISK', 5, spinGroup);
    group.add(spinGroup);

    const exhaustGroup = new THREE.Group();
    // Turbine Outer Case Shroud
    const shroudGeo = this.track(
      new THREE.CylinderGeometry(0.155, 0.172, 0.12, 32, 1, true),
    );
    shroudGeo.rotateX(Math.PI / 2);
    const shroud = new THREE.Mesh(shroudGeo, this.materials.inconelSuperalloy);
    shroud.position.z = 0.03;
    exhaustGroup.add(shroud);

    // Acoustic Exhaust Tailcone via LatheGeometry
    const tailPts = [
      new THREE.Vector2(0.002, -0.17),
      new THREE.Vector2(0.055, -0.09),
      new THREE.Vector2(0.108, 0.01),
    ];
    const tailGeo = this.track(new THREE.LatheGeometry(tailPts, 28));
    tailGeo.rotateX(Math.PI / 2);
    const tailCone = new THREE.Mesh(tailGeo, this.materials.titaniumForged);
    tailCone.position.z = -0.01;
    exhaustGroup.add(tailCone);
    this.registerEntity('ENT-TF90-EXHAUST-CONE', 5, exhaustGroup);
    group.add(exhaustGroup);

    // 16 HPT Coupling Ring Bolts via InstancedMesh
    const boltGeo = this.track(
      new THREE.CylinderGeometry(0.005, 0.005, 0.022, 6),
    );
    boltGeo.rotateX(Math.PI / 2);
    const bolts = new THREE.InstancedMesh(
      boltGeo,
      this.materials.anodizedAmber,
      16,
    );
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.168, Math.sin(a) * 0.168, 0.088);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bolts.setMatrixAt(i, dummy.matrix);
    }
    bolts.instanceMatrix.needsUpdate = true;
    bolts.computeBoundingSphere();
    bolts.computeBoundingBox();
    this.registerEntity('ENT-TF90-HPT-BOLTS', 5, bolts);
    group.add(bolts);

    return group;
  }

  private buildStage6Nacelle(): THREE.Group {
    const group = new THREE.Group();

    // Port (-X) and Starboard (+X) curved split CFRP cowls (openable for Cutaway inspection)
    const halfArc = Math.PI * 0.88;
    const outerSkinGeo = this.track(
      new THREE.CylinderGeometry(
        0.268,
        0.246,
        0.52,
        28,
        1,
        true,
        0.06 * Math.PI,
        halfArc,
      ),
    );
    outerSkinGeo.rotateX(Math.PI / 2);

    const innerAcousticGeo = this.track(
      new THREE.CylinderGeometry(
        0.258,
        0.238,
        0.48,
        24,
        1,
        true,
        0.06 * Math.PI,
        halfArc,
      ),
    );
    innerAcousticGeo.rotateX(Math.PI / 2);

    // Starboard (+X) Cowl Half
    const starboardCowl = new THREE.Group();
    starboardCowl.name = 'StarboardNacelleCowl';
    const starboardShell = new THREE.Group();
    const stbdOuter = new THREE.Mesh(
      outerSkinGeo,
      this.materials.carbonCompositeCowl,
    );
    const stbdInner = new THREE.Mesh(
      innerAcousticGeo,
      this.materials.acousticHoneycombInner,
    );
    starboardShell.add(stbdOuter, stbdInner);
    starboardCowl.add(starboardShell);

    // FADEC Electronic Control Box & Sensor Harness Conduit mounted on Starboard Cowl
    const fadecGroup = new THREE.Group();
    const fadecGeo = this.track(new THREE.BoxGeometry(0.042, 0.085, 0.13));
    const fadecBox = new THREE.Mesh(fadecGeo, this.materials.titaniumForged);
    fadecBox.position.set(0.272, 0.04, 0.02);
    fadecGroup.add(fadecBox);

    const harnessCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.268, 0.06, 0.08),
      new THREE.Vector3(0.276, 0.12, 0.0),
      new THREE.Vector3(0.258, 0.15, -0.14),
    ]);
    const harnessGeo = this.track(
      new THREE.TubeGeometry(harnessCurve, 20, 0.006, 8, false),
    );
    const harnessMesh = new THREE.Mesh(harnessGeo, this.materials.anodizedAmber);
    fadecGroup.add(harnessMesh);
    this.registerEntity('ENT-TF90-FADEC-UNIT', 6, fadecGroup);
    starboardCowl.add(fadecGroup);

    // Port (-X) Cowl Half (mirrored rotation around Z)
    const portCowl = new THREE.Group();
    const portOuter = new THREE.Mesh(
      outerSkinGeo,
      this.materials.carbonCompositeCowl,
    );
    portOuter.rotation.z = Math.PI;
    const portInner = new THREE.Mesh(
      innerAcousticGeo,
      this.materials.acousticHoneycombInner,
    );
    portInner.rotation.z = Math.PI;
    portCowl.add(portOuter, portInner);

    // Polished Titanium Aerodynamic Inlet Lip Ring on forward cowl edge
    const lipGeo = this.track(
      new THREE.TorusGeometry(0.262, 0.014, 12, 24, halfArc),
    );
    const stbdLip = new THREE.Mesh(lipGeo, this.materials.titaniumPolished);
    stbdLip.position.z = 0.26;
    stbdLip.rotation.z = -Math.PI * 0.44;
    starboardShell.add(stbdLip);
    this.registerEntity('ENT-TF90-COWL-STARBOARD', 6, starboardShell);

    const portLip = new THREE.Mesh(lipGeo, this.materials.titaniumPolished);
    portLip.position.z = 0.26;
    portLip.rotation.z = Math.PI * 0.56;
    portCowl.add(portLip);
    this.registerEntity('ENT-TF90-COWL-PORT', 6, portCowl);
    portCowl.name = 'PortNacelleCowl';

    group.add(starboardCowl, portCowl);
    return group;
  }

  /**
   * Creates a lightweight holographic AR alignment silhouette + edge wireframe
   * showing where the active subassembly seats along the engine datum.
   */
  private buildGhostCounterpart(
    _source: THREE.Group,
    spec: AssemblyStepSpec,
  ): THREE.Group {
    const ghost = new THREE.Group();
    ghost.name = `${spec.code} AR Ghost Target`;

    const [radius, length] = this.getProxyDimensions(spec.id);
    const shellGeo = this.track(
      new THREE.CylinderGeometry(radius * 0.96, radius * 0.92, length * 0.9, 24, 1, true),
    );
    shellGeo.rotateX(Math.PI / 2);

    const shell = new THREE.Mesh(shellGeo, this.materials.arGhostSolid);
    const edgesGeo = this.track(new THREE.EdgesGeometry(shellGeo, 18));
    const wire = new THREE.LineSegments(edgesGeo, this.materials.arGhostWire);

    // Datum alignment ring
    const ringGeo = this.track(
      new THREE.RingGeometry(radius * 0.94, radius * 1.03, 32),
    );
    const fwdRing = new THREE.Mesh(ringGeo, this.materials.arChevronGuide);
    fwdRing.position.z = length * 0.45;
    const aftRing = new THREE.Mesh(ringGeo, this.materials.arChevronGuide);
    aftRing.position.z = -length * 0.45;

    ghost.add(shell, wire, fwdRing, aftRing);
    ghost.visible = false;
    return ghost;
  }

  private track<T extends {dispose(): void}>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  dispose(): void {
    this.entityHighlightOverlay.dispose();
    for (const stage of this.stages.values()) {
      stage.proxy.disposeResources();
    }
    for (const beacon of this.beacons.values()) {
      beacon.disposeResources();
    }
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables.length = 0;
  }
}
