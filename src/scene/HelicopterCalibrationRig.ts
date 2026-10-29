import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  HELICOPTER_PROFILES,
  type HelicopterCalibrationReport,
  type HelicopterVariantId,
} from '../calibration/helicopterOfflineCv';
import {AeroMaterialLibrary} from './materials';

const _scratchCamLocal = new THREE.Vector3();

function markPassThrough(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.xb = {pointerEvents: 'none'};
  });
}

class HelicopterCalibrationHitProxy extends xb.MeshScript {
  private readonly onTrigger: () => void;

  constructor(onTrigger: () => void) {
    const geom = new THREE.BoxGeometry(0.88, 0.78, 1.35);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    super(geom, mat);
    this.name = 'Helicopter Offline CV Target Proxy';
    this.onTrigger = onTrigger;
  }

  override onObjectSelectStart(event: xb.SelectEvent): void {
    (this.material as THREE.MeshBasicMaterial).opacity = 0.08;
    event.stopPropagation();
  }

  override onObjectSelectEnd(event: xb.SelectEndEvent): void {
    (this.material as THREE.MeshBasicMaterial).opacity = 0.0;
    if (event.completed) {
      this.onTrigger();
    }
    event.stopPropagation();
  }

  disposeResources(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
  }
}

interface LandmarkReticleEntry {
  readonly id: string;
  readonly group: THREE.Group;
  readonly outerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly coreDot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly residualLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly linePositions: Float32Array;
}

/**
 * Composite 10-Part Procedural 3D Helicopter Airframe & Markerless CAD Registration Twin
 * positioned directly in front of the technician wearing XREAL Aura glasses.
 *
 * Strictly zero QR codes / fiducial markers on the airframe or hangar deck:
 * alignment is driven 1:1 in metric meters by the SE(3) residual pose delta from
 * `HelicopterOfflineCvCalibrator`.
 */
export class HelicopterCalibrationRig extends THREE.Group {
  private readonly materials: AeroMaterialLibrary;
  private readonly helicopterRoot = new THREE.Group();
  private readonly physicalAirframe = new THREE.Group();
  private readonly mainRotorAssembly = new THREE.Group();
  private readonly fenestronFan = new THREE.Group();
  private readonly ghostCadTwin = new THREE.Group();
  private readonly landmarkGroup = new THREE.Group();
  private readonly scanSweepRing: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly hitProxy: HelicopterCalibrationHitProxy;

  private readonly fuselageMat: THREE.MeshStandardMaterial;
  private readonly canopyGlassMat: THREE.MeshStandardMaterial;
  private readonly rotorCompositeMat: THREE.MeshStandardMaterial;
  private readonly ghostWireMat: THREE.LineBasicMaterial;
  private readonly ghostShellMat: THREE.MeshBasicMaterial;
  private readonly landmarkEntries = new Map<string, LandmarkReticleEntry>();

  private readonly disposables: Array<{dispose(): void}> = [];
  private activeVariantId: HelicopterVariantId = 'h145m';
  private currentTurntableYaw = -0.58;
  private targetTurntableYaw = -0.58;

  // Damped 1:1 metric residual offset (meters & radians) for smooth visual convergence
  private readonly currentDeltaPos = new THREE.Vector3(0.024, -0.019, 0.022);
  private readonly targetDeltaPos = new THREE.Vector3(0, 0, 0);
  private readonly currentDeltaEuler = new THREE.Vector3(0.024, -0.052, 0.019);
  private readonly targetDeltaEuler = new THREE.Vector3(0, 0, 0);
  private scanPulseTimer = 1.15;

