import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { create } from 'zustand';
import { BRAND } from '../data/apex';

/**
 * IgnitionIntro — the preloader. Plays on every full page load:
 * a route line is drawn across the dark, a headlight rides it and lights up
 * A·P·E·X, the degree ring ignites, and the "systems check" tracks real loading
 * (fonts + hero photography). Once loaded — and never before a minimum run so the
 * sequence lands — the headlights flare and the frame splits open like a garage door.
 *
 * Skippable with a click or any key. Under prefers-reduced-motion it is skipped.
 */

type IntroPhase = 'loading' | 'flare' | 'opening' | 'done';

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
};

export const useIntro = create<{ phase: IntroPhase; set: (p: IntroPhase) => void }>()((set) => ({
  phase: reducedMotion() ? 'done' : 'loading',
  set: (phase) => set({ phase }),
}));

/** True once the doors have started opening — entrance animations key off this. */
export const useIntroReady = () => useIntro((s) => s.phase === 'opening' || s.phase === 'done');

const MIN_MS = 2300;
const MAX_MS = 6000;
const EASE = [0.76, 0, 0.24, 1] as const;
const LETTERS = ['A', 'P', 'E', 'X'];

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
}

export function IgnitionIntro() {
  const phase = useIntro((s) => s.phase);
  const setPhase = useIntro((s) => s.set);
  const check = useMotionValue(0);
  const checkText = useTransform(check, (v) => String(Math.round(v)).padStart(3, '0'));

  useEffect(() => {
    if (useIntro.getState().phase !== 'loading') return;
    let cancelled = false;
    document.body.style.overflow = 'hidden';

    const crawl = animate(check, 86, { duration: 1.9, delay: 0.9, ease: 'easeOut' });
    const assets = Promise.all([document.fonts?.ready ?? Promise.resolve(), preload('/images/vehicle-suv-960.webp')]);
    const minimum = new Promise((r) => setTimeout(r, MIN_MS));
    const ceiling = new Promise((r) => setTimeout(r, MAX_MS));

    Promise.race([Promise.all([assets, minimum]), ceiling]).then(async () => {
      if (cancelled || useIntro.getState().phase !== 'loading') return;
      crawl.stop();
      await animate(check, 100, { duration: 0.35, ease: 'easeOut' });
      if (cancelled || useIntro.getState().phase !== 'loading') return;
      setPhase('flare');
      setTimeout(() => !cancelled && useIntro.getState().phase === 'flare' && setPhase('opening'), 380);
    });

    const skip = () => {
      if (useIntro.getState().phase === 'loading' || useIntro.getState().phase === 'flare') setPhase('opening');
    };
    window.addEventListener('keydown', skip);
    return () => {
      cancelled = true;
      crawl.stop();
      window.removeEventListener('keydown', skip);
    };
  }, [check, setPhase]);

  useEffect(() => {
    if (phase === 'opening' || phase === 'done') document.body.style.overflow = '';
  }, [phase]);

  if (phase === 'done') return null;
  const opening = phase === 'opening';
  const skip = () => (phase === 'loading' || phase === 'flare') && setPhase('opening');

  return (
    <div className="fixed inset-0 z-[400]" onClick={skip}>
      <span className="sr-only" role="status">
        Loading APEX AutoCare
      </span>

      {/* garage door halves */}
      {(['top', 'bottom'] as const).map((half) => (
        <motion.div
          key={half}
          aria-hidden
          className={`absolute inset-x-0 bg-ink ${half === 'top' ? 'top-0 h-1/2' : 'bottom-0 h-1/2'}`}
          initial={false}
          animate={opening ? { y: half === 'top' ? '-101%' : '101%' } : { y: '0%' }}
          transition={{ duration: 0.95, ease: EASE, delay: half === 'top' ? 0.05 : 0.09 }}
          onAnimationComplete={() => opening && half === 'bottom' && setPhase('done')}
        >
          <motion.span
            className={`absolute inset-x-0 h-px bg-bone ${half === 'top' ? 'bottom-0' : 'top-0'}`}
            style={{ boxShadow: '0 0 30px 6px rgba(236,232,222,.45)' }}
            initial={{ opacity: 0 }}
            animate={opening ? { opacity: [1, 0] } : { opacity: 0 }}
            transition={{ duration: 0.9 }}
          />
        </motion.div>
      ))}

      <AnimatePresence>
        {!opening && (
          <motion.div
            key="logo"
            aria-hidden
            className="absolute inset-0 grid place-items-center overflow-hidden"
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(12px)', transition: { duration: 0.45, ease: EASE } }}
          >
            <div className="relative w-[min(92vw,1100px)]">
              <motion.div
                className="absolute left-0 right-0 top-1/2 h-px origin-left bg-line-strong"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, ease: EASE }}
              />
              <motion.div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white"
                style={{ boxShadow: '0 0 18px 6px rgba(255,255,255,.8), 0 0 90px 30px rgba(201,255,61,.25)' }}
                initial={{ left: '-4%', opacity: 0 }}
                animate={{ left: ['-4%', '104%'], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.25, delay: 0.25, ease: [0.45, 0, 0.2, 1] }}
              />
              <motion.div
                className="absolute top-1/2 h-[2px] w-[38%] -translate-x-full -translate-y-1/2 bg-gradient-to-r from-transparent to-white/70 blur-[1px]"
                initial={{ left: '-4%', opacity: 0 }}
                animate={{ left: ['-4%', '104%'], opacity: [0, 0.9, 0.9, 0] }}
                transition={{ duration: 1.25, delay: 0.25, ease: [0.45, 0, 0.2, 1] }}
              />

              <div className="relative flex items-start justify-center">
                {LETTERS.map((l, i) => (
                  <span key={l} className="relative overflow-hidden">
                    <motion.span
                      className="display-wide block text-[clamp(84px,19vw,280px)] leading-[0.9] text-bone"
                      initial={{ y: '100%', skewX: -14, filter: 'blur(12px)', opacity: 0 }}
                      animate={{ y: '0%', skewX: 0, filter: 'blur(0px)', opacity: 1 }}
                      transition={{ duration: 0.7, delay: 0.42 + i * 0.13, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {l}
                    </motion.span>
                  </span>
                ))}
                <svg viewBox="0 0 40 40" className="ml-[0.6vw] mt-[1.2vw] h-[clamp(22px,4.6vw,68px)] w-[clamp(22px,4.6vw,68px)] shrink-0 overflow-visible">
                  <motion.circle
                    cx="20"
                    cy="20"
                    r="14"
                    fill="none"
                    stroke="var(--color-acid)"
                    strokeWidth="5"
                    initial={{ pathLength: 0, rotate: -90 }}
                    animate={{ pathLength: 1, rotate: 270 }}
                    transition={{ duration: 0.7, delay: 1.05, ease: EASE }}
                    style={{ originX: '50%', originY: '50%' }}
                  />
                  <motion.circle
                    cx="20"
                    cy="20"
                    r="14"
                    fill="none"
                    stroke="var(--color-acid)"
                    strokeWidth="5"
                    initial={{ opacity: 0 }}
                    animate={phase === 'flare' ? { opacity: [0, 0.9, 0], scale: [1, 2.2] } : { opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ originX: '50%', originY: '50%', filter: 'blur(3px)' }}
                  />
                </svg>
              </div>

              <motion.div
                className="mt-6 flex flex-wrap items-center justify-between gap-3 px-1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.05 }}
              >
                <span className="label !text-bone">AutoCare · Mobile detailing</span>
                <span className="label">
                  Systems check <motion.span className="mono text-acid">{checkText}</motion.span>%
                </span>
                <span className="label mono">{BRAND.coordinates}</span>
              </motion.div>
            </div>

            {/* headlight flare, fired once loading completes */}
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,.92), rgba(236,232,222,.35) 25%, transparent 62%)' }}
              initial={{ opacity: 0 }}
              animate={phase === 'flare' ? { opacity: [0, 0.9, 0.6] } : { opacity: 0 }}
              transition={{ duration: 0.38, ease: 'easeOut' }}
            />

            <button
              type="button"
              className="label absolute bottom-6 right-6 border border-line-strong px-3 py-2 hover:!text-bone"
              onClick={(e) => {
                e.stopPropagation();
                skip();
              }}
            >
              Skip intro ↵
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
