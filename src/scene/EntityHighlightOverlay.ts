import * as THREE from 'three';

const MAX_HIGHLIGHT_SLOTS = 6;

const _worldToDatum = new THREE.Matrix4();
const _nodeToDatum = new THREE.Matrix4();
const _accumBox = new THREE.Box3();
const _childBox = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _color = new THREE.Color();
const _stack: THREE.Object3D[] = [];

interface HighlightSlot {
  readonly root: THREE.Group;
  readonly cageBoxGroup: THREE.Group;
  readonly wireMat: THREE.LineBasicMaterial;
  readonly shellMat: THREE.MeshBasicMaterial;
  readonly markerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly markerMat: THREE.MeshBasicMaterial;
}

/**
 * Non-destructive, zero-GC 3D AR Entity Highlight Overlay.
 * Wraps up to 6 targeted 3D CAD sub-entities in animated holographic bounding cages
 * and camera-facing target reticles without mutating shared PBR materials.
 */
export class EntityHighlightOverlay extends THREE.Group {
  private readonly slots: HighlightSlot[] = [];
  private readonly sharedUnitBoxGeo: THREE.BoxGeometry;
  private readonly sharedUnitEdgesGeo: THREE.EdgesGeometry;
  private readonly sharedRingGeo: THREE.RingGeometry;
  private lastHex = '';

  constructor() {
    super();
    this.name = 'AR Entity Highlight Overlay';
    this.xb = {pointerEvents: 'none'};

    this.sharedUnitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sharedUnitEdgesGeo = new THREE.EdgesGeometry(this.sharedUnitBoxGeo);
    this.sharedRingGeo = new THREE.RingGeometry(0.014, 0.023, 24);

    for (let i = 0; i < MAX_HIGHLIGHT_SLOTS; i++) {
      const slotRoot = new THREE.Group();
      slotRoot.visible = false;
      slotRoot.xb = {pointerEvents: 'none'};

      const cageBoxGroup = new THREE.Group();
      cageBoxGroup.xb = {pointerEvents: 'none'};

      const wireMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const wireSegments = new THREE.LineSegments(
        this.sharedUnitEdgesGeo,
        wireMat,
      );
      wireSegments.renderOrder = 12;
      wireSegments.xb = {pointerEvents: 'none'};

      const shellMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shellMesh = new THREE.Mesh(this.sharedUnitBoxGeo, shellMat);
      shellMesh.renderOrder = 11;
      shellMesh.xb = {pointerEvents: 'none'};

      cageBoxGroup.add(shellMesh, wireSegments);

      const markerMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const markerRing = new THREE.Mesh(this.sharedRingGeo, markerMat);
      markerRing.renderOrder = 13;
      markerRing.xb = {pointerEvents: 'none'};

      slotRoot.add(cageBoxGroup, markerRing);
      this.add(slotRoot);

      this.slots.push({
        root: slotRoot,
        cageBoxGroup,
        wireMat,
        shellMat,
        markerRing,
        markerMat,
      });
    }
  }

  syncHighlights(
    datumRoot: THREE.Object3D,
    entityMap: ReadonlyMap<string, THREE.Object3D>,
    entityIds: readonly string[],
    colorHex: string,
    enabled: boolean,
    elapsed: number,
    cameraWorldPos: THREE.Vector3,
  ): void {
    if (!enabled || entityIds.length === 0) {
      this.visible = false;
      return;
    }

    this.visible = true;
    if (colorHex !== this.lastHex) {
      this.lastHex = colorHex;
      _color.set(colorHex);
      for (const slot of this.slots) {
        slot.wireMat.color.copy(_color);
        slot.shellMat.color.copy(_color);
        slot.markerMat.color.copy(_color);
      }
    }

    datumRoot.updateWorldMatrix(true, true);
    _worldToDatum.copy(datumRoot.matrixWorld).invert();

    const count = Math.min(entityIds.length, MAX_HIGHLIGHT_SLOTS);
    for (let i = 0; i < MAX_HIGHLIGHT_SLOTS; i++) {
      const slot = this.slots[i];
      if (i >= count) {
        slot.root.visible = false;
        continue;
      }

      const targetObj = entityMap.get(entityIds[i]);
      if (!targetObj || !this.computeBoundsInDatumSpace(targetObj)) {
        slot.root.visible = false;
        continue;
      }

      _accumBox.getCenter(_center);
      _accumBox.getSize(_size);

      const pulse = 1 + Math.sin(elapsed * 4.2 + i * 0.9) * 0.025;
      const sx = Math.max(0.038, _size.x + 0.018) * pulse;
      const sy = Math.max(0.038, _size.y + 0.018) * pulse;
      const sz = Math.max(0.038, _size.z + 0.018) * pulse;

      slot.root.visible = true;
      slot.root.position.copy(_center);
      slot.cageBoxGroup.scale.set(sx, sy, sz);

      slot.shellMat.opacity = 0.11 + Math.sin(elapsed * 4.2 + i) * 0.04;
      slot.wireMat.opacity = 0.78 + Math.sin(elapsed * 4.2 + i) * 0.18;

      slot.markerRing.position.set(0, sy * 0.5 + 0.024, 0);
      slot.markerRing.lookAt(cameraWorldPos);
      const ringScale = 0.92 + Math.sin(elapsed * 5.0 + i) * 0.12;
      slot.markerRing.scale.setScalar(ringScale);
    }
  }

  private computeBoundsInDatumSpace(targetObj: THREE.Object3D): boolean {
    _accumBox.makeEmpty();
    _stack.length = 0;
    _stack.push(targetObj);

    while (_stack.length > 0) {
      const node = _stack.pop()!;
      const children = node.children;
      for (let c = 0; c < children.length; c++) {
        _stack.push(children[c]);
      }

      if ((node as THREE.InstancedMesh).isInstancedMesh) {
        const inst = node as THREE.InstancedMesh;
        if (!inst.boundingBox) {
          inst.computeBoundingBox();
        }
        if (inst.boundingBox) {
          _nodeToDatum.multiplyMatrices(_worldToDatum, inst.matrixWorld);
          _childBox.copy(inst.boundingBox).applyMatrix4(_nodeToDatum);
          _accumBox.union(_childBox);
        }
      } else if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const geo = mesh.geometry;
        if (!geo.boundingBox) {
          geo.computeBoundingBox();
        }
        if (geo.boundingBox) {
          _nodeToDatum.multiplyMatrices(_worldToDatum, mesh.matrixWorld);
          _childBox.copy(geo.boundingBox).applyMatrix4(_nodeToDatum);
          _accumBox.union(_childBox);
        }
      }
    }

    return !_accumBox.isEmpty();
  }

  dispose(): void {
    this.sharedUnitBoxGeo.dispose();
    this.sharedUnitEdgesGeo.dispose();
    this.sharedRingGeo.dispose();
    for (const slot of this.slots) {
      slot.wireMat.dispose();
      slot.shellMat.dispose();
      slot.markerMat.dispose();
    }
  }
}