  constructor(
    materials: AeroMaterialLibrary,
    onCalibrateTrigger: () => void,
  ) {
    super();
    this.name = 'XREAL Aura Helicopter Offline CV Calibration Rig';
    this.materials = materials;

    this.position.set(0, 0, -1.85);
    this.rotation.y = this.currentTurntableYaw;

    this.fuselageMat = this.track(
      new THREE.MeshStandardMaterial({
        color: HELICOPTER_PROFILES.h145m.fuselageTintHex,
        metalness: 0.62,
        roughness: 0.52,
        bumpMap: materials.brushedBumpTexture,
        bumpScale: 0.003,
      }),
    );

    this.canopyGlassMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        metalness: 0.15,
        roughness: 0.14,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
      }),
    );

    this.rotorCompositeMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.28,
        roughness: 0.66,
      }),
    );

    this.ghostWireMat = this.track(
      new THREE.LineBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.88,
      }),
    );

    this.ghostShellMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        wireframe: true,
      }),
    );

    // 1. Grounded Hangar Helipad Calibration Deck (y = 0, zero QR markers)
    const helipad = this.buildGroundedHelipadDeck();
    markPassThrough(helipad);
    this.add(helipad);

    // Helicopter datum center at y = 1.08m so landing skids (-0.38m * scale + stanchions) sit flush on deck
    this.helicopterRoot.position.set(0, 1.08, 0);
    this.add(this.helicopterRoot);

    // 2. Physical 10-Part Composite 3D Helicopter Airframe
    this.buildCompositeHelicopterAirframe();
    markPassThrough(this.physicalAirframe);
    this.helicopterRoot.add(this.physicalAirframe);

    // 3. Holographic CAD Registration Twin (1:1 Metric SE(3) Offset)
    this.buildHolographicCadTwin();
    markPassThrough(this.ghostCadTwin);
    this.helicopterRoot.add(this.ghostCadTwin);

    // 4. 10 Natural Anatomical CAD Landmark Brackets & Residual Vectors
    this.buildLandmarkReticles();
    markPassThrough(this.landmarkGroup);
    this.helicopterRoot.add(this.landmarkGroup);

    // 5. Offline Stereo CV Laser/Optical Sweep Ring
    const sweepGeom = this.track(new THREE.RingGeometry(0.18, 0.21, 48));
    const sweepMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.scanSweepRing = new THREE.Mesh(sweepGeom, sweepMat);
    this.scanSweepRing.xb = {pointerEvents: 'none'};
    this.helicopterRoot.add(this.scanSweepRing);

    // 6. Interactive XR Hit Proxy to trigger Offline CV Calibration by clicking/pinching helicopter
    this.hitProxy = new HelicopterCalibrationHitProxy(onCalibrateTrigger);
    this.helicopterRoot.add(this.hitProxy);
  }

  rotateTurntable(deltaRad: number): void {
    this.targetTurntableYaw += deltaRad;
  }

  resetTurntable(): void {
    this.targetTurntableYaw = -0.58;
  }

  triggerCvScanPulse(): void {
    this.scanPulseTimer = 1.15;
  }

  syncAndAnimate(
    dt: number,
    elapsed: number,
    report: HelicopterCalibrationReport,
    cameraWorldPos: THREE.Vector3,
  ): void {
    // Update variant styling & airframe proportions if helicopter model changed
    if (report.variantId !== this.activeVariantId) {
      this.activeVariantId = report.variantId;
      const profile = HELICOPTER_PROFILES[report.variantId];
      this.fuselageMat.color.setHex(profile.fuselageTintHex);
      const s = profile.rotorDiameterScale;
      this.physicalAirframe.scale.set(s, s, s);
      this.ghostCadTwin.scale.set(s, s, s);
    }

    // Position helicopter at configured XREAL Aura wearer standoff distance
    const targetZ = -report.standoffMeters;
    this.position.z = THREE.MathUtils.damp(this.position.z, targetZ, 7.5, dt);

    // Smoothly damp turntable yaw
    this.currentTurntableYaw = THREE.MathUtils.damp(
      this.currentTurntableYaw,
      this.targetTurntableYaw,
      7.0,
      dt,
    );
    this.rotation.y = this.currentTurntableYaw;

    // Gentle idle main rotor & Fenestron tail fan rotation
    this.mainRotorAssembly.rotation.y = elapsed * 0.55;
    this.fenestronFan.rotation.x = elapsed * 3.8;

    // Damp 1:1 metric SE(3) residual pose offset on Holographic CAD Twin
    this.targetDeltaPos.set(
      report.residualPoseDelta.position[0],
      report.residualPoseDelta.position[1],
      report.residualPoseDelta.position[2],
    );
    this.targetDeltaEuler.set(
      report.residualPoseDelta.eulerXYZ[0],
      report.residualPoseDelta.eulerXYZ[1],
      report.residualPoseDelta.eulerXYZ[2],
    );

    const dampLambda = report.status === 'calibrated_pass' ? 6.5 : 10.0;
    this.currentDeltaPos.x = THREE.MathUtils.damp(
      this.currentDeltaPos.x,
      this.targetDeltaPos.x,
      dampLambda,
      dt,
    );
    this.currentDeltaPos.y = THREE.MathUtils.damp(
      this.currentDeltaPos.y,
      this.targetDeltaPos.y,
      dampLambda,
      dt,
    );
    this.currentDeltaPos.z = THREE.MathUtils.damp(
      this.currentDeltaPos.z,
      this.targetDeltaPos.z,
      dampLambda,
      dt,
    );

    this.currentDeltaEuler.x = THREE.MathUtils.damp(
      this.currentDeltaEuler.x,
      this.targetDeltaEuler.x,
      dampLambda,
      dt,
    );
    this.currentDeltaEuler.y = THREE.MathUtils.damp(
      this.currentDeltaEuler.y,
      this.targetDeltaEuler.y,
      dampLambda,
      dt,
    );
    this.currentDeltaEuler.z = THREE.MathUtils.damp(
      this.currentDeltaEuler.z,
      this.targetDeltaEuler.z,
      dampLambda,
      dt,
    );

    this.ghostCadTwin.position.copy(this.currentDeltaPos);
    this.ghostCadTwin.rotation.set(
      this.currentDeltaEuler.x,
      this.currentDeltaEuler.y,
      this.currentDeltaEuler.z,
    );

    // Color-code CAD Twin & Landmark Reticles by 2.00 mm gate status
    const statusHex =
      report.status === 'calibrated_pass'
        ? 0x34d399
        : report.status === 'uncalibrated_drift'
          ? 0xfbbf24
          : 0xf87171;

    this.ghostWireMat.color.setHex(statusHex);
    this.ghostShellMat.color.setHex(statusHex);
    this.ghostShellMat.opacity =
      report.status === 'calibrated_pass' ? 0.08 : 0.16;

    // Camera local position for billboarding landmark reticle rings
    _scratchCamLocal.copy(cameraWorldPos);
    this.landmarkGroup.worldToLocal(_scratchCamLocal);

    for (const lmRes of report.landmarks) {
      const entry = this.landmarkEntries.get(lmRes.id);
      if (!entry) continue;

      const cadX = lmRes.cadPosition[0];
      const cadY = lmRes.cadPosition[1];
      const cadZ = lmRes.cadPosition[2];

      entry.group.position.set(cadX, cadY, cadZ);
      entry.outerRing.lookAt(_scratchCamLocal);

      if (!lmRes.visible) {
        entry.outerRing.material.color.setHex(0x64748b);
        entry.outerRing.material.opacity = 0.32;
        entry.coreDot.material.color.setHex(0x64748b);
        entry.residualLine.visible = false;
      } else {
        const ptColor =
          report.status === 'calibrated_pass'
            ? 0x34d399
            : report.status === 'uncalibrated_drift'
              ? 0xfbbf24
              : lmRes.residualMm <= 2.0
                ? 0x38bdf8
                : 0xf87171;
        entry.outerRing.material.color.setHex(ptColor);
        entry.outerRing.material.opacity = 0.92;
        entry.coreDot.material.color.setHex(ptColor);

        // Residual vector from true physical landmark to current estimated CAD landmark
        entry.linePositions[0] = 0;
        entry.linePositions[1] = 0;
        entry.linePositions[2] = 0;
        entry.linePositions[3] = this.currentDeltaPos.x;
        entry.linePositions[4] = this.currentDeltaPos.y;
        entry.linePositions[5] = this.currentDeltaPos.z;
        entry.residualLine.geometry.attributes.position.needsUpdate = true;
        entry.residualLine.material.color.setHex(ptColor);
        entry.residualLine.visible = true;
      }
    }

    // Animate Offline CV Optical Sweep Ring during calibration bursts
    if (this.scanPulseTimer > 0) {
      this.scanPulseTimer = Math.max(0, this.scanPulseTimer - dt);
      const t = 1 - this.scanPulseTimer / 1.15;
      this.scanSweepRing.visible = true;
      this.scanSweepRing.position.set(0, 0.08, 0.62 - t * 1.35);
      const scale = 1 + Math.sin(t * Math.PI) * 2.2;
      this.scanSweepRing.scale.setScalar(scale);
      this.scanSweepRing.material.opacity = (1 - t) * 0.72;
      this.scanSweepRing.material.color.setHex(statusHex);
    } else {
      this.scanSweepRing.visible = false;
    }
  }

  private buildGroundedHelipadDeck(): THREE.Group {
    const group = new THREE.Group();

    // Soft radial contact shadow at y = 0.015 (disjoint depth, no Z-fight)
    const shadowDisc = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(2.3, 2.3)),
      this.materials.contactShadow,
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.015;
    group.add(shadowDisc);

    // Circular aerospace calibration helipad deck at y = 0.03
    const padGeom = this.track(new THREE.CylinderGeometry(0.96, 1.0, 0.03, 40));
    const padMesh = new THREE.Mesh(padGeom, this.materials.workstandDeck);
    padMesh.position.y = 0.03;
    padMesh.receiveShadow = true;
    group.add(padMesh);

    // Outer anodized datum ring (strictly circular — zero QR square fiducials)
    const outerRing = new THREE.Mesh(
      this.track(new THREE.RingGeometry(0.86, 0.9, 48)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x0284c7,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      ),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.047;
    group.add(outerRing);

    // Pedestal stanchions supporting helicopter landing skids at ergonomic XREAL Aura eye-line
    const cradleGeom = this.track(new THREE.CylinderGeometry(0.032, 0.045, 0.66, 14));
    for (const [sx, sz] of [
      [-0.36, 0.24],
      [0.36, 0.24],
      [-0.36, -0.22],
      [0.36, -0.22],
    ] as const) {
      const post = new THREE.Mesh(cradleGeom, this.materials.gantrySteelDark);
      post.position.set(sx, 0.36, sz);
      post.castShadow = true;
      group.add(post);
    }

    return group;
  }

  private buildCompositeHelicopterAirframe(): void {
    // Part 1 (Primary Silhouette): Sculpted Aerodynamic Fuselage Cabin & Nose Shell
    const sideProfile = new THREE.Shape();
    sideProfile.moveTo(0.6, -0.14); // Forward nose tip (+Z mapped via rotation)
    sideProfile.quadraticCurveTo(0.58, 0.04, 0.36, 0.16); // Canopy brow
    sideProfile.lineTo(-0.18, 0.18); // Cabin roof
    sideProfile.lineTo(-0.34, 0.1); // Aft cabin taper
    sideProfile.lineTo(-0.32, -0.18); // Aft belly
    sideProfile.lineTo(0.38, -0.22); // Forward belly
    sideProfile.quadraticCurveTo(0.56, -0.21, 0.6, -0.14);

    const hullGeom = this.track(
      new THREE.ExtrudeGeometry(sideProfile, {
        depth: 0.42,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.045,
        bevelSegments: 3,
      }),
    );
    hullGeom.center();
    // Rotate so extruded profile X->Z (nose +Z, tail -Z) and depth Z->X (width)
    hullGeom.rotateY(-Math.PI / 2);

    const fuselageMesh = new THREE.Mesh(hullGeom, this.fuselageMat);
    fuselageMesh.position.set(0, -0.03, 0.14);
    fuselageMesh.castShadow = true;
    fuselageMesh.receiveShadow = true;
    this.physicalAirframe.add(fuselageMesh);

    // Part 2 (Secondary Read): Framed Bubble Cockpit Canopy & Center Stanchion (K04)
    const canopyGeom = this.track(
      new THREE.SphereGeometry(0.235, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
    );
    canopyGeom.scale(0.95, 0.85, 1.38);
    const canopyMesh = new THREE.Mesh(canopyGeom, this.canopyGlassMat);
    canopyMesh.position.set(0, 0.02, 0.28);
    canopyMesh.rotation.x = 0.36;
    canopyMesh.renderOrder = 3;
    this.physicalAirframe.add(canopyMesh);

    const stanchionCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.11, 0.58),
      new THREE.Vector3(0, 0.06, 0.49),
      new THREE.Vector3(0, 0.16, 0.34),
    ]);
    const stanchionMesh = new THREE.Mesh(
      this.track(new THREE.TubeGeometry(stanchionCurve, 16, 0.011, 8, false)),
      this.materials.titaniumPolished,
    );
    this.physicalAirframe.add(stanchionMesh);

    // Part 3 (Secondary Read): Twin Turboshaft Engine Deck Cowling & Inconel Exhausts (K07, K08)
    const engineDeck = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.32, 0.13, 0.44)),
      this.materials.inconelSuperalloy,
    );
    engineDeck.position.set(0, 0.21, 0.02);
    engineDeck.castShadow = true;
    this.physicalAirframe.add(engineDeck);

    const intakeRingGeom = this.track(new THREE.TorusGeometry(0.048, 0.011, 12, 24));
    const exhaustConeGeom = this.track(
      new THREE.CylinderGeometry(0.038, 0.052, 0.14, 16, 1, true),
    );
    exhaustConeGeom.rotateX(Math.PI / 2);

    for (const side of [-1, 1] as const) {
      const intakeLip = new THREE.Mesh(intakeRingGeom, this.materials.titaniumPolished);
      intakeLip.position.set(side * 0.14, 0.22, 0.24);
      this.physicalAirframe.add(intakeLip);

      const exhaust = new THREE.Mesh(
        exhaustConeGeom,
        this.materials.singleCrystalGoldNickel,
      );
      exhaust.position.set(side * 0.11, 0.22, -0.25);
      exhaust.rotation.y = side * -0.18;
      this.physicalAirframe.add(exhaust);
    }

    // Part 4 (Secondary Read): Main Rotor Mast, Swashplate Pitch Links & 4 Composite Rotor Blades (K01, K02, K03)
    const mastShaft = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.032, 0.04, 0.26, 18)),
      this.materials.titaniumForged,
    );
    mastShaft.position.set(0, 0.36, 0.04);
    this.physicalAirframe.add(mastShaft);

    const swashplate = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.095, 0.105, 0.024, 24)),
      this.materials.anodizedBlue,
    );
    swashplate.position.set(0, 0.33, 0.04);
    swashplate.rotation.x = 0.06;
    this.physicalAirframe.add(swashplate);

    // Pitch-link rods
    const pitchRodGeom = this.track(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 8));
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + 0.4;
      const rod = new THREE.Mesh(pitchRodGeom, this.materials.titaniumPolished);
      rod.position.set(
        Math.cos(ang) * 0.075,
        0.39,
        0.04 + Math.sin(ang) * 0.075,
      );
      this.physicalAirframe.add(rod);
    }

    // Rotating 4-blade main rotor head centered at K01 (0, 0.48, 0.04)
    this.mainRotorAssembly.position.set(0, 0.47, 0.04);
    const hubCap = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.055, 0.075, 0.048, 20)),
      this.materials.titaniumPolished,
    );
    this.mainRotorAssembly.add(hubCap);

    const bladeGeom = this.track(new THREE.BoxGeometry(0.78, 0.012, 0.068));
    const tipCapGeom = this.track(new THREE.BoxGeometry(0.07, 0.014, 0.07));
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;

      const blade = new THREE.Mesh(bladeGeom, this.rotorCompositeMat);
      blade.position.set(0.44, 0, 0);
      blade.rotation.x = 0.11; // Collective pitch angle
      blade.castShadow = true;

      const tip = new THREE.Mesh(tipCapGeom, this.materials.anodizedAmber);
      tip.position.set(0.81, 0, 0);
      tip.rotation.x = 0.11;

      arm.add(blade, tip);
      this.mainRotorAssembly.add(arm);
    }
    this.physicalAirframe.add(this.mainRotorAssembly);

    // Part 5 (Secondary Read): Tubular Titanium Landing Skids & Cross-Tube Saddle Lugs (K09)
    const skidTubeGeom = this.track(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 12));
    skidTubeGeom.rotateX(Math.PI / 2);
    const hornCurveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36, -0.38, 0.45),
      new THREE.Vector3(-0.36, -0.35, 0.54),
      new THREE.Vector3(-0.35, -0.29, 0.59),
    ]);
    const hornCurveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.36, -0.38, 0.45),
      new THREE.Vector3(0.36, -0.35, 0.54),
      new THREE.Vector3(0.35, -0.29, 0.59),
    ]);

    for (const side of [-1, 1] as const) {
      const skid = new THREE.Mesh(skidTubeGeom, this.materials.titaniumForged);
      skid.position.set(side * 0.36, -0.38, 0.02);
      this.physicalAirframe.add(skid);
    }
    this.physicalAirframe.add(
      new THREE.Mesh(
        this.track(new THREE.TubeGeometry(hornCurveL, 10, 0.019, 8, false)),
        this.materials.titaniumForged,
      ),
      new THREE.Mesh(
        this.track(new THREE.TubeGeometry(hornCurveR, 10, 0.019, 8, false)),
        this.materials.titaniumForged,
      ),
    );

    for (const zCross of [0.24, -0.22] as const) {
      const crossCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.36, -0.38, zCross),
        new THREE.Vector3(-0.26, -0.21, zCross),
        new THREE.Vector3(0.26, -0.21, zCross),
        new THREE.Vector3(0.36, -0.38, zCross),
      ]);
      const crossTube = new THREE.Mesh(
        this.track(new THREE.TubeGeometry(crossCurve, 18, 0.018, 10, false)),
        this.materials.gantrySteelDark,
      );
      this.physicalAirframe.add(crossTube);
    }

    // Part 6 (Secondary Read): Tapered Tailboom, Horizontal Stabilizer & Shrouded Fenestron Fin (K10)
    const boomGeom = this.track(new THREE.CylinderGeometry(0.048, 0.11, 0.78, 16));
    boomGeom.rotateX(Math.PI / 2);
    const tailboom = new THREE.Mesh(boomGeom, this.fuselageMat);
    tailboom.position.set(0, 0.08, -0.52);
    tailboom.castShadow = true;
    this.physicalAirframe.add(tailboom);

    // Dorsal splice flange ring at K10
    const spliceRing = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(0.088, 0.01, 10, 24)),
      this.materials.anodizedBlue,
    );
    spliceRing.position.set(0, 0.08, -0.36);
    this.physicalAirframe.add(spliceRing);

    const hStab = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.46, 0.016, 0.1)),
      this.fuselageMat,
    );
    hStab.position.set(0, 0.09, -0.74);
    this.physicalAirframe.add(hStab);

    // Vertical Fenestron shroud & swept fin
    const shroudTorus = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(0.11, 0.026, 12, 24)),
      this.fuselageMat,
    );
    shroudTorus.position.set(0, 0.14, -0.92);
    shroudTorus.rotation.y = Math.PI / 2;
    this.physicalAirframe.add(shroudTorus);

    const vFin = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.026, 0.24, 0.13)),
      this.materials.anodizedBlue,
    );
    vFin.position.set(0, 0.31, -0.95);
    vFin.rotation.x = -0.28;
    this.physicalAirframe.add(vFin);

    this.fenestronFan.position.set(0, 0.14, -0.92);
    const fenBladeGeom = this.track(new THREE.BoxGeometry(0.008, 0.18, 0.022));
    for (let i = 0; i < 4; i++) {
      const fb = new THREE.Mesh(fenBladeGeom, this.materials.titaniumPolished);
      fb.rotation.x = (i * Math.PI) / 4;
      this.fenestronFan.add(fb);
    }
    this.physicalAirframe.add(this.fenestronFan);

    // Part 7 (Accent Detail): Machined Port/Starboard Nose Pitot-Static Probes (K05, K06)
    const pitotGeom = this.track(new THREE.CylinderGeometry(0.006, 0.01, 0.13, 10));
    pitotGeom.rotateX(Math.PI / 2);
    for (const side of [-1, 1] as const) {
      const pitot = new THREE.Mesh(pitotGeom, this.materials.titaniumPolished);
      pitot.position.set(side * 0.22, -0.04, 0.54);
      this.physicalAirframe.add(pitot);
    }
  }

  private buildHolographicCadTwin(): void {
    const profile = HELICOPTER_PROFILES.h145m;
    const lineVerts: number[] = [];
    for (const seg of profile.silhouetteSegments) {
      lineVerts.push(seg.a[0], seg.a[1], seg.a[2], seg.b[0], seg.b[1], seg.b[2]);
    }
    const wireGeom = this.track(new THREE.BufferGeometry());
    wireGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(lineVerts, 3),
    );
    const wireSegments = new THREE.LineSegments(wireGeom, this.ghostWireMat);
    this.ghostCadTwin.add(wireSegments);

    // Subtle holographic wireframe envelope around cabin & rotor disc
    const rotorRingGeom = this.track(new THREE.RingGeometry(0.8, 0.815, 48));
    rotorRingGeom.rotateX(-Math.PI / 2);
    const rotorDiscWire = new THREE.Mesh(
      rotorRingGeom,
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    rotorDiscWire.position.set(0, 0.47, 0.04);
    this.ghostCadTwin.add(rotorDiscWire);

    const hullEnvelope = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.48, 0.36, 0.88)),
      this.ghostShellMat,
    );
    hullEnvelope.position.set(0, -0.01, 0.14);
    this.ghostCadTwin.add(hullEnvelope);
  }

  private buildLandmarkReticles(): void {
    const ringGeom = this.track(new THREE.RingGeometry(0.018, 0.025, 20));
    const dotGeom = this.track(new THREE.SphereGeometry(0.008, 10, 10));

    for (const lm of HELICOPTER_PROFILES.h145m.landmarks) {
      const group = new THREE.Group();
      group.position.set(lm.cadPosition[0], lm.cadPosition[1], lm.cadPosition[2]);

      const ringMat = this.track(
        new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      const outerRing = new THREE.Mesh(ringGeom, ringMat);
      outerRing.renderOrder = 10;

      const dotMat = this.track(
        new THREE.MeshBasicMaterial({
          color: 0x34d399,
          depthTest: false,
          depthWrite: false,
        }),
      );
      const coreDot = new THREE.Mesh(dotGeom, dotMat);
      coreDot.renderOrder = 11;

      const linePositions = new Float32Array(6);
      const lineGeom = this.track(new THREE.BufferGeometry());
      lineGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(linePositions, 3),
      );
      const lineMat = this.track(
        new THREE.LineBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        }),
      );
      const residualLine = new THREE.Line(lineGeom, lineMat);
      residualLine.renderOrder = 9;

      group.add(outerRing, coreDot, residualLine);
      this.landmarkGroup.add(group);

      this.landmarkEntries.set(lm.id, {
        id: lm.id,
        group,
        outerRing,
        coreDot,
        residualLine,
        linePositions,
      });
    }
  }

  private track<T extends {dispose(): void}>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  dispose(): void {
    this.hitProxy.disposeResources();
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables.length = 0;
  }
}
