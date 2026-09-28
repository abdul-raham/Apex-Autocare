import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { effectiveStatus, eventTime } from '../../lib/automation';
import type { BookingEvent } from '../../lib/types';

export interface AutomationPulseProps {
  events: BookingEvent[];
  /** stream: newest first (owner feed). sequence: in order, revealed one by one (confirmation). */
  variant?: 'stream' | 'sequence';
  max?: number;
  title?: string;
  showCode?: boolean;
  now?: number;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
}

const GLYPH = { completed: '✓', scheduled: '◷', cancelled: '—' } as const;

/**
 * Visualises booking_events: each line is work the owner no longer does by hand.
 * Never invents local notifications — it only renders persisted events.
 */
export function AutomationPulse({
  events,
  variant = 'stream',
  max = 12,
  title = 'Handled automatically',
  showCode = false,
  now = Date.now(),
  loading = false,
  empty,
  className = '',
}: AutomationPulseProps) {
  const when = (e: BookingEvent) => Date.parse(e.status === 'scheduled' ? e.scheduledFor! : e.completedAt ?? e.createdAt);
  let shown: BookingEvent[];
  let queuedFrom = -1;
  if (variant === 'stream') {
    // what already happened, newest first — then the next few things queued to happen
    const past = events.filter((e) => when(e) <= now).sort((a, z) => when(z) - when(a));
    const next = events.filter((e) => when(e) > now && e.status !== 'cancelled').sort((a, z) => when(a) - when(z));
    const nextCount = Math.min(next.length, Math.max(3, max - past.length));
    const pastShown = past.slice(0, max - nextCount);
    queuedFrom = pastShown.length;
    shown = [...pastShown, ...next.slice(0, nextCount)];
  } else {
    shown = [...events].sort((a, z) => when(a) - when(z)).slice(0, max);
  }
  const done = events.filter((e) => effectiveStatus(e, now) === 'completed').length;

  return (
    <section className={className} aria-label={title}>
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="label flex items-center gap-2 !text-bone">
          <span className="dot-live" /> {title}
        </h3>
        {!loading && events.length > 0 && (
          <span className="label num">
            {done} done · {events.length - done} queued
          </span>
        )}
      </header>

      {loading ? (
        <div className="grid gap-1.5" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-7 rounded-[2px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="label border border-dashed border-line py-6 text-center">{empty ?? 'No automated actions yet'}</div>
      ) : (
        <ol className="relative grid">
          <AnimatePresence initial={variant === 'sequence'}>
            {shown.map((e, i) => {
              const status = effectiveStatus(e, now);
              return (
                <motion.li
                  key={e.id}
                  data-queued-start={i === queuedFrom && queuedFrom > 0 ? true : undefined}
                  layout="position"
                  className={`relative grid grid-cols-[18px_52px_1fr] items-start gap-2 border-b border-line py-2 text-[13px] leading-snug ${
                    i === queuedFrom && queuedFrom > 0 ? 'mt-5 border-t border-t-line-strong before:absolute before:-top-5 before:left-0 before:font-mono before:text-[10px] before:uppercase before:tracking-[0.16em] before:text-muted before:content-["Queued_next"]' : ''
                  } ${
                    status === 'cancelled' ? 'text-dim line-through decoration-dim/60' : status === 'scheduled' ? 'text-silver' : 'text-bone'
                  }`}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: variant === 'sequence' ? 0.25 + i * 0.16 : 0, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* pulse sweep when the line lands */}
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-acid/25 to-transparent"
                    initial={{ scaleX: 0, opacity: 1 }}
                    animate={{ scaleX: 1, opacity: 0 }}
                    transition={{ delay: variant === 'sequence' ? 0.25 + i * 0.16 : 0, duration: 0.9, ease: 'easeOut' }}
                  />
                  <span className={`mono text-[12px] ${status === 'completed' ? 'text-acid' : 'text-muted'}`} aria-label={status}>
                    {GLYPH[status]}
                  </span>
                  <span className="mono text-[11px] text-muted">{eventTime(e, now)}</span>
                  <span>
                    {e.label}
                    {showCode && <span className="mono ml-2 text-[10.5px] tracking-wider text-dim">{e.bookingCode}</span>}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
