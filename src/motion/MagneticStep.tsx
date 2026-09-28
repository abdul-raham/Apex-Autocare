import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * MagneticStep — booking panels track horizontally with a little inertia and snap
 * into place, like a camera dolly locking onto its mark.
 */

const variants = {
  enter: (dir: number) => ({ x: `${dir * 38}%`, opacity: 0, skewX: dir * -2 }),
  center: { x: '0%', opacity: 1, skewX: 0 },
  exit: (dir: number) => ({ x: `${dir * -26}%`, opacity: 0, skewX: dir * 1.5 }),
};

export function MagneticStep({ stepKey, direction, children }: { stepKey: string | number; direction: 1 | -1; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative overflow-x-clip">
      <AnimatePresence mode="popLayout" custom={direction} initial={false}>
        <motion.div
          key={stepKey}
          custom={direction}
          variants={variants}
          initial={reduce ? { opacity: 0 } : 'enter'}
          animate="center"
          exit={reduce ? { opacity: 0 } : 'exit'}
          transition={
            reduce
              ? { duration: 0.15 }
              : {
                  x: { type: 'spring', stiffness: 190, damping: 24, mass: 0.9 },
                  skewX: { type: 'spring', stiffness: 190, damping: 24 },
                  opacity: { duration: 0.25 },
                }
          }
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
