import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { naira, zoneById } from '../../lib/catalog';
import { dayShort, dateLabel, duration, hhmm } from '../../lib/time';
import { useBooking, useQuote } from '../../store/bookingStore';
import { Ticker } from './Ticker';

export interface LiveQuoteCapsuleProps {
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}

/**
 * Floating summary that follows the booking flow — price, time on the car,
 * location and slot, all derived from the shared draft and central pricing.
 * Expands into a line-item breakdown.
 */
export function LiveQuoteCapsule({ onContinue, continueLabel = 'Continue', continueDisabled = false }: LiveQuoteCapsuleProps) {
  const q = useQuote();
  const draft = useBooking((s) => s.draft);
  const [open, setOpen] = useState(false);
  const zone = draft.zoneId ? zoneById(draft.zoneId) : null;
  const slotText = draft.slotStart !== null ? `${dayShort(draft.date)} ${dateLabel(draft.date)} · ${hhmm(draft.slotStart)}` : 'Select time';

  return (
    <motion.aside
      layout
      aria-label="Live quote"
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-[980px] overflow-hidden rounded-[4px] border border-line-strong bg-ink/90 shadow-[0_20px_60px_rgba(0,0,0,.6)] backdrop-blur-md sm:bottom-5"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 24, delay: 0.4 }}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="breakdown"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="border-b border-line"
          >
            <ul className="grid gap-1.5 px-4 py-4 text-[13px] sm:px-5">
              {q.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-4">
                  <span className="text-silver">
                    {l.label}
                    {l.minutes > 0 && <span className="mono ml-2 text-[11px] text-muted">+{l.minutes}m</span>}
                  </span>
                  <span className="mono text-bone">{naira(l.amount)}</span>
                </li>
              ))}
              <li className="mt-2 flex justify-between border-t border-line pt-2">
                <span className="label">Deposit today (30%) · balance on completion</span>
                <span className="mono text-acid">
                  {naira(q.deposit)} · {naira(q.balance)}
                </span>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 px-3 py-2.5 sm:gap-5 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-4 text-left sm:gap-6"
          aria-label={open ? 'Hide quote breakdown' : 'Show quote breakdown'}
        >
          <div>
            <div className="label !text-[9px]">Total</div>
            <div className="display-wide text-[18px] text-bone sm:text-[20px]">
              <Ticker value={q.subtotal} format={naira} />
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="label !text-[9px]">On site</div>
            <div className="mono text-[13px] text-bone">
              <Ticker value={q.onSiteMinutes} format={(n) => duration(Math.round(n))} />
            </div>
          </div>
          <div className="hidden min-w-0 md:block">
            <div className="label !text-[9px]">Location</div>
            <div className="truncate text-[13px] text-bone">{zone?.name ?? '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="label !text-[9px]">Slot</div>
            <div className={`mono truncate text-[12px] sm:text-[13px] ${draft.slotStart !== null ? 'text-acid' : 'text-muted'}`}>{slotText}</div>
          </div>
          <span className={`mono ml-auto hidden text-muted transition-transform sm:inline ${open ? 'rotate-180' : ''}`} aria-hidden>
            ▴
          </span>
        </button>
        {onContinue && (
          <button type="button" className="btn btn-primary btn-sm shrink-0 sm:min-h-[42px]" onClick={onContinue} disabled={continueDisabled}>
            {continueLabel} <span className="arrow">→</span>
          </button>
        )}
      </div>
    </motion.aside>
  );
}
