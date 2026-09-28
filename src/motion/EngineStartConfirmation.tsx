import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

/**
 * EngineStartConfirmation — after a successful deposit the screen dips, the frame
 * shudders like an engine catching, an illumination sweep lights the UI back up and
 * the ConfirmationPass locks into place. Sound is opt-in only and only ever plays
 * right after the user's own press.
 */

export function EngineStartConfirmation({ children, sound = false }: { children: ReactNode; sound?: boolean }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (sound && !reduce) playIgnition();
  }, [sound, reduce]);

  if (reduce) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {children}
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* dip to dark */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-[140] bg-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.92, 0.92, 0] }}
        transition={{ duration: 1.35, times: [0, 0.15, 0.45, 1], ease: 'easeInOut' }}
        aria-hidden
      />
      {/* illumination sweep */}
      <motion.div
        className="pointer-events-none fixed inset-y-0 z-[141] w-[40vw]"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(201 255 61 / 0.35), rgb(255 255 255 / 0.5), transparent)', filter: 'blur(24px)' }}
        initial={{ x: '-50vw', opacity: 0 }}
        animate={{ x: '120vw', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.75, delay: 0.5, ease: [0.76, 0, 0.24, 1] }}
        aria-hidden
      />
      {/* ignition shudder, then lock */}
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 1.035 }}
        animate={{
          opacity: [0, 0, 1, 1],
          y: [26, 26, 0, 0],
          scale: [1.035, 1.035, 1, 1],
          x: [0, 0, 0, -2, 2, -1.5, 1.5, -0.5, 0],
        }}
        transition={{ duration: 1.5, times: [0, 0.35, 0.62, 0.66, 0.72, 0.78, 0.84, 0.9, 1], ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Synthesised starter crank + idle catch. No audio files, no autoplay. */
function playIgnition() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  const out = ctx.createGain();
  out.gain.value = 0.18;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  lp.connect(out).connect(ctx.destination);

  const t = ctx.currentTime;
  // starter crank
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 22;
    g.gain.setValueAtTime(0, t + i * 0.13);
    g.gain.linearRampToValueAtTime(0.7, t + i * 0.13 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.13 + 0.11);
    o.connect(g).connect(lp);
    o.start(t + i * 0.13);
    o.stop(t + i * 0.13 + 0.12);
  }
  // catch and idle
  const engine = ctx.createOscillator();
  const eg = ctx.createGain();
  engine.type = 'sawtooth';
  engine.frequency.setValueAtTime(30, t + 0.4);
  engine.frequency.exponentialRampToValueAtTime(78, t + 0.75);
  engine.frequency.exponentialRampToValueAtTime(42, t + 1.4);
  eg.gain.setValueAtTime(0, t + 0.4);
  eg.gain.linearRampToValueAtTime(0.9, t + 0.5);
  eg.gain.exponentialRampToValueAtTime(0.01, t + 2.2);
  engine.connect(eg).connect(lp);
  engine.start(t + 0.4);
  engine.stop(t + 2.3);
  setTimeout(() => void ctx.close(), 2600);
}
