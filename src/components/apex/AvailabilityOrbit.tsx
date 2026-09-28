import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { OPS } from '../../data/apex';
import { unitById } from '../../lib/catalog';
import { summarizeDays, type SlotOption } from '../../lib/scheduling';
import { addDays, dateLabel, dayShort, duration, hhmm, isWeekend, lagosClock, relativeDayLabel } from '../../lib/time';
import { useAvailability, useBoard, useNow } from '../../store/boardStore';
import { useBooking, useSpec } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';

const W = 1000;
const H = 720;
const CX = 500;
const CY = 420;
const R_OPEN = 318;
const R_CLOSED = 382;
const ARC = 118; // degrees either side of 12 o'clock

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

const polar = (angleDeg: number, r: number) => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
};

/**
 * Signature availability picker. The chosen day sits at the centre; feasible start
 * times orbit it along an arc, closed windows recede outward and explain why, and
 * the best-fit window (least stranded crew time, no rush-hour penalty) is surfaced.
 */
export function AvailabilityOrbit() {
  const spec = useSpec();
  const date = useBooking((s) => s.draft.date);
  const setDate = useBooking((s) => s.setDate);
  const slotStart = useBooking((s) => s.draft.slotStart);
  const setSlot = useBooking((s) => s.setSlot);
  const preferred = useBooking((s) => s.draft.preferredStart);
  const { slots, status } = useAvailability(date, spec);
  const bookings = useBoard((s) => s.bookings);
  const error = useBoard((s) => s.error);
  const refresh = useBoard((s) => s.refresh);
  const now = useNow(60_000);
  const narrow = useNarrow();
  const [view, setView] = useState<'orbit' | 'list'>('orbit');
  const [half, setHalf] = useState<'am' | 'pm'>(() => (preferred !== null && preferred >= 13 * 60 ? 'pm' : 'am'));
  const [inspect, setInspect] = useState<SlotOption | null>(null);

  const today = lagosClock(now).date;
  const days = useMemo(() => Array.from({ length: OPS.horizonDays }, (_, i) => addDays(today, i)), [today]);
  const summaries = useMemo(
    () => (spec.zoneId && status === 'ready' ? summarizeDays(days, { spec, bookings, now }) : []),
    [days, spec, bookings, now, status],
  );

  const visible = narrow ? slots.filter((s) => (half === 'am' ? s.start < 13 * 60 : s.start >= 13 * 60)) : slots;
  const open = visible.filter((s) => s.status === 'available');
  const selected = slots.find((s) => s.start === slotStart) ?? null;
  const recommended = slots.find((s) => s.recommended) ?? null;
  const focus = inspect ?? selected ?? recommended;
  const preferredSlot = preferred !== null ? open.reduce<SlotOption | null>((b, s) => (!b || Math.abs(s.start - preferred) < Math.abs(b.start - preferred) ? s : b), null) : null;

  const nodeRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const pick = (s: SlotOption) => {
    if (s.status !== 'available') {
      setInspect(s);
      return;
    }
    setInspect(null);
    setSlot(s.start, s.unitId);
    telemetry(`Window ${hhmm(s.start)} held · ${unitById(s.unitId!).name} · overlap check passed`, { tone: 'ok', channel: 'SLOT' });
  };

  const onKey = (e: KeyboardEvent, s: SlotOption) => {
    const idx = open.findIndex((o) => o.start === s.start);
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta || idx < 0) return;
    e.preventDefault();
    const next = open[(idx + delta + open.length) % open.length];
    nodeRefs.current[next.start]?.focus();
    pick(next);
  };

  // Tab stop: the selected node, else the recommendation, else the first open node.
  const tabStop = (selected?.status === 'available' ? selected : null) ?? recommended ?? open[0] ?? null;

  if (!spec.zoneId) {
    return <Empty title="Set a location first" body="Travel time decides which windows are feasible — pick a zone on the radar." />;
  }

  return (
    <section aria-labelledby="orbit-title" className="relative min-w-0">
      <h2 id="orbit-title" className="sr-only">
        Choose a time
      </h2>

      {/* day ribbon */}
      <div className="relative -mx-1 overflow-x-auto px-1 pb-2 scrollbar-none">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Day">
          {days.map((d) => {
            const sum = summaries.find((x) => x.date === d);
            const on = d === date;
            const ratio = sum ? sum.available / sum.total : 0;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setDate(d);
                  setInspect(null);
                }}
                className={`relative flex w-[62px] flex-col items-start gap-1 border px-2.5 py-2 text-left transition-colors ${
                  on ? 'border-acid bg-acid-soft' : 'border-line hover:border-line-strong'
                }`}
              >
                <span className={`label !text-[9px] ${on ? '!text-acid' : ''}`}>{d === today ? 'Today' : dayShort(d)}</span>
                <span className="mono text-[13px] text-bone">{d.slice(8)}</span>
                <span className="h-[3px] w-full bg-line" aria-hidden>
                  <motion.span className={`block h-full ${ratio === 0 ? 'bg-tail' : ratio < 0.35 ? 'bg-amber' : 'bg-silver'}`} initial={false} animate={{ width: `${Math.max(ratio, 0.04) * 100}%` }} />
                </span>
                <span className="mono text-[9.5px] text-muted">{sum ? `${sum.available} open` : '···'}</span>
                {isWeekend(d) && <span className="absolute right-1.5 top-1.5 h-1 w-1 bg-amber" title="High demand" aria-label="High demand day" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="label">
          {relativeDayLabel(date, today)} · {open.length ? `${slots.filter((s) => s.status === 'available').length} feasible windows` : 'no feasible windows'}
          {isWeekend(date) && <span className="!text-amber"> · weekend demand</span>}
        </p>
        <div className="flex gap-1">
          {narrow && view === 'orbit' && (
            <div className="mr-2 flex border border-line" role="group" aria-label="Half of day">
              {(['am', 'pm'] as const).map((h) => (
                <button key={h} type="button" aria-pressed={half === h} onClick={() => setHalf(h)} className={`label px-2.5 py-1.5 ${half === h ? 'bg-bone !text-ink' : ''}`}>
                  {h === 'am' ? 'Morning' : 'Afternoon'}
                </button>
              ))}
            </div>
          )}
          <div className="flex border border-line" role="group" aria-label="View">
            {(['orbit', 'list'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`label px-2.5 py-1.5 ${view === v ? 'bg-bone !text-ink' : ''}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {status === 'error' || (error && status !== 'ready') ? (
        <Empty title="Schedule unreachable" body="We couldn't read live unit availability. Nothing has been booked." action={{ label: 'Retry', run: () => void refresh() }} tone="error" />
      ) : status !== 'ready' ? (
        <div className="relative mt-4 grid aspect-[1000/720] place-items-center" aria-busy="true">
          <div className="absolute inset-[12%] animate-pulse rounded-full border border-dashed border-line-strong" />
          <span className="label flex items-center gap-2">
            <span className="dot-live" /> Scanning 3 units
          </span>
        </div>
      ) : view === 'list' ? (
        <SlotList slots={slots} selected={slotStart} onPick={pick} />
      ) : (
        <div className="relative mt-2">
          <AnimatePresence mode="wait">
            <motion.div key={`${date}-${half}-${narrow}`} className="relative aspect-[1000/720] w-full" initial={{ opacity: 0, rotate: -6 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 6 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
              <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
                <path d={arcPath(R_OPEN)} fill="none" stroke="rgba(236,232,222,.14)" strokeWidth="1" />
                <path d={arcPath(R_CLOSED)} fill="none" stroke="rgba(236,232,222,.06)" strokeWidth="1" strokeDasharray="2 6" />
                <circle cx={CX} cy={CY} r="150" fill="none" stroke="rgba(236,232,222,.08)" />
                {focus && focus.status === 'available' && (
                  <motion.line
                    key={focus.start}
                    x1={CX}
                    y1={CY}
                    {...(() => {
                      const p = polar(angleFor(focus.start, visible), R_OPEN);
                      return { x2: p.x, y2: p.y };
                    })()}
                    stroke="var(--color-acid)"
                    strokeWidth="1.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </svg>

              {/* centre: the day */}
              <div className="pointer-events-none absolute text-center" style={{ left: `${(CX / W) * 100}%`, top: `${(CY / H) * 100}%`, transform: 'translate(-50%,-50%)', width: '30%' }}>
                <div className="label !text-[9px] sm:!text-[10px]">{relativeDayLabel(date, today).split(' ')[0]}</div>
                <div className="display text-[clamp(40px,8vw,84px)] text-bone">{dayShort(date)}</div>
                <div className="mono text-[11px] text-muted sm:text-[13px]">{dateLabel(date)}</div>
              </div>

              {visible.map((s, i) => {
                const a = angleFor(s.start, visible);
                const isOpen = s.status === 'available';
                const p = polar(a, isOpen ? R_OPEN : R_CLOSED);
                const lab = polar(a, R_OPEN - 46);
                const on = s.start === slotStart;
                const best = s.recommended;
                return (
                  <div key={s.start}>
                  {isOpen && (
                    <motion.span
                      className={`mono pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10.5px] sm:text-[12px] ${on ? 'text-acid' : 'text-bone'}`}
                      style={{ left: `${(lab.x / W) * 100}%`, top: `${(lab.y / H) * 100}%` }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 + i * 0.025 }}
                    >
                      {hhmm(s.start)}
                    </motion.span>
                  )}
                  <motion.div
                    className="absolute"
                    style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: isOpen ? 1 : 0.4, scale: 1 }}
                    transition={{ delay: 0.05 + i * 0.025, type: 'spring', stiffness: 260, damping: 20 }}
                  >
                    <button
                      ref={(el) => {
                        nodeRefs.current[s.start] = el;
                      }}
                      type="button"
                      tabIndex={tabStop && s.start === tabStop.start ? 0 : -1}
                      aria-disabled={!isOpen}
                      aria-pressed={on}
                      aria-label={`${hhmm(s.start)} — ${isOpen ? `available, ${unitById(s.unitId!).name}${best ? ', best fit' : ''}` : `unavailable: ${s.reason}`}`}
                      onClick={() => pick(s)}
                      onMouseEnter={() => !isOpen && setInspect(s)}
                      onMouseLeave={() => !isOpen && setInspect(null)}
                      onKeyDown={(e) => onKey(e, s)}
                      className="group absolute -translate-x-1/2 -translate-y-1/2 p-2 sm:p-2.5"
                    >
                      {isOpen ? (
                        <span
                          className={`relative block rounded-full border transition-all ${
                            on ? 'h-5 w-5 border-acid bg-acid shadow-[0_0_20px_rgba(201,255,61,.8)]' : 'h-4 w-4 border-bone bg-ink group-hover:scale-125 group-hover:border-acid'
                          }`}
                        >
                          {best && !on && <span className="absolute inset-[-6px] rounded-full border border-acid/70" />}
                        </span>
                      ) : (
                        <span className="block h-2 w-[2px] bg-silver/70" style={{ transform: `rotate(${a}deg)` }} />
                      )}
                    </button>
                    {best && (
                      <span className="label pointer-events-none absolute left-1/2 top-[-34px] hidden -translate-x-1/2 whitespace-nowrap !text-[9px] !text-acid sm:block">
                        Best fit
                      </span>
                    )}
                  </motion.div>
                  </div>
                );
              })}

              {open.length === 0 && (
                <div className="absolute inset-x-0 bottom-[6%] text-center">
                  <p className="label !text-tail">All units committed{narrow ? ` this ${half === 'am' ? 'morning' : 'afternoon'}` : ''}</p>
                  <NextOpenDay summaries={summaries} date={date} onGo={setDate} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* readout for the focused window */}
          <FocusReadout slot={focus} selected={selected} preferredSlot={preferredSlot} preferred={preferred} />
        </div>
      )}
    </section>
  );
}

function angleFor(start: number, visible: SlotOption[]) {
  const first = visible[0]?.start ?? OPS.firstStart;
  const last = visible[visible.length - 1]?.start ?? OPS.lastStart;
  const t = last === first ? 0.5 : (start - first) / (last - first);
  return -ARC + t * ARC * 2;
}

function arcPath(r: number) {
  const a = polar(-ARC, r);
  const b = polar(ARC, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y}`;
}

function FocusReadout({ slot, selected, preferredSlot, preferred }: { slot: SlotOption | null; selected: SlotOption | null; preferredSlot: SlotOption | null; preferred: number | null }) {
  if (!slot) return null;
  const isOpen = slot.status === 'available';
  return (
    <div className="mt-2 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-6" aria-live="polite">
      <div>
        <div className={`label !text-[9.5px] ${isOpen ? (slot.recommended ? '!text-acid' : '') : '!text-tail'}`}>
          {!isOpen ? 'Closed window' : slot === selected ? 'Your window' : slot.recommended ? 'Best fit — minimal travel conflict' : 'Window'}
        </div>
        <div className="display-wide mt-1 text-[28px] text-bone">{hhmm(slot.start)}</div>
      </div>
      <div className="text-[13.5px] leading-relaxed text-silver">
        {isOpen ? (
          <>
            Crew arrives {hhmm(slot.start)}, keys back by <span className="mono text-bone">{hhmm(slot.plan.endMinutes)}</span> ({duration(slot.plan.endMinutes - slot.start)} on site).{' '}
            {slot.reason}
          </>
        ) : (
          <span className="text-tail/90">{slot.reason}</span>
        )}
        {preferred !== null && preferredSlot && (
          <div className="label mt-2 !text-silver">
            You asked for ~{hhmm(preferred)} · closest open: <span className="!text-acid">{hhmm(preferredSlot.start)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NextOpenDay({ summaries, date, onGo }: { summaries: { date: string; available: number }[]; date: string; onGo: (d: string) => void }) {
  const next = summaries.find((s) => s.date > date && s.available > 0);
  if (!next) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => onGo(next.date)}>
      Next open: {dayShort(next.date)} {dateLabel(next.date)} · {next.available} windows →
    </button>
  );
}

function SlotList({ slots, selected, onPick }: { slots: SlotOption[]; selected: number | null; onPick: (s: SlotOption) => void }) {
  return (
    <ul className="mt-4 grid border-t border-line" aria-label="All windows">
      {slots.map((s) => {
        const isOpen = s.status === 'available';
        const on = s.start === selected;
        return (
          <li key={s.start}>
            <button
              type="button"
              aria-disabled={!isOpen}
              aria-pressed={on}
              onClick={() => onPick(s)}
              className={`grid w-full grid-cols-[64px_1fr_auto] items-center gap-4 border-b border-line px-2 py-3 text-left ${on ? 'bg-acid-soft' : isOpen ? 'hover:bg-panel' : 'opacity-60'}`}
            >
              <span className={`mono text-[14px] ${on ? 'text-acid' : isOpen ? 'text-bone' : 'text-dim line-through'}`}>{hhmm(s.start)}</span>
              <span className={`text-[12.5px] ${isOpen ? 'text-silver' : 'text-muted'}`}>{s.reason}</span>
              <span className={`label !text-[9px] ${isOpen ? (s.recommended ? '!text-acid' : '!text-bone') : ''}`}>{isOpen ? (s.recommended ? 'Best fit' : 'Open') : s.status}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ title, body, action, tone }: { title: string; body: string; action?: { label: string; run: () => void }; tone?: 'error' }) {
  return (
    <div className={`mt-4 grid place-items-center gap-3 border border-dashed px-6 py-16 text-center ${tone === 'error' ? 'border-tail/50' : 'border-line'}`}>
      <div className={`label ${tone === 'error' ? '!text-tail' : '!text-bone'}`}>{title}</div>
      <p className="max-w-[40ch] text-[14px] text-muted">{body}</p>
      {action && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
