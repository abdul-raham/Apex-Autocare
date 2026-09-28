import { motion } from 'framer-motion';
import type { Step } from '../../store/bookingStore';

export interface BookingProgressRailProps {
  steps: readonly string[];
  current: Step;
  /** Furthest step reached; everything up to it is an editable checkpoint. */
  reached: Step;
  /** Short value shown under each completed checkpoint. */
  summaries?: (string | null)[];
  onSelect?: (step: Step) => void;
  /** Play the assembly animation (used after GarageEntry). */
  assemble?: boolean;
}

/**
 * VEHICLE — SERVICE — LOCATION — TIME — CONFIRM. Completed stages become
 * checkpoints that stay clickable, so any choice can be revisited.
 */
export function BookingProgressRail({ steps, current, reached, summaries = [], onSelect, assemble = false }: BookingProgressRailProps) {
  return (
    <nav aria-label="Booking progress" className="relative">
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((label, i) => {
          const done = i < current || (i <= reached && i !== current);
          const active = i === current;
          const clickable = i <= reached && !active;
          return (
            <motion.li
              key={label}
              className="relative"
              initial={assemble ? { opacity: 0, y: -10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* connector */}
              <div className="absolute left-0 right-0 top-[15px] h-px bg-line-strong" aria-hidden>
                <motion.div
                  className="h-full origin-left bg-acid"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: i < current ? 1 : active ? 0.5 : 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: assemble ? 0.5 + i * 0.08 : 0 }}
                />
              </div>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSelect?.(i as Step)}
                aria-current={active ? 'step' : undefined}
                className="group relative flex w-full flex-col items-start gap-2 pr-2 text-left disabled:cursor-default"
              >
                <span
                  className={`relative z-10 grid h-[31px] w-[31px] place-items-center border text-[11px] transition-colors ${
                    active
                      ? 'border-acid bg-acid text-ink'
                      : done
                        ? 'border-acid/60 bg-ink text-acid group-hover:border-acid'
                        : 'border-line-strong bg-ink text-dim'
                  }`}
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)' }}
                >
                  <span className="mono">{done ? '✓' : String(i + 1).padStart(2, '0')}</span>
                </span>
                <span className={`label !text-[9.5px] sm:!text-[10.5px] ${active ? '!text-bone' : done ? '!text-silver' : ''}`}>{label}</span>
                <span className="hidden min-h-[16px] max-w-full truncate text-[12px] text-muted sm:block">{done ? summaries[i] ?? '' : ''}</span>
              </button>
            </motion.li>
          );
        })}
      </ol>
    </nav>
  );
}
