import type {ActionFeedback} from '../assembly/assemblyEngine';

/**
 * Zero-dependency Web Audio API procedural sound synthesizer for aerospace tool feedback.
 */
export class AeroSoundSynth {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext})
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playForFeedback(kind: ActionFeedback['kind']): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    switch (kind) {
      case 'install':
        // Pneumatic torque seat + lock click
        this.playTone(ctx, 210, 340, now, 0.09, 'triangle', 0.12);
        this.playTone(ctx, 680, 920, now + 0.08, 0.07, 'sine', 0.1);
        break;
      case 'inspect_pass':
        // Crisp dual-tone NDT pass chirp
        this.playTone(ctx, 587.33, 587.33, now, 0.07, 'sine', 0.09);
        this.playTone(ctx, 880, 880, now + 0.07, 0.11, 'sine', 0.1);
        break;
      case 'inspect_fail':
        // Low-frequency non-conformance alert
        this.playTone(ctx, 310, 220, now, 0.14, 'sawtooth', 0.09);
        this.playTone(ctx, 220, 185, now + 0.15, 0.16, 'sawtooth', 0.09);
        break;
      case 'rework':
        // Precision shim/torque calibration confirmation
        this.playTone(ctx, 440, 554.37, now, 0.08, 'triangle', 0.1);
        this.playTone(ctx, 659.25, 880, now + 0.08, 0.14, 'sine', 0.11);
        break;
      case 'signoff':
        // Airworthiness release triad
        this.playTone(ctx, 523.25, 523.25, now, 0.12, 'sine', 0.1);
        this.playTone(ctx, 659.25, 659.25, now + 0.1, 0.12, 'sine', 0.1);
        this.playTone(ctx, 1046.5, 1046.5, now + 0.2, 0.24, 'sine', 0.12);
        break;
      case 'blocked':
        this.playTone(ctx, 190, 160, now, 0.09, 'triangle', 0.07);
        break;
      default:
        this.playTone(ctx, 520, 560, now, 0.04, 'sine', 0.05);
        break;
    }
  }

  private playTone(
    ctx: AudioContext,
    freqStart: number,
    freqEnd: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, startTime);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        startTime + duration,
      );

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch {
      // Ignore audio errors in restricted headless environments
    }
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
