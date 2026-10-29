import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import * as xb from 'xrblocks';

import type {DimeoMarkerType, DimeoSpatialMarker} from '../dimeo/dimeoEngine';
import type {AeroMaterialLibrary} from './materials';

const _upVec = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _curveStart = new THREE.Vector3();
const _curveMid = new THREE.Vector3();
const _curveEnd = new THREE.Vector3();
const _tempBox = new THREE.Box3();
const _tempSize = new THREE.Vector3();
const _tempCenter = new THREE.Vector3();

/**
 * Invisible XR Blocks raycast capture plane active ONLY when an author selects
 * a 3D spatial marker placement tool ('arrow' | 'circle_ring' | 'poi_pin' | 'warning_cone').
 * When inactive, `visible = false` and `pointerEvents = 'none'` so stage/beacon clicks pass through cleanly.
 */
class SpatialMarkerCaptureSurface extends xb.MeshScript {
  private readonly onSurfaceHit: (worldPoint: readonly [number, number, number]) => void;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    onSurfaceHit: (worldPoint: readonly [number, number, number]) => void,
  ) {
    super(geometry, material);
    this.onSurfaceHit = onSurfaceHit;
    this.name = 'Dimeo 3D Marker Authoring Surface';
    this.visible = false;
    this.xb = {pointerEvents: 'none'};
  }

  setAuthoringActive(active: boolean): void {
    this.visible = active;
    this.xb = {pointerEvents: active ? 'auto' : 'none'};
  }

  override onObjectSelectStart(event: xb.SelectEvent): void {
    if (!this.visible) return;
    const pt = event.intersection?.point;
    if (pt) {
      this.onSurfaceHit([pt.x, pt.y, pt.z]);
    } else {
      this.onSurfaceHit([this.position.x, this.position.y, this.position.z]);
    }
    event.stopPropagation();
  }
}

interface MarkerVisualNode {
  readonly id: string;
  readonly type: DimeoMarkerType;
  readonly root: THREE.Group;
  readonly animatedInner: THREE.Object3D;
  readonly basePosition: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly labelMesh: THREE.Mesh | null;
  readonly labelTexture: THREE.CanvasTexture | null;
  readonly ownedMaterials: THREE.Material[];
}

/**
 * Renders Innoteo Dimeo -> Android XR 3D spatial visual indicators ("Repères visuels RA"),
 * 3D wayfinding beaded guidance curves, click-to-place marker authoring, and interactive
 * multi-scale CAD Digital Twins (built-in 6-part Aerospace Swashplate/Actuator assembly +
 * `.glb` / `.gltf` / `.stl` / `.obj` CAD import).
 */
export class DimeoSpatialMarkersRig extends THREE.Group {
  private readonly materials: AeroMaterialLibrary;
  private readonly markersGroup = new THREE.Group();
  private readonly wayfindingGroup = new THREE.Group();
  private readonly digitalTwinRoot = new THREE.Group();
  private readonly builtinTwinGroup = new THREE.Group();
  private importedTwinGroup: THREE.Object3D | null = null;
  private readonly captureSurface: SpatialMarkerCaptureSurface;

