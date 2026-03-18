/**
 * Play a subtle notification sound using Web Audio API.
 * No external files needed — generates a short, pleasant tone.
 */
let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try { audioCtx = new AudioContext(); } catch { return null; }
  }
  return audioCtx;
}

/** Short ascending two-tone chime (published) */
export function playPublishSound() {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  // First tone
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now); // A5
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.15);

  // Second tone (higher)
  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.12, now + 0.12);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1175, now + 0.12); // D6
  osc2.connect(gain2);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.35);
}

/** Short descending two-tone chime (expired/unpublished) */
export function playExpireSound() {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  // First tone (higher)
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now); // A5
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.15);

  // Second tone (lower)
  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.1, now + 0.12);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(660, now + 0.12); // E5
  osc2.connect(gain2);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.35);
}
