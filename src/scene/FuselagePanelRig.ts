import * as THREE from 'three';

import {
  PANEL_BUILDUP_CHECKPOINTS,
  PANEL_BUILDUP_STEPS,
  QC_TOOL_META,
  type AssemblyStepSpec,
  type QCToolType,
} from '../assembly/assemblyData';
import type {
  CheckpointRuntimeState,
  PartTransformTarget,
} from '../assembly/assemblyEngine';
import type {ArEntityHighlightState} from '../services/workflowStepService';
import {EntityHighlightOverlay} from './EntityHighlightOverlay';
import {AeroMaterialLibrary} from './materials';
import {CheckpointBeacon, StageHitProxy} from './TurbofanAssemblyRig';

const _scratchDir = new THREE.Vector3();
const _scratchPos = new THREE.Vector3();

function markPassThrough(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.xb = {pointerEvents: 'none'};
  });
}

const PIN_COORDS: ReadonlyArray<readonly [number, number]> = [
  [-0.27, 0.16],
  [-0.09, 0.16],
  [0.09, 0.16],
  [0.27, 0.16],
  [-0.27, -0.14],
  [-0.09, -0.14],
  [0.09, -0.14],
  [0.27, -0.14],
];

interface PanelStageEntry {
  readonly spec: AssemblyStepSpec;
  readonly root: THREE.Group;
  readonly ghostGroup: THREE.Group;
  readonly proxy: StageHitProxy;
  portDado?: THREE.Group;
  starboardDado?: THREE.Group;
}

/**
 * 3D Aircraft Fuselage Panel Build-Up Workcell ("Habillage Panneau" — Falcon 6X Bay 14),
 * reproducing the OmniStep mixed-reality pin/bracket/insulation/clamp/dado mounting workflow
 * and 3D Real/Virtual Correlation alignment frame.
 */
export class FuselagePanelRig extends THREE.Group {
  readonly panelCenter = new THREE.Group();
  private readonly materials: AeroMaterialLibrary;
  private readonly stages = new Map<number, PanelStageEntry>();
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

  private readonly disposables: Array<{dispose(): void}> = [];
  private targetTurntableYaw = -0.18;
  private currentTurntableYaw = -0.18;
  private scanPulseTimer = 0;

  constructor(
    materials: AeroMaterialLibrary,
    onStageInteract: (stepId: number) => void,
    onBeaconInteract: (cpId: string) => void,
  ) {
    super();
    this.name = 'OmniStep Fuselage Panel Workcell';
    this.materials = materials;

    this.position.set(0, 0, -1.46);
    this.rotation.y = this.currentTurntableYaw;

    // 1. Grounded Aircraft Panel Fixture & Fuselage Skin Section (y = 0 .. 1.62m)
    const fixture = this.buildFuselageFixture();
    markPassThrough(fixture);
    this.add(fixture);

    // 2. Panel build-up datum center at y = 1.24m
    this.panelCenter.position.set(0, 1.24, 0);
    this.add(this.panelCenter);

    // 3. OmniStep Real/Virtual Spatial Correlation Wireframe Box
    this.buildCorrelationFrame();
    markPassThrough(this.correlationBox);
    this.panelCenter.add(this.correlationBox);

    // 4. Build 6 Fuselage Panel Build-Up Stages + Holographic AR Ghosts
    for (const spec of PANEL_BUILDUP_STEPS) {
      const solidGroup = this.buildPanelStageGeometry(spec.id);
      markPassThrough(solidGroup);

      const stageRoot = new THREE.Group();
      stageRoot.name = `${spec.code} — ${spec.partNumber}`;
      stageRoot.position.set(
        spec.stagingOffset[0],
        spec.stagingOffset[1],
        spec.installedZ + spec.stagingOffset[2],
      );
      stageRoot.add(solidGroup);

      const proxy = new StageHitProxy(
        spec.id,
        0.34,
        0.16,
        onStageInteract,
      );
      stageRoot.add(proxy);

      const ghostGroup = this.buildPanelGhost(spec);
      ghostGroup.position.set(0, 0, spec.installedZ);
      markPassThrough(ghostGroup);

      this.panelCenter.add(stageRoot, ghostGroup);

      this.stages.set(spec.id, {
        spec,
        root: stageRoot,
        ghostGroup,
        proxy,
        portDado: solidGroup.getObjectByName('PortDadoLeaf') as
          | THREE.Group
          | undefined,
        starboardDado: solidGroup.getObjectByName('StarboardDadoLeaf') as
          | THREE.Group
          | undefined,
      });
    }

    // 5. Animated AR Insertion Vector Chevrons
    const chevronGeo = this.track(new THREE.RingGeometry(0.042, 0.06, 24));
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
    this.panelCenter.add(this.arGuidanceGroup);

    // 6. 6 Interactive QC Checkpoints
    const beaconSphereGeo = this.track(new THREE.SphereGeometry(0.018, 16, 16));
    const beaconRingGeo = this.track(
      new THREE.TorusGeometry(0.03, 0.0035, 10, 28),
    );
    for (const cpSpec of PANEL_BUILDUP_CHECKPOINTS) {
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
      this.panelCenter.add(beacon);
    }

    // 7. NDT Scan Cone & Laser Ring
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
    this.panelCenter.add(this.activeScanEffect);

    // 8. 3D AR Entity Highlight Overlay
    this.panelCenter.add(this.entityHighlightOverlay);
  }

