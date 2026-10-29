import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/**
 * Installs a zero-dependency procedural RoomEnvironment reflection map on the scene
 * so metallic titanium, inconel, and carbon clearcoat surfaces reflect realistic studio light.
 */
export function applyStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): THREE.Texture | null {
  try {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmremGenerator.dispose();
    return envRT.texture;
  } catch {
    return null;
  }
}

export class AeroMaterialLibrary {
  readonly brushedBumpTexture: THREE.CanvasTexture;
  readonly carbonWeaveTexture: THREE.CanvasTexture;
  readonly spinnerSpiralTexture: THREE.CanvasTexture;
  readonly deckGridTexture: THREE.CanvasTexture;
  readonly contactShadowTexture: THREE.CanvasTexture;

  // Aerospace alloy & composite PBR materials (deliberate >= 0.25 roughness contrast)
  readonly titaniumForged: THREE.MeshStandardMaterial;
  readonly titaniumPolished: THREE.MeshStandardMaterial;
  readonly inconelSuperalloy: THREE.MeshStandardMaterial;
  readonly singleCrystalGoldNickel: THREE.MeshStandardMaterial;
  readonly ceramicLinerMatte: THREE.MeshStandardMaterial;
  readonly anodizedBlue: THREE.MeshStandardMaterial;
  readonly anodizedAmber: THREE.MeshStandardMaterial;
  readonly carbonCompositeCowl: THREE.MeshPhysicalMaterial;
  readonly acousticHoneycombInner: THREE.MeshStandardMaterial;
  readonly gantrySteelDark: THREE.MeshStandardMaterial;
  readonly gantrySafetyRail: THREE.MeshStandardMaterial;
  readonly workstandDeck: THREE.MeshStandardMaterial;
  readonly fuselagePrimerGreen: THREE.MeshStandardMaterial;
  readonly kaptonGoldFoil: THREE.MeshStandardMaterial;
  readonly contactShadow: THREE.MeshBasicMaterial;

  // AR Holographic Guidance & NDT Inspection materials
  readonly arGhostSolid: THREE.MeshBasicMaterial;
  readonly arGhostWire: THREE.LineBasicMaterial;
  readonly arChevronGuide: THREE.MeshBasicMaterial;
  readonly arDatumBeam: THREE.MeshBasicMaterial;
  readonly scanRingLaser: THREE.MeshBasicMaterial;
  readonly correlationWire: THREE.LineBasicMaterial;

  private readonly disposables: Array<{dispose(): void}> = [];

