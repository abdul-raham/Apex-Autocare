import { AnimatePresence, motion } from 'framer-motion';
import { hhmm, lagosClock } from '../../lib/time';
import { useTelemetry, type TelemetryTone } from '../../store/telemetryStore';

const TONE: Record<TelemetryTone, string> = {
  info: 'border-silver/60 text-bone',
  ok: 'border-acid text-bone',
  warn: 'border-amber text-bone',
  error: 'border-tail text-bone',
};

const GLYPH: Record<TelemetryTone, string> = { info: '●', ok: '✓', warn: '▲', error: '✕' };

/**
 * System notifications as telemetry readouts: channel, Lagos timestamp, message.
 * Push from anywhere with `telemetry('SLOT GRID RECALCULATED', { tone: 'ok' })`.
 */
export function ToastTelemetry() {
  const messages = useTelemetry((s) => s.messages);
  const dismiss = useTelemetry((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed right-3 top-[76px] z-[120] flex w-[min(400px,calc(100vw-24px))] flex-col gap-1.5 sm:right-4 sm:top-[84px]"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {messages.map((m) => {
          const c = lagosClock(m.at);
          const secs = String(new Date(m.at).getUTCSeconds()).padStart(2, '0');
          return (
            <motion.button
              key={m.id}
              type="button"
              layout
              onClick={() => dismiss(m.id)}
              className={`pointer-events-auto flex items-start gap-3 border-l-2 bg-ink/90 px-3 py-2 text-left backdrop-blur-md ${TONE[m.tone]}`}
              initial={{ opacity: 0, x: 24, clipPath: 'inset(0 0 0 100%)' }}
              animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)' }}
              exit={{ opacity: 0, x: 12, transition: { duration: 0.2 } }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              aria-label={`${m.text}. Dismiss`}
            >
              <span className="mono mt-px text-[11px] text-muted">
                <span className={m.tone === 'ok' ? 'text-acid' : m.tone === 'error' ? 'text-tail' : m.tone === 'warn' ? 'text-amber' : ''}>{GLYPH[m.tone]}</span>{' '}
                {m.channel} {hhmm(c.minutes)}:{secs}
              </span>
              <span className="mono text-[11px] uppercase leading-snug tracking-[0.08em]">{m.text}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
