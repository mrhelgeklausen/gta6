// Synthesised retro sound effects with WebAudio (no audio files).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: two detuned saws through a lowpass
    this.engGain = this.ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = this.ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 600;
    this.engOsc = [this.ctx.createOscillator(), this.ctx.createOscillator()];
    this.engOsc[0].type = 'sawtooth';
    this.engOsc[1].type = 'square';
    for (const o of this.engOsc) { o.frequency.value = 40; o.connect(this.engFilter); o.start(); }
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    // siren
    this.sirGain = this.ctx.createGain();
    this.sirGain.gain.value = 0;
    this.sirOsc = this.ctx.createOscillator();
    this.sirOsc.type = 'square';
    this.sirOsc.connect(this.sirGain);
    this.sirGain.connect(this.master);
    this.sirOsc.start();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _noise(dur, vol, freq, type = 'lowpass', freqEnd) {
    if (!this.ctx || vol < 0.01) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5 + Math.random() * 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx || vol < 0.01) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot(kind = 1, vol = 1) {
    if (kind === 3) { this._noise(0.45, 0.9 * vol, 2500, 'lowpass', 200); this._tone('square', 120, 40, 0.2, 0.3 * vol); }
    else if (kind === 2) { this._noise(0.09, 0.5 * vol, 3500, 'lowpass', 600); }
    else { this._noise(0.22, 0.7 * vol, 3000, 'lowpass', 300); this._tone('square', 220, 60, 0.08, 0.25 * vol); }
  }
  punch(vol = 1) { this._noise(0.08, 0.6 * vol, 900, 'lowpass', 200); }
  crash(power = 1) { this._noise(0.35, Math.min(1, 0.3 + power * 0.5), 1400, 'lowpass', 150); this._tone('square', 90, 40, 0.15, 0.2 * power); }
  explosion(vol = 1) {
    this._noise(1.6, vol, 1200, 'lowpass', 60);
    this._tone('sawtooth', 80, 20, 0.9, 0.5 * vol);
  }
  splat(vol = 1) { this._noise(0.15, 0.5 * vol, 600, 'lowpass', 100); }
  scream(vol = 1) {
    const f = 600 + Math.random() * 500;
    this._tone('square', f, f * 0.6, 0.5, 0.08 * vol);
  }
  cash() { this._tone('square', 880, 880, 0.06, 0.15); this._tone('square', 1320, 1320, 0.12, 0.15, 0.06); }
  heal() { this._tone('square', 523, 523, 0.08, 0.15); this._tone('square', 784, 784, 0.15, 0.15, 0.08); }
  hurt() { this._tone('square', 200, 80, 0.15, 0.2); }
  horn() { this._tone('square', 392, 392, 0.3, 0.12); this._tone('square', 330, 330, 0.3, 0.12); }
  click() { this._tone('square', 1200, 1200, 0.03, 0.08); }
  door() { this._noise(0.12, 0.4, 500, 'lowpass', 100); }
  wasted() { this._tone('sawtooth', 300, 40, 2.5, 0.3); }
  star() { this._tone('square', 660, 660, 0.08, 0.12); this._tone('square', 440, 440, 0.15, 0.12, 0.08); }

  engine(on, rpm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.1);
    const f = 35 + rpm * 90;
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc[1].frequency.setTargetAtTime(f * 0.501, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + rpm * 900, t, 0.1);
  }

  siren(vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirGain.gain.setTargetAtTime(Math.min(0.06, vol * 0.06), t, 0.2);
    this.sirOsc.frequency.setTargetAtTime((t * 1.5) % 1 < 0.5 ? 950 : 700, t, 0.02);
  }
}