  // Shared low-allocation geometries
  private readonly arrowShaftGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.14, 18);
  private readonly arrowHeadGeo = new THREE.ConeGeometry(0.032, 0.068, 20);
  private readonly arrowCollarGeo = new THREE.TorusGeometry(0.036, 0.005, 10, 28);
  private readonly outerRingGeo = new THREE.RingGeometry(0.068, 0.084, 36);
  private readonly innerRingGeo = new THREE.RingGeometry(0.032, 0.042, 32);
  private readonly tickBoxGeo = new THREE.BoxGeometry(0.008, 0.028, 0.006);
  private readonly poiStemGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.13, 14);
  private readonly poiOrbGeo = new THREE.OctahedronGeometry(0.028, 1);
  private readonly poiBaseDiscGeo = new THREE.CylinderGeometry(0.032, 0.036, 0.008, 20);
  private readonly warnConeGeo = new THREE.ConeGeometry(0.046, 0.12, 24);
  private readonly warnBandGeo = new THREE.CylinderGeometry(0.027, 0.034, 0.024, 24, 1, true);
  private readonly labelPlaneGeo = new THREE.PlaneGeometry(0.24, 0.058);
  private readonly beadGeo = new THREE.SphereGeometry(0.009, 12, 10);
  private readonly capturePlaneGeo = new THREE.PlaneGeometry(1.55, 1.02);
  private readonly capturePlaneMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private readonly wayfindingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });

  private readonly wayfindingBeads: THREE.Mesh[] = [];
  private readonly ownedTwinGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedTwinMaterials: THREE.Material[] = [];

  private activeMarkerSignature = '';
  private markerNodes: MarkerVisualNode[] = [];
  private wayfindingTarget: THREE.Vector3 | null = null;

  constructor(
    materials: AeroMaterialLibrary,
    onPlaceMarkerAtPoint: (worldPoint: readonly [number, number, number]) => void,
  ) {
    super();
    this.name = 'DimeoAndroidXRSpatialSuiteRig';
    this.materials = materials;

    this.markersGroup.name = 'DimeoSpatialMarkersGroup';
    this.wayfindingGroup.name = 'DimeoWayfindingCurveGroup';
    this.digitalTwinRoot.name = 'DimeoCadDigitalTwinRoot';

    // Wayfinding beaded path (18 beads)
    for (let i = 0; i < 18; i++) {
      const bead = new THREE.Mesh(this.beadGeo, this.wayfindingMat);
      bead.visible = false;
      bead.xb = {pointerEvents: 'none'};
      this.wayfindingBeads.push(bead);
      this.wayfindingGroup.add(bead);
    }

    // Interactive Click-to-Place Spatial Authoring Surface
    this.captureSurface = new SpatialMarkerCaptureSurface(
      this.capturePlaneGeo,
      this.capturePlaneMat,
      onPlaceMarkerAtPoint,
    );
    this.captureSurface.position.set(0, 1.26, -1.42);

    // Built-in 6-part Manipulable Aerospace Swashplate & Pitch-Link CAD Digital Twin
    this.buildBuiltinAerospaceDigitalTwin();
    this.digitalTwinRoot.position.set(0, 1.04, -0.92);
    this.digitalTwinRoot.visible = false;
    this.digitalTwinRoot.xb = {manipulation: true};
    this.digitalTwinRoot.add(this.builtinTwinGroup);

    this.add(
      this.markersGroup,
      this.wayfindingGroup,
      this.digitalTwinRoot,
      this.captureSurface,
    );
  }

  /**
   * Builds a composite 8-part procedural Aerospace Rotor Swashplate & Actuator CAD Digital Twin
   * with distinct silhouette scales and varied PBR roughness/metalness.
   */
  private buildBuiltinAerospaceDigitalTwin(): void {
    const mastGeo = new THREE.CylinderGeometry(0.055, 0.062, 0.42, 28);
    const baseFlangeGeo = new THREE.CylinderGeometry(0.19, 0.21, 0.028, 32);
    const stationaryStarGeo = new THREE.TorusGeometry(0.145, 0.022, 16, 36);
    const rotatingRingGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.032, 32, 1, true);
    const clevisLugGeo = new THREE.BoxGeometry(0.042, 0.048, 0.068);
    const pitchRodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 16);
    constrodEndGeo: {
      const rodEndGeo = new THREE.SphereGeometry(0.022, 18, 14);
      const scissorArmGeo = new THREE.BoxGeometry(0.026, 0.15, 0.036);

      this.ownedTwinGeometries.push(
        mastGeo,
        baseFlangeGeo,
        stationaryStarGeo,
        rotatingRingGeo,
        clevisLugGeo,
        pitchRodGeo,
        rodEndGeo,
        scissorArmGeo,
      );

      const cadCyanRimMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.28,
        roughness: 0.22,
        metalness: 0.65,
      });
      this.ownedTwinMaterials.push(cadCyanRimMat);

      // 1. Primary silhouette: Titanium main rotor mast & lower mounting flange
      const baseFlange = new THREE.Mesh(baseFlangeGeo, this.materials.primerSlate);
      baseFlange.position.y = -0.19;

      const mast = new THREE.Mesh(mastGeo, this.materials.titaniumBrushed);
      mast.position.y = 0.02;

      // 2. Secondary read: Tilted swashplate stationary star + rotating bearing ring
      const swashAssembly = new THREE.Group();
      swashAssembly.position.y = 0.03;
      swashAssembly.rotation.z = 0.14;

      const stationaryStar = new THREE.Mesh(
        stationaryStarGeo,
        this.materials.anodizedCobalt,
      );
      stationaryStar.rotation.x = Math.PI / 2;

      const rotatingRing = new THREE.Mesh(rotatingRingGeo, cadCyanRimMat);

      swashAssembly.add(stationaryStar, rotatingRing);

      // 3. Accent details: 3x Pitch-link rods, clevis lugs, spherical bearings & anti-rotation scissor arm
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3;
        const rx = Math.cos(angle) * 0.165;
        const rz = Math.sin(angle) * 0.165;

        const lug = new THREE.Mesh(clevisLugGeo, this.materials.inconelGold);
        lug.position.set(rx, 0.02, rz);
        lug.lookAt(0, 0.02, 0);
        swashAssembly.add(lug);

        const rod = new THREE.Mesh(pitchRodGeo, this.materials.steelFastener);
        rod.position.set(rx, 0.13, rz);
        swashAssembly.add(rod);

        const bearing = new THREE.Mesh(rodEndGeo, this.materials.copperBus);
        bearing.position.set(rx, 0.24, rz);
        swashAssembly.add(bearing);
      }

      const scissorArm = new THREE.Mesh(scissorArmGeo, this.materials.anodizedCobalt);
      scissorArm.position.set(-0.11, -0.08, 0.08);
      scissorArm.rotation.z = -0.36;

      this.builtinTwinGroup.add(baseFlange, mast, swashAssembly, scissorArm);
      break constrodEndGeo;
    }
  }

  /**
   * Loads an operator-provided `.glb`, `.gltf`, `.stl`, or `.obj` CAD Digital Twin file
   * locally in browser memory (zero cloud upload for industrial confidentiality),
   * normalizes its bounding box to `0.48 m`, and attaches it to the manipulable XR root.
   */
  async loadCadFile(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const buffer = await file.arrayBuffer();
    let loadedObject: THREE.Object3D;

    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      const gltf = await new Promise<{scene: THREE.Group}>((resolve, reject) => {
        loader.parse(buffer, '', resolve, reject);
      });
      loadedObject = gltf.scene;
    } else if (ext === 'stl') {
      const loader = new STLLoader();
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.32,
        metalness: 0.78,
      });
      this.ownedTwinGeometries.push(geometry);
      this.ownedTwinMaterials.push(mat);
      loadedObject = new THREE.Mesh(geometry, mat);
    } else if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const loader = new OBJLoader();
      const group = loader.parse(text);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        roughness: 0.34,
        metalness: 0.72,
      });
      this.ownedTwinMaterials.push(mat);
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = mat;
        }
      });
      loadedObject = group;
    } else {
      throw new Error(
        `Unsupported CAD format ".${ext}". Supported formats: .glb, .gltf, .stl, .obj`,
      );
    }

    // Normalize imported CAD model to fit cleanly in a 0.48 m XR work volume
    _tempBox.setFromObject(loadedObject);
    _tempBox.getSize(_tempSize);
    _tempBox.getCenter(_tempCenter);
    const maxDim = Math.max(_tempSize.x, _tempSize.y, _tempSize.z, 0.001);
    const normScale = 0.48 / maxDim;

    const wrapper = new THREE.Group();
    loadedObject.position.sub(_tempCenter);
    wrapper.add(loadedObject);
    wrapper.scale.setScalar(normScale);

    if (this.importedTwinGroup) {
      this.digitalTwinRoot.remove(this.importedTwinGroup);
    }
    this.importedTwinGroup = wrapper;
    this.builtinTwinGroup.visible = false;
    this.digitalTwinRoot.add(wrapper);
    this.digitalTwinRoot.visible = true;

    return file.name;
  }

  resetToBuiltinDigitalTwin(): void {
    if (this.importedTwinGroup) {
      this.digitalTwinRoot.remove(this.importedTwinGroup);
      this.importedTwinGroup = null;
    }
    this.builtinTwinGroup.visible = true;
  }

  syncState(params: {
    readonly markers: readonly DimeoSpatialMarker[];
    readonly arIndicatorsEnabled: boolean;
    readonly wayfindingEnabled: boolean;
    readonly placementTool: DimeoMarkerType | null;
    readonly digitalTwinVisible: boolean;
    readonly digitalTwinNumericScale: number;
  }): void {
    const {
      markers,
      arIndicatorsEnabled,
      wayfindingEnabled,
      placementTool,
      digitalTwinVisible,
      digitalTwinNumericScale,
    } = params;

    this.captureSurface.setAuthoringActive(
      arIndicatorsEnabled && placementTool !== null,
    );

    this.digitalTwinRoot.visible = digitalTwinVisible;
    if (digitalTwinVisible) {
      this.digitalTwinRoot.scale.setScalar(digitalTwinNumericScale);
    }

    const effectiveMarkers = arIndicatorsEnabled ? markers : [];
    const sig = effectiveMarkers
      .map(
        (m) =>
          `${m.id}:${m.type}:${m.label}:${m.colorHex}:${m.worldPosition.join(',')}`,
      )
      .join('|');

    if (sig !== this.activeMarkerSignature) {
      this.activeMarkerSignature = sig;
      this.rebuildMarkerNodes(effectiveMarkers);
    }

    if (
      arIndicatorsEnabled &&
      wayfindingEnabled &&
      effectiveMarkers.length > 0
    ) {
      const primary = effectiveMarkers[0].worldPosition;
      this.wayfindingTarget = new THREE.Vector3(
        primary[0],
        primary[1],
        primary[2],
      );
      this.wayfindingGroup.visible = true;
    } else {
      this.wayfindingTarget = null;
      this.wayfindingGroup.visible = false;
    }
  }

  private rebuildMarkerNodes(markers: readonly DimeoSpatialMarker[]): void {
    for (const node of this.markerNodes) {
      this.markersGroup.remove(node.root);
      node.labelTexture?.dispose();
      for (const m of node.ownedMaterials) {
        m.dispose();
      }
    }
    this.markerNodes = [];

    for (const spec of markers) {
      const root = new THREE.Group();
      root.name = `DimeoMarker_${spec.id}`;
      root.position.set(
        spec.worldPosition[0],
        spec.worldPosition[1],
        spec.worldPosition[2],
      );
      root.xb = {pointerEvents: 'none'};

      const animatedInner = new THREE.Group();
      root.add(animatedInner);

      const ownedMaterials: THREE.Material[] = [];
      const accentColor = new THREE.Color(spec.colorHex || '#38bdf8');
      const primaryMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.42,
        roughness: 0.25,
        metalness: 0.35,
      });
      ownedMaterials.push(primaryMat);

      const dir = _dirVec
        .set(spec.direction[0], spec.direction[1], spec.direction[2])
        .normalize();
      if (dir.lengthSq() < 0.001) dir.set(0, -1, 0);

      let labelMesh: THREE.Mesh | null = null;
      let labelTexture: THREE.CanvasTexture | null = null;

      if (spec.type === 'arrow') {
        // Composite 3-part 3D directional arrow: shaft + cone tip + chevron collar
        const arrowOrient = new THREE.Group();
        arrowOrient.quaternion.setFromUnitVectors(_upVec, dir);

        const shaft = new THREE.Mesh(this.arrowShaftGeo, primaryMat);
        shaft.position.y = -0.08;

        const head = new THREE.Mesh(this.arrowHeadGeo, primaryMat);
        head.position.y = 0.015;

        const collar = new THREE.Mesh(
          this.arrowCollarGeo,
          this.materials.steelFastener,
        );
        collar.rotation.x = Math.PI / 2;
        collar.position.y = -0.14;

        arrowOrient.add(shaft, head, collar);
        animatedInner.add(arrowOrient);

        const badge = this.createBillboardBadge(spec.label, spec.colorHex);
        badge.mesh.position.set(0, 0.14, 0);
        root.add(badge.mesh);
        labelMesh = badge.mesh;
        labelTexture = badge.texture;
        ownedMaterials.push(badge.material);
      } else if (spec.type === 'circle_ring') {
        // Segmented concentric AR precision surface ring + 4 crosshair ticks (offset against Z-fighting)
        const ringMat = new THREE.MeshBasicMaterial({
          color: accentColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        ownedMaterials.push(ringMat);

        const outer = new THREE.Mesh(this.outerRingGeo, ringMat);
        const inner = new THREE.Mesh(this.innerRingGeo, ringMat);
        inner.position.z = 0.002;
        animatedInner.add(outer, inner);

        for (let t = 0; t < 4; t++) {
          const tick = new THREE.Mesh(this.tickBoxGeo, primaryMat);
          const angle = (t * Math.PI) / 2;
          tick.position.set(
            Math.cos(angle) * 0.092,
            Math.sin(angle) * 0.092,
            0.004,
          );
          tick.rotation.z = angle;
          animatedInner.add(tick);
        }

        const badge = this.createBillboardBadge(spec.label, spec.colorHex);
        badge.mesh.position.set(0, 0.13, 0.02);
        root.add(badge.mesh);
        labelMesh = badge.mesh;
        labelTexture = badge.texture;
        ownedMaterials.push(badge.material);
      } else if (spec.type === 'warning_cone') {
        // High-visibility safety caution cone + reflective collar + badge
        const baseDisc = new THREE.Mesh(
          this.poiBaseDiscGeo,
          this.materials.primerSlate,
        );
        const cone = new THREE.Mesh(this.warnConeGeo, primaryMat);
        cone.position.y = 0.064;

        const reflectiveMat = new THREE.MeshBasicMaterial({
          color: 0xfef3c7,
          side: THREE.DoubleSide,
        });
        ownedMaterials.push(reflectiveMat);
        const band = new THREE.Mesh(this.warnBandGeo, reflectiveMat);
        band.position.y = 0.068;

        animatedInner.add(baseDisc, cone, band);

        const badge = this.createBillboardBadge(spec.label, '#f59e0b');
        badge.mesh.position.set(0, 0.17, 0);
        root.add(badge.mesh);
        labelMesh = badge.mesh;
        labelTexture = badge.texture;
        ownedMaterials.push(badge.material);
      } else {
        // Numbered POI beacon ('poi_pin'): base disc + stem + octahedron gem + billboard tag
        const baseDisc = new THREE.Mesh(
          this.poiBaseDiscGeo,
          this.materials.steelFastener,
        );
        const stem = new THREE.Mesh(
          this.poiStemGeo,
          this.materials.titaniumBrushed,
        );
        stem.position.y = 0.065;

        const orb = new THREE.Mesh(this.poiOrbGeo, primaryMat);
        orb.position.y = 0.145;

        animatedInner.add(baseDisc, stem, orb);

        const badge = this.createBillboardBadge(spec.label, spec.colorHex);
        badge.mesh.position.set(0, 0.22, 0);
        root.add(badge.mesh);
        labelMesh = badge.mesh;
        labelTexture = badge.texture;
        ownedMaterials.push(badge.material);
      }

      this.markersGroup.add(root);
      this.markerNodes.push({
        id: spec.id,
        type: spec.type,
        root,
        animatedInner,
        basePosition: root.position.clone(),
        direction: dir.clone(),
        labelMesh,
        labelTexture,
        ownedMaterials,
      });
    }
  }

  private createBillboardBadge(
    label: string,
    borderHex: string,
  ): {
    readonly mesh: THREE.Mesh;
    readonly texture: THREE.CanvasTexture;
    readonly material: THREE.MeshBasicMaterial;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 92;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(7, 20, 45, 0.94)';
      ctx.fillRect(4, 4, 376, 84);
      ctx.strokeStyle = borderHex || '#38bdf8';
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, 376, 84);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 26px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 22), 192, 46);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.labelPlaneGeo, material);
    mesh.xb = {pointerEvents: 'none'};
    return {mesh, texture, material};
  }

  animate(elapsedSec: number, cameraWorldPos: THREE.Vector3): void {
    // Animate 3D AR visual markers (smooth axial bobbing on arrows, slow spin on POI orbs/rings)
    for (let i = 0; i < this.markerNodes.length; i++) {
      const node = this.markerNodes[i];
      const phase = elapsedSec * 3.1 + i * 0.9;
      if (node.type === 'arrow') {
        const offset = Math.sin(phase) * 0.022;
        node.animatedInner.position.set(
          node.direction.x * offset,
          node.direction.y * offset,
          node.direction.z * offset,
        );
      } else if (node.type === 'circle_ring') {
        node.animatedInner.rotation.z = elapsedSec * 0.55;
        const pulse = 1 + Math.sin(phase) * 0.05;
        node.animatedInner.scale.setScalar(pulse);
      } else {
        node.animatedInner.rotation.y = elapsedSec * 0.85;
      }

      if (node.labelMesh) {
        node.labelMesh.lookAt(cameraWorldPos);
      }
    }

    // Animate 3D Wayfinding beaded arc from operator foreground toward active step target
    if (this.wayfindingGroup.visible && this.wayfindingTarget) {
      _curveStart.set(
        cameraWorldPos.x * 0.35,
        Math.max(1.02, cameraWorldPos.y - 0.36),
        cameraWorldPos.z - 0.58,
      );
      _curveEnd.copy(this.wayfindingTarget);
      _curveMid
        .copy(_curveStart)
        .lerp(_curveEnd, 0.5);
      _curveMid.y += 0.16;

      const count = this.wayfindingBeads.length;
      const flowShift = (elapsedSec * 0.65) % 1;
      for (let i = 0; i < count; i++) {
        const t = ((i / count) + flowShift) % 1;
        // Quadratic Bezier evaluation (zero heap allocation per bead)
        const inv = 1 - t;
        const bx =
          inv * inv * _curveStart.x +
          2 * inv * t * _curveMid.x +
          t * t * _curveEnd.x;
        const by =
          inv * inv * _curveStart.y +
          2 * inv * t * _curveMid.y +
          t * t * _curveEnd.y;
        const bz =
          inv * inv * _curveStart.z +
          2 * inv * t * _curveMid.z +
          t * t * _curveEnd.z;

        const bead = this.wayfindingBeads[i];
        bead.visible = true;
        bead.position.set(bx, by, bz);
        const s = 0.65 + Math.sin(t * Math.PI) * 0.65;
        bead.scale.setScalar(s);
      }
    }

    // Subtle idle rotation on built-in CAD Digital Twin rotating swashplate
    if (this.digitalTwinRoot.visible && this.builtinTwinGroup.visible) {
      const swash = this.builtinTwinGroup.children[2];
      if (swash) {
        swash.rotation.y = elapsedSec * 0.6;
      }
    }
  }

  dispose(): void {
    for (const node of this.markerNodes) {
      node.labelTexture?.dispose();
      for (const m of node.ownedMaterials) {
        m.dispose();
      }
    }
    this.markerNodes = [];
    this.arrowShaftGeo.dispose();
    this.arrowHeadGeo.dispose();
    this.arrowCollarGeo.dispose();
    this.outerRingGeo.dispose();
    this.innerRingGeo.dispose();
    this.tickBoxGeo.dispose();
    this.poiStemGeo.dispose();
    this.poiOrbGeo.dispose();
    this.poiBaseDiscGeo.dispose();
    this.warnConeGeo.dispose();
    this.warnBandGeo.dispose();
    this.labelPlaneGeo.dispose();
    this.beadGeo.dispose();
    this.capturePlaneGeo.dispose();
    this.capturePlaneMat.dispose();
    this.wayfindingMat.dispose();
    for (const g of this.ownedTwinGeometries) g.dispose();
    for (const m of this.ownedTwinMaterials) m.dispose();
  }
}