  constructor(maxAnisotropy = 4) {
    this.brushedBumpTexture = this.createBrushedMetalTexture(maxAnisotropy);
    this.carbonWeaveTexture = this.createCarbonWeaveTexture(maxAnisotropy);
    this.spinnerSpiralTexture = this.createSpinnerSpiralTexture(maxAnisotropy);
    this.deckGridTexture = this.createDeckGridTexture(maxAnisotropy);
    this.contactShadowTexture = this.createContactShadowTexture();

    this.disposables.push(
      this.brushedBumpTexture,
      this.carbonWeaveTexture,
      this.spinnerSpiralTexture,
      this.deckGridTexture,
      this.contactShadowTexture,
    );

    // 1. Forged Titanium (matte-satin structural alloy, roughness 0.48)
    this.titaniumForged = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.84,
        roughness: 0.48,
        bumpMap: this.brushedBumpTexture,
        bumpScale: 0.004,
      }),
    );

    // 2. Polished Bearing & Blade Leading-Edge Steel/Ti (mirror-sheen, roughness 0.16)
    this.titaniumPolished = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        metalness: 0.94,
        roughness: 0.16,
      }),
    );

    // 3. Heat-Treated Inconel 718 / 625 (warm gunmetal nickel, roughness 0.42)
    this.inconelSuperalloy = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.86,
        roughness: 0.42,
        bumpMap: this.brushedBumpTexture,
        bumpScale: 0.003,
      }),
    );

    // 4. CMSX-4 Single-Crystal Turbine Superalloy (warm bronze-champagne, roughness 0.24)
    this.singleCrystalGoldNickel = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd6b88d,
        metalness: 0.9,
        roughness: 0.24,
      }),
    );

    // 5. Thermal Barrier Ceramic Combustor Liner (matte mineral, roughness 0.78)
    this.ceramicLinerMatte = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.18,
        roughness: 0.78,
      }),
    );

    // 6. AN-Spec Anodized Aerospace Blue Fittings (roughness 0.28)
    this.anodizedBlue = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.76,
        roughness: 0.28,
      }),
    );

    // 7. FADEC Kapton / Sensor Harness Gold-Amber (roughness 0.35)
    this.anodizedAmber = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.65,
        roughness: 0.35,
      }),
    );

    // 8. Acoustic Carbon-Fiber Reinforced Polymer (CFRP) Nacelle Outer Skin (clearcoat 0.85, roughness 0.22)
    this.carbonCompositeCowl = this.track(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: this.carbonWeaveTexture,
        metalness: 0.22,
        roughness: 0.24,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
        side: THREE.DoubleSide,
      }),
    );

    // 9. Perforated Acoustic Honeycomb Inner Liner (roughness 0.68)
    this.acousticHoneycombInner = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.35,
        roughness: 0.68,
        side: THREE.DoubleSide,
      }),
    );

    // 10. Gantry Heavy Structural Steel (roughness 0.62)
    this.gantrySteelDark = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.65,
        roughness: 0.62,
      }),
    );

    this.gantrySafetyRail = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        metalness: 0.5,
        roughness: 0.34,
      }),
    );

    this.workstandDeck = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.deckGridTexture,
        metalness: 0.22,
        roughness: 0.66,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    this.contactShadow = this.track(
      new THREE.MeshBasicMaterial({
        map: this.contactShadowTexture,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );

    // AR Guidance Hologram Materials
    this.arGhostSolid = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    this.arGhostWire = this.track(
      new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.72,
      }),
    );

    this.arChevronGuide = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    this.arDatumBeam = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );

    this.scanRingLaser = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    this.fuselagePrimerGreen = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x5c7c32,
        metalness: 0.36,
        roughness: 0.56,
        bumpMap: this.brushedBumpTexture,
        bumpScale: 0.002,
        side: THREE.DoubleSide,
      }),
    );

    this.kaptonGoldFoil = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd99b26,
        metalness: 0.78,
        roughness: 0.32,
        bumpMap: this.brushedBumpTexture,
        bumpScale: 0.006,
        side: THREE.DoubleSide,
      }),
    );

    this.correlationWire = this.track(
      new THREE.LineBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.85,
      }),
    );
  }

  createSpinnerMaterial(): THREE.MeshStandardMaterial {
    return this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.spinnerSpiralTexture,
        metalness: 0.35,
        roughness: 0.25,
      }),
    );
  }

  private track<T extends {dispose(): void}>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private createBrushedMetalTexture(anisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y++) {
      const shade = 112 + ((y * 37) % 32);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, 256, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    // Linear data map (NoColorSpace)
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = anisotropy;
    return tex;
  }

  private createCarbonWeaveTexture(anisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#141a23';
    ctx.fillRect(0, 0, 128, 128);

    const cell = 16;
    for (let y = 0; y < 128; y += cell) {
      for (let x = 0; x < 128; x += cell) {
        const odd = ((x / cell + y / cell) & 1) === 1;
        ctx.fillStyle = odd ? '#243040' : '#18212d';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.fillStyle = odd ? '#334155' : '#1e293b';
        ctx.fillRect(x + 2, y + 2, cell - 6, 4);
      }
    }

    // Subtle aerospace stripe accent along nacelle
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 58, 128, 10);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 3);
    tex.anisotropy = anisotropy;
    return tex;
  }

  private createSpinnerSpiralTexture(anisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 256);

    // Classic jet spinner white safety spiral band
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 28;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(256, 224);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = anisotropy;
    return tex;
  }

  private createDeckGridTexture(anisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 512);

    // Fine metric calibration grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Centerline datum crosshair
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256, 24);
    ctx.lineTo(256, 488);
    ctx.stroke();

    // Safety yellow/slate perimeter border
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 488, 488);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  }

  private createContactShadowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 124);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.85)');
    grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.38)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables.length = 0;
  }
}
