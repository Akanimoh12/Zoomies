import type { Sfx } from './engine';

/* Tiny synth sound effects. Audio starts only after a user gesture. */
export class Sound {
  private ac: AudioContext | null = null;
  muted = false;

  unlock() {
    if (!this.ac) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new Ctor();
      } catch {
        return;
      }
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
  }

  private tone(f1: number, f2: number, dur: number, type: OscillatorType = 'square', vol = 0.05) {
    const ac = this.ac;
    if (!ac || this.muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(e: Sfx) {
    switch (e) {
      case 'jump': return this.tone(320, 760, 0.12);
      case 'slide': return this.tone(520, 180, 0.12, 'triangle');
      case 'bone': return this.tone(980, 1500, 0.07, 'square', 0.035);
      case 'close': return this.tone(700, 1200, 0.09, 'triangle', 0.05);
      case 'mile': return this.tone(520, 1040, 0.18, 'triangle', 0.05);
      case 'crash': return this.tone(240, 45, 0.4, 'sawtooth', 0.08);
      case 'zoom':
      case 'echo':
        this.tone(400, 1200, 0.25, 'triangle', 0.07);
        setTimeout(() => this.tone(600, 1600, 0.2, 'triangle', 0.05), 120);
        return;
    }
  }
}