  rotateTurntable(deltaRad: number): void {
    this.targetTurntableYaw += deltaRad;
  }

  resetTurntable(): void {
    this.targetTurntableYaw = -0.18;
  }

  triggerScanPulse(): void {
    this.scanPulseTimer = 1.4;
  }

  setCorrelationVisible(visible: boolean): void {
    this.correlationBox.visible = visible;
  }

  syncAndAnimate(
    dt: number,
    elapsed: number,
    partTargets: readonly PartTransformTarget[],
    checkpoints: readonly CheckpointRuntimeState[],
    selectedCheckpointId: string,
    activeTool: QCToolType,
    explodedFactor: number,
    correlationVisible: boolean,
    highlightState: ArEntityHighlightState,
    cameraWorldPos: THREE.Vector3,
  ): void {
    this.correlationBox.visible = correlationVisible;
    this.currentTurntableYaw = THREE.MathUtils.damp(
      this.currentTurntableYaw,
      this.targetTurntableYaw,
      7.5,
      dt,
    );
    this.rotation.y = this.currentTurntableYaw;

    let activeGhostTarget: PartTransformTarget | null = null;

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
        entry.root.position.set(
          target.targetPosition[0],
          target.targetPosition[1],
          target.targetPosition[2],
        );
      }

      if (entry.portDado && entry.starboardDado) {
        const spread = target.nacelleHalfSpreadX;
        entry.portDado.position.x = THREE.MathUtils.damp(
          entry.portDado.position.x,
          -spread,
          7.5,
          dt,
        );
        entry.starboardDado.position.x = THREE.MathUtils.damp(
          entry.starboardDado.position.x,
          spread,
          7.5,
          dt,
        );
      }
    }

    if (activeGhostTarget) {
      const entry = this.stages.get(activeGhostTarget.stepId)!;
      const startPos = entry.root.position;
      _scratchPos.set(0, 0, entry.spec.installedZ);
      _scratchDir.copy(_scratchPos).sub(startPos);
      const dist = _scratchDir.length();

      if (dist > 0.025) {
        this.arGuidanceGroup.visible = true;
        this.arDatumBeamMesh.position.copy(startPos).lerp(_scratchPos, 0.5);
        this.arDatumBeamMesh.scale.set(1, 1, dist);
        this.arDatumBeamMesh.lookAt(
          this.panelCenter.localToWorld(_scratchPos.clone()),
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
      this.scanLaserDisc.position.y =
        -0.13 + ((Math.sin(elapsed * 4.5) + 1) * 0.5) * 0.06;
    } else {
      this.activeScanEffect.visible = false;
    }

    this.entityHighlightOverlay.syncHighlights(
      this.panelCenter,
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
    object.name = entityId;
    this.entityMap.set(entityId, object);
    this.entityToStage.set(entityId, stageId);
  }

  private buildCorrelationFrame(): void {
    const boxGeo = this.track(new THREE.BoxGeometry(0.84, 0.64, 0.32));
    const edges = this.track(new THREE.EdgesGeometry(boxGeo));
    const wire = new THREE.LineSegments(edges, this.materials.correlationWire);
    wire.position.z = 0.09;
    this.correlationBox.add(wire);

    // 8 Bright Corner Alignment Fiducials
    const cornerGeo = this.track(new THREE.BoxGeometry(0.026, 0.026, 0.026));
    for (const sx of [-0.42, 0.42]) {
      for (const sy of [-0.32, 0.32]) {
        for (const sz of [-0.07, 0.25]) {
          const corner = new THREE.Mesh(cornerGeo, this.materials.arChevronGuide);
          corner.position.set(sx, sy, sz);
          this.correlationBox.add(corner);
        }
      }
    }
  }

  private buildFuselageFixture(): THREE.Group {
    const group = new THREE.Group();

    // Soft contact shadow disc on shop floor (y = 0.004)
    const shadowGeo = this.track(new THREE.CircleGeometry(0.82, 32));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.004;
    group.add(shadow);

    // Calibrated fixture baseplate (y = 0.022)
    const deckGeo = this.track(new THREE.BoxGeometry(1.08, 0.036, 0.78));
    const deck = new THREE.Mesh(deckGeo, this.materials.workstandDeck);
    deck.position.y = 0.022;
    group.add(deck);

    // Vertical jig stanchions supporting the curved aircraft fuselage section at y = 1.24m
    const postGeo = this.track(new THREE.BoxGeometry(0.055, 1.18, 0.055));
    for (const x of [-0.4, 0.4]) {
      const post = new THREE.Mesh(postGeo, this.materials.gantrySteelDark);
      post.position.set(x, 0.62, -0.04);
      group.add(post);
    }

    // Concave Aircraft Fuselage Skin Section (Radius 1.35m arc)
    const skinArc = 0.62;
    const skinGeo = this.track(
      new THREE.CylinderGeometry(
        1.35,
        1.35,
        0.58,
        32,
        1,
        true,
        Math.PI - skinArc / 2,
        skinArc,
      ),
    );
    const skinGroup = new THREE.Group();
    skinGroup.position.set(0, 1.24, 1.35);

    const outerAlum = new THREE.Mesh(skinGeo, this.materials.titaniumForged);
    outerAlum.position.z = -0.006;
    const innerPrimer = new THREE.Mesh(
      skinGeo,
      this.materials.fuselagePrimerGreen,
    );
    skinGroup.add(outerAlum, innerPrimer);
    group.add(skinGroup);

    // 3 Circumferential Fuselage C-Frames (FR-14, FR-15, FR-16) & 3 Horizontal Stringers
    const frameGeo = this.track(new THREE.BoxGeometry(0.028, 0.58, 0.045));
    for (const x of [-0.36, 0, 0.36]) {
      const frame = new THREE.Mesh(frameGeo, this.materials.fuselagePrimerGreen);
      frame.position.set(x, 1.24, 0.02 + Math.abs(x) * 0.06);
      group.add(frame);
    }

    const stringerGeo = this.track(new THREE.BoxGeometry(0.8, 0.024, 0.032));
    for (const y of [1.01, 1.24, 1.47]) {
      const stringer = new THREE.Mesh(
        stringerGeo,
        this.materials.titaniumForged,
      );
      stringer.position.set(0, y, 0.025);
      group.add(stringer);
    }

    return group;
  }

  private buildPanelStageGeometry(stepId: number): THREE.Group {
    switch (stepId) {
      case 1:
        return this.buildStep1BondingPins();
      case 2:
        return this.buildStep2ClickBrackets();
      case 3:
        return this.buildStep3AcousticBlanket();
      case 4:
        return this.buildStep4HarnessRail();
      case 5:
        return this.buildStep5LockingWashers();
      case 6:
        return this.buildStep6CarbonDadoPanel();
      default:
        return new THREE.Group();
    }
  }

  private buildStep1BondingPins(): THREE.Group {
    const group = new THREE.Group();
    const baseGeo = this.track(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 16));
    baseGeo.rotateX(Math.PI / 2);
    const shaftGeo = this.track(
      new THREE.CylinderGeometry(0.004, 0.004, 0.075, 10),
    );
    shaftGeo.rotateX(Math.PI / 2);

    const bases = new THREE.InstancedMesh(
      baseGeo,
      this.materials.titaniumPolished,
      PIN_COORDS.length,
    );
    const shafts = new THREE.InstancedMesh(
      shaftGeo,
      this.materials.anodizedAmber,
      PIN_COORDS.length,
    );

    const dummy = new THREE.Object3D();
    PIN_COORDS.forEach(([px, py], i) => {
      dummy.position.set(px, py, 0);
      dummy.updateMatrix();
      bases.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, py, 0.038);
      dummy.updateMatrix();
      shafts.setMatrixAt(i, dummy.matrix);
    });
    bases.instanceMatrix.needsUpdate = true;
    bases.computeBoundingSphere();
    bases.computeBoundingBox();
    shafts.instanceMatrix.needsUpdate = true;
    shafts.computeBoundingSphere();
    shafts.computeBoundingBox();

    this.registerEntity('ENT-F6X-PIN-BASES', 1, bases);
    this.registerEntity('ENT-F6X-PINS-40MM', 1, shafts);
    group.add(bases, shafts);
    return group;
  }

  private buildStep2ClickBrackets(): THREE.Group {
    const group = new THREE.Group();
    const bodiesGroup = new THREE.Group();
    const tabsGroup = new THREE.Group();
    const bodyGeo = this.track(new THREE.BoxGeometry(0.044, 0.048, 0.036));
    const tabGeo = this.track(new THREE.BoxGeometry(0.026, 0.024, 0.012));

    const coords: Array<[number, number]> = [
      [-0.22, 0.21],
      [0, 0.21],
      [0.22, 0.21],
      [-0.22, -0.02],
      [0, -0.02],
      [0.22, -0.02],
    ];
    for (const [bx, by] of coords) {
      const body = new THREE.Mesh(bodyGeo, this.materials.anodizedBlue);
      body.position.set(bx, by, 0);
      bodiesGroup.add(body);
      const tab = new THREE.Mesh(tabGeo, this.materials.titaniumPolished);
      tab.position.set(bx, by + 0.032, 0.01);
      tabsGroup.add(tab);
    }
    this.registerEntity('ENT-F6X-CLICK-BRACKETS', 2, bodiesGroup);
    this.registerEntity('ENT-F6X-BRACKET-TABS', 2, tabsGroup);
    group.add(bodiesGroup, tabsGroup);
    return group;
  }

  private buildStep3AcousticBlanket(): THREE.Group {
    const group = new THREE.Group();
    const quiltGeo = this.track(new THREE.BoxGeometry(0.72, 0.48, 0.034));
    const quilt = new THREE.Mesh(quiltGeo, this.materials.kaptonGoldFoil);
    this.registerEntity('ENT-F6X-KAPTON-BLANKET', 3, quilt);
    group.add(quilt);

    const vaporTapesGroup = new THREE.Group();
    // Metallic seam tape strips & grommet rings
    const tapeVGeo = this.track(new THREE.BoxGeometry(0.018, 0.484, 0.037));
    for (const tx of [-0.18, 0.18]) {
      const tape = new THREE.Mesh(tapeVGeo, this.materials.titaniumPolished);
      tape.position.x = tx;
      vaporTapesGroup.add(tape);
    }

    const grommetGeo = this.track(new THREE.RingGeometry(0.008, 0.018, 16));
    for (const [px, py] of PIN_COORDS) {
      const grommet = new THREE.Mesh(
        grommetGeo,
        this.materials.inconelSuperalloy,
      );
      grommet.position.set(px, py, 0.019);
      vaporTapesGroup.add(grommet);
    }
    this.registerEntity('ENT-F6X-VAPOR-TAPES', 3, vaporTapesGroup);
    group.add(vaporTapesGroup);
    return group;
  }

  private buildStep4HarnessRail(): THREE.Group {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36, 0.04, 0),
      new THREE.Vector3(-0.12, 0.02, 0.012),
      new THREE.Vector3(0.14, 0.03, 0.012),
      new THREE.Vector3(0.36, 0.05, 0),
    ]);
    const bundleGeo = this.track(
      new THREE.TubeGeometry(curve, 24, 0.014, 10, false),
    );
    const bundle = new THREE.Mesh(bundleGeo, this.materials.ceramicLinerMatte);
    this.registerEntity('ENT-F6X-HARNESS-BUNDLE', 4, bundle);
    group.add(bundle);

    const clampsGroup = new THREE.Group();
    const clampGeo = this.track(new THREE.TorusGeometry(0.02, 0.006, 10, 20));
    for (const cx of [-0.24, -0.08, 0.12, 0.26]) {
      const clamp = new THREE.Mesh(clampGeo, this.materials.anodizedBlue);
      clamp.position.set(cx, 0.03, 0.01);
      clamp.rotation.y = Math.PI / 2;
      clampsGroup.add(clamp);
    }
    this.registerEntity('ENT-F6X-PCLAMPS', 4, clampsGroup);
    group.add(clampsGroup);
    return group;
  }

  private buildStep5LockingWashers(): THREE.Group {
    const group = new THREE.Group();
    const capGeo = this.track(new THREE.CylinderGeometry(0.015, 0.019, 0.012, 16));
    capGeo.rotateX(Math.PI / 2);
    const caps = new THREE.InstancedMesh(
      capGeo,
      this.materials.anodizedBlue,
      PIN_COORDS.length,
    );
    const dummy = new THREE.Object3D();
    PIN_COORDS.forEach(([px, py], i) => {
      dummy.position.set(px, py, 0);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    });
    caps.instanceMatrix.needsUpdate = true;
    caps.computeBoundingSphere();
    caps.computeBoundingBox();
    this.registerEntity('ENT-F6X-LOCKING-CAPS', 5, caps);
    group.add(caps);

    // Upper & lower titanium frame shear-ties
    const tiesGroup = new THREE.Group();
    const tieGeo = this.track(new THREE.BoxGeometry(0.09, 0.036, 0.02));
    for (const [tx, ty] of [
      [-0.2, -0.18],
      [0.2, -0.18],
      [-0.2, 0.22],
      [0.2, 0.22],
    ]) {
      const tie = new THREE.Mesh(tieGeo, this.materials.singleCrystalGoldNickel);
      tie.position.set(tx, ty, 0);
      tiesGroup.add(tie);
    }
    this.registerEntity('ENT-F6X-SHEAR-TIES', 5, tiesGroup);
    group.add(tiesGroup);
    return group;
  }

  private buildStep6CarbonDadoPanel(): THREE.Group {
    const group = new THREE.Group();
    const leafGeo = this.track(new THREE.BoxGeometry(0.37, 0.52, 0.018));
    const louverGeo = this.track(new THREE.BoxGeometry(0.24, 0.07, 0.024));

    const portLeaf = new THREE.Group();
    const portPanel = new THREE.Mesh(leafGeo, this.materials.carbonCompositeCowl);
    portPanel.position.x = -0.19;
    const portLouver = new THREE.Mesh(louverGeo, this.materials.titaniumPolished);
    portLouver.position.set(-0.19, -0.15, 0.004);
    portLeaf.add(portPanel, portLouver);
    this.registerEntity('ENT-F6X-DADO-PORT', 6, portLeaf);
    portLeaf.name = 'PortDadoLeaf';

    const stbdLeaf = new THREE.Group();
    const stbdPanel = new THREE.Mesh(leafGeo, this.materials.carbonCompositeCowl);
    stbdPanel.position.x = 0.19;
    const stbdLouver = new THREE.Mesh(louverGeo, this.materials.titaniumPolished);
    stbdLouver.position.set(0.19, -0.15, 0.004);
    stbdLeaf.add(stbdPanel, stbdLouver);
    this.registerEntity('ENT-F6X-DADO-STARBOARD', 6, stbdLeaf);
    stbdLeaf.name = 'StarboardDadoLeaf';

    group.add(portLeaf, stbdLeaf);
    return group;
  }

  private buildPanelGhost(spec: AssemblyStepSpec): THREE.Group {
    const ghost = new THREE.Group();
    ghost.name = `${spec.code} AR Hologram Target`;

    if (spec.id === 1 || spec.id === 5) {
      // 8 glowing OmniStep spot rings on fuselage panel (matching video 0:44!)
      const spotRingGeo = this.track(new THREE.RingGeometry(0.018, 0.03, 24));
      const stemGeo = this.track(
        new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8),
      );
      stemGeo.rotateX(Math.PI / 2);
      for (const [px, py] of PIN_COORDS) {
        const ring = new THREE.Mesh(spotRingGeo, this.materials.arChevronGuide);
        ring.position.set(px, py, 0.005);
        const stem = new THREE.Mesh(stemGeo, this.materials.arGhostSolid);
        stem.position.set(px, py, 0.032);
        ghost.add(ring, stem);
      }
    } else {
      const boxGeo = this.track(new THREE.BoxGeometry(0.68, 0.44, 0.035));
      const shell = new THREE.Mesh(boxGeo, this.materials.arGhostSolid);
      const edges = this.track(new THREE.EdgesGeometry(boxGeo));
      const wire = new THREE.LineSegments(edges, this.materials.arGhostWire);
      ghost.add(shell, wire);
    }

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
