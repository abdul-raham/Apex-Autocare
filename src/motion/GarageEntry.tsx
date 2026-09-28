import { motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';

/**
 * GarageEntry — START BOOKING. Headlights flare from the hero vehicle, exposure
 * blooms past white, the frame drops to black and booking mode assembles out of it
 * (GarageArrival, on /book). The hero itself clears its typography and recentres
 * the car while this plays, so it reads as one continuous transformation.
 */

export interface Point {
  x: number;
  y: number;
}

const DURATION = 1.15;

export function GarageEntry({ active, lights, onComplete }: { active: boolean; lights: Point[]; onComplete: () => void }) {
  const reduce = useReducedMotion();
  if (!active) return null;

  if (reduce) {
    return createPortal(
      <motion.div
        className="fixed inset-0 z-[160] bg-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onAnimationComplete={onComplete}
        aria-hidden
      />,
      document.body,
    );
  }

  const cx = lights.length ? lights.reduce((s, p) => s + p.x, 0) / lights.length : window.innerWidth / 2;
  const cy = lights.length ? lights.reduce((s, p) => s + p.y, 0) / lights.length : window.innerHeight / 2;

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[160] overflow-hidden" aria-hidden>
      {lights.map((p, i) => (
        <div key={i}>
          {/* lamp core */}
          <motion.span
            className="absolute rounded-full"
            style={{
              left: p.x,
              top: p.y,
              width: 140,
              height: 140,
              translateX: '-50%',
              translateY: '-50%',
              background: 'radial-gradient(circle, #fff 0%, rgb(236 245 255 / 0.9) 18%, rgb(201 255 61 / 0.25) 45%, transparent 70%)',
              mixBlendMode: 'screen',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1, 5], opacity: [0, 1, 1, 0] }}
            transition={{ duration: DURATION * 0.75, times: [0, 0.2, 0.4, 1], delay: i * 0.06, ease: 'easeOut' }}
          />
          {/* anamorphic streak */}
          <motion.span
            className="absolute h-[3px] w-[180vw]"
            style={{
              left: p.x,
              top: p.y,
              translateX: '-50%',
              translateY: '-50%',
              background: 'linear-gradient(90deg, transparent, rgb(214 236 255 / 0.9) 45%, #fff 50%, rgb(214 236 255 / 0.9) 55%, transparent)',
              filter: 'blur(1px)',
              mixBlendMode: 'screen',
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 1, 1.1], opacity: [0, 1, 0] }}
            transition={{ duration: DURATION * 0.6, delay: 0.05 + i * 0.06, ease: 'easeOut' }}
          />
        </div>
      ))}
      {/* exposure bloom */}
      <motion.div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at ${cx}px ${cy}px, #fff 0%, #f4f2ea 30%, rgb(232 228 216 / 0.9) 60%, rgb(232 228 216 / 0.7) 100%)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1] }}
        transition={{ duration: DURATION * 0.7, times: [0, 0.35, 0.8, 1], ease: 'easeIn' }}
      />
      {/* drop to black */}
      <motion.div
        className="absolute inset-0 bg-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1] }}
        transition={{ duration: DURATION, times: [0, 0.68, 1], ease: [0.76, 0, 0.24, 1] }}
        onAnimationComplete={onComplete}
      />
    </div>,
    document.body,
  );
}

/** The far side of GarageEntry: booking mode fades up out of the black frame. */
export function GarageArrival() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[160]"
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.9, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.1 }}
      style={{ background: 'radial-gradient(circle at 50% 45%, rgb(201 255 61 / 0.12), var(--color-ink) 55%)' }}
    />
  );
}
