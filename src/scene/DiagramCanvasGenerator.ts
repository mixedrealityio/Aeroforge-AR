import * as THREE from 'three';

import type {AssemblyStepSpec, ScenarioDefinition} from '../assembly/assemblyData';
import type {DocViewMode} from '../assembly/assemblyEngine';

/**
 * Renders OmniStep-style Poka-Yoke "OK vs KO" comparison cards and 2D technical
 * assembly schematics onto a retained CanvasTexture for xb.UIImage.
 */
export class DiagramCanvasGenerator {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastCacheKey = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 220;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
  }

  render(
    scenario: ScenarioDefinition,
    step: AssemblyStepSpec,
    mode: DocViewMode,
    installed: boolean,
  ): void {
    const key = `${scenario.id}:${step.id}:${mode}:${installed}`;
    if (key === this.lastCacheKey) return;
    this.lastCacheKey = key;

    if (mode === 'ok_ko') {
      this.drawOkKoComparison(step);
    } else {
      this.drawTechnicalBlueprint(scenario, step, installed);
    }
    this.texture.needsUpdate = true;
  }

  private drawOkKoComparison(step: AssemblyStepSpec): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#07142b';
    ctx.fillRect(0, 0, w, h);

    // Subtle blueprint grid
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.09)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Left OK Box
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 302, h - 20);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(10, 10, 302, h - 20);

    // Right KO Box
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(328, 10, 302, h - 20);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.fillRect(328, 10, 302, h - 20);

    // OK / KO Labels (matching OmniStep video 0:44 visual language)
    ctx.font = '700 24px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('OK', 22, 39);
    ctx.font = '700 15px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ecfdf5';
    ctx.fillText(step.diagram.okLabel.replace(/^OK\s*·\s*/, ''), 68, 37);

    ctx.font = '700 24px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#f87171';
    ctx.fillText('KO', 340, 39);
    ctx.font = '700 15px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#fef2f2';
    ctx.fillText(step.diagram.koLabel.replace(/^KO\s*·\s*/, ''), 386, 37);

    // Motif vector illustrations
    this.drawMotifGraphic(step.diagram.motif, 161, 114, true);
    this.drawMotifGraphic(step.diagram.motif, 479, 114, false);

    // Bottom detail captions
    ctx.font = '600 14px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(step.diagram.okDetail, 20, h - 20);

    ctx.fillStyle = '#fecaca';
    ctx.fillText(step.diagram.koDetail, 338, h - 20);
  }

  private drawMotifGraphic(
    motif: AssemblyStepSpec['diagram']['motif'],
    cx: number,
    cy: number,
    isOk: boolean,
  ): void {
    const ctx = this.ctx;
    const accent = isOk ? '#34d399' : '#f87171';
    ctx.save();
    ctx.translate(cx, cy);

    if (motif === 'pin_length') {
      // Base fuselage plate
      ctx.fillStyle = '#475569';
      ctx.fillRect(-70, 28, 140, 10);
      // Pin adhesive base disc
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-26, 20, 52, 8);
      // Pin vertical shaft (tall 40mm for OK, short 30mm for KO)
      const pinH = isOk ? 64 : 38;
      ctx.fillStyle = accent;
      ctx.fillRect(-5, 20 - pinH, 10, pinH);
      // Dimension leader line
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(36, 20);
      ctx.lineTo(36, 20 - pinH);
      ctx.stroke();
      ctx.font = '600 13px monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(isOk ? '40.0 mm' : '30.0 mm', 44, 20 - pinH / 2 + 4);
    } else if (motif === 'bracket_tab') {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.strokeRect(-60, -28, 120, 56);
      ctx.fillStyle = accent;
      const tabY = isOk ? -34 : 18;
      ctx.fillRect(-18, tabY, 36, 16);
      ctx.font = '600 13px monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(isOk ? 'TAB +Y UP' : 'INVERTED -Y', -42, 4);
    } else if (motif === 'blanket_film') {
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(-74, 18, 148, 10);
      ctx.fillStyle = isOk ? '#d97706' : '#64748b';
      ctx.fillRect(-70, -16, 140, 28);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-70, -18);
      ctx.lineTo(70, -18);
      ctx.stroke();
      ctx.font = '600 12px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(isOk ? 'KAPTON +Z CABIN' : 'FILM REVERSED', -56, 2);
    } else if (motif === 'clamp_gap') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-72, 16, 144, 10);
      const gap = isOk ? 22 : 4;
      ctx.fillStyle = accent;
      ctx.fillRect(-48, 16 - gap - 14, 96, 14);
      ctx.font = '600 13px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(isOk ? 'GAP IN-SPEC' : 'CHAFE / GAP KO', -52, -22);
    } else if (motif === 'torque_star') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.fillStyle = i === 3 && !isOk ? '#ef4444' : '#e2e8f0';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 30, Math.sin(a) * 30, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(-68, -18, 64, 40);
      ctx.fillRect(isOk ? -2 : 12, -18, 64, 40);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(-70, -20, 140, 44);
    }

    if (!isOk) {
      // Crisp diagonal rejection slash
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-82, -34);
      ctx.lineTo(-46, 2);
      ctx.moveTo(-46, -34);
      ctx.lineTo(-82, 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawTechnicalBlueprint(
    scenario: ScenarioDefinition,
    step: AssemblyStepSpec,
    installed: boolean,
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#081a38';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(96, 165, 250, 0.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Title block header
    ctx.fillStyle = 'rgba(30, 64, 175, 0.45)';
    ctx.fillRect(11, 11, w - 22, 32);
    ctx.font = '700 14px monospace';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(
      `DWG ${step.partNumber} · ${scenario.workOrderId} · ${step.code}`,
      22,
      32,
    );

    ctx.fillStyle = installed ? '#34d399' : '#fbbf24';
    ctx.fillText(installed ? 'MOUNTED' : 'STAGED', w - 98, 32);

    if (scenario.id === 'panel_buildup') {
      // Curved Dassault-style fuselage section schematic (matching OmniStep screenshot)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(320, 275, 215, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();

      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(320, 275, 185, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();

      // Radial frames & active station highlight
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.23 + i * 0.11);
        const x1 = 320 + Math.cos(a) * 182;
        const y1 = 275 + Math.sin(a) * 182;
        const x2 = 320 + Math.cos(a) * 218;
        const y2 = 275 + Math.sin(a) * 218;
        const active = i + 1 === step.id;
        ctx.strokeStyle = active ? '#ef4444' : '#64748b';
        ctx.lineWidth = active ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (active) {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Axial turbofan cross-section schematic with 6 stage stations
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(40, 118);
      ctx.lineTo(w - 40, 118);
      ctx.stroke();
      ctx.setLineDash([]);

      const stationX = [310, 120, 225, 365, 480, 290];
      const stationW = [280, 62, 86, 82, 92, 340];
      const stationH = [26, 96, 66, 62, 68, 112];
      for (let i = 0; i < 6; i++) {
        const active = i + 1 === step.id;
        ctx.strokeStyle = active ? '#fbbf24' : 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = active ? 3 : 1.5;
        ctx.strokeRect(
          stationX[i] - stationW[i] / 2,
          118 - stationH[i] / 2,
          stationW[i],
          stationH[i],
        );
      }
    }

    // Bottom engineering tolerance callout
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(18, h - 42, w - 36, 26);
    ctx.font = '600 13px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(
      `${step.diagram.metricCallout} · ${step.alloySpec.slice(0, 38)}`,
      28,
      h - 24,
    );
  }

  dispose(): void {
    this.texture.dispose();
  }
}
