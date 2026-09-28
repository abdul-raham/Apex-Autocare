import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { OPS } from '../../data/apex';
import { serviceById, unitById, vehicleById, zoneById } from '../../lib/catalog';
import { blocksCapacity, planJob, type JobPlan, type SegmentKind, type SlotOption } from '../../lib/scheduling';
import { addDays, duration, hhmm, lagosClock } from '../../lib/time';
import type { Booking, JobSpec } from '../../lib/types';

export interface BookingTimelineEngineProps {
  /** A fully planned job; if omitted, `spec` is planned at `start` (or midday) for illustration. */
  plan?: JobPlan | null;
  spec?: JobSpec;
  slot?: SlotOption | null;
  /** When provided with a slot, the unit's other jobs are drawn on a day axis. */
  bookings?: Booking[];
  /** Cycle through illustrative scenarios (home + process explainer). */
  demo?: boolean;
  compact?: boolean;
  className?: string;
}

const SEG: Record<SegmentKind, { label: string; cls: string; text: string }> = {
  travel: { label: 'Travel', cls: 'hatch bg-panel-2', text: 'text-silver' },
  setup: { label: 'Setup', cls: 'bg-panel-2 border-l border-line-strong', text: 'text-silver' },
  detail: { label: 'Detail', cls: 'bg-bone', text: 'text-ink' },
  inspection: { label: 'Inspect', cls: 'bg-acid-soft border-x border-acid/60', text: 'text-acid' },
  return: { label: 'Return', cls: 'hatch bg-panel-2', text: 'text-silver' },
};

const DEMO: { spec: JobSpec; startOffsetDay: number; start: number; caption: string }[] = [
  { spec: { classId: 'sedan', serviceId: 'signature-reset', addonIds: [], zoneId: 'ikate' }, startOffsetDay: 2, start: 12 * 60, caption: 'Sedan · Signature Reset · Ikate, off-peak' },
  { spec: { classId: 'suv', serviceId: 'signature-reset', addonIds: ['engine-bay'], zoneId: 'victoria-island' }, startOffsetDay: 2, start: 8 * 60, caption: 'SUV + engine bay · Victoria Island · weekday rush' },
  { spec: { classId: 'luxury', serviceId: 'ceramic-shield', addonIds: [], zoneId: 'ajah' }, startOffsetDay: 2, start: 11 * 60, caption: 'Luxury · Ceramic Shield · Ajah' },
];

function nextWeekday(from: string, offset: number) {
  // keep demo scenarios on a weekday so peak pricing is visible
  let d = addDays(from, offset);
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
}

export function BookingTimelineEngine({ plan, spec, slot, bookings, demo = false, compact = false, className = '' }: BookingTimelineEngineProps) {
  const [demoIndex, setDemoIndex] = useState(0);

  useEffect(() => {
    if (!demo) return;
    const id = setInterval(() => setDemoIndex((i) => (i + 1) % DEMO.length), 3400);
    return () => clearInterval(id);
  }, [demo]);

  const today = lagosClock().date;
  const scenario = DEMO[demoIndex];
  const resolved: JobPlan | null = useMemo(() => {
    if (demo) return planJob(scenario.spec, nextWeekday(today, scenario.startOffsetDay), scenario.start);
    if (plan) return plan;
    if (slot) return slot.plan;
    if (spec && spec.zoneId) return planJob(spec, addDays(today, 1), 12 * 60);
    return null;
  }, [demo, scenario, today, plan, slot, spec]);

  const activeSpec = demo ? scenario.spec : spec;
  const timed = !!slot || demo || !!plan;

  if (!resolved) {
    return (
      <div className={`border border-dashed border-line p-6 ${className}`}>
        <div className="label">Operation window</div>
        <p className="mt-2 text-sm text-muted">Pick a vehicle, service and location — the crew's full window appears here.</p>
      </div>
    );
  }

  const total = resolved.freeMinutes - resolved.departMinutes;
  const unitId = slot?.unitId;

  return (
    <section className={className} aria-label="Operation window">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="label">
          Operation window · <span className="mono !text-bone">{duration(total)}</span> crew time
          {unitId && <span className="!text-acid"> · {unitById(unitId).name}</span>}
        </div>
        {activeSpec && (
          <AnimatePresence mode="wait">
            <motion.div
              key={demo ? demoIndex : activeSpec.classId + activeSpec.serviceId + activeSpec.zoneId}
              className="label !text-silver"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {demo
                ? scenario.caption
                : `${vehicleById(activeSpec.classId).label} · ${serviceById(activeSpec.serviceId).name} · ${zoneById(activeSpec.zoneId)?.name ?? '—'}`}
            </motion.div>
          </AnimatePresence>
        )}
      </header>

      {/* segment bar */}
      <div className="flex h-16 w-full gap-[3px] sm:h-20" role="list">
        {resolved.segments.map((s) => (
          <motion.div
            key={s.kind}
            role="listitem"
            aria-label={`${SEG[s.kind].label} ${s.minutes} minutes`}
            layout
            className={`relative flex min-w-[34px] flex-col justify-between overflow-hidden p-2 ${SEG[s.kind].cls}`}
            animate={{ flexGrow: s.minutes }}
            style={{ flexBasis: 0 }}
            transition={{ type: 'spring', stiffness: 140, damping: 22 }}
          >
            <span className={`label !text-[9px] ${SEG[s.kind].text} ${s.minutes < 22 ? 'sm:hidden' : ''}`}>{SEG[s.kind].label}</span>
            <span className={`mono text-[12px] leading-none sm:text-[13px] ${SEG[s.kind].text}`}>
              {s.minutes}
              <span className="text-[10px] opacity-70">m</span>
            </span>
            {s.kind === 'travel' && resolved.peak && (
              <span className="absolute right-1 top-1 bg-amber px-1 text-[8.5px] font-semibold uppercase tracking-wider text-ink">Peak</span>
            )}
          </motion.div>
        ))}
      </div>

      {/* clock ticks */}
      {timed && (
        <div className="relative mt-1.5 flex w-full gap-[3px]">
          {resolved.segments.map((s, i) => (
            <motion.div key={s.kind} layout animate={{ flexGrow: s.minutes }} style={{ flexBasis: 0 }} className="min-w-[34px]" transition={{ type: 'spring', stiffness: 140, damping: 22 }}>
              <span className="mono text-[10.5px] text-muted">{i === 0 || i === 1 || i === 3 || i === 4 ? hhmm(s.from) : ''}</span>
            </motion.div>
          ))}
          <span className="mono absolute right-0 top-0 text-[10.5px] text-muted">{hhmm(resolved.returnMinutes)}</span>
        </div>
      )}

      {!compact && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="label !text-[9.5px]">Arrive</dt>
            <dd className="mono text-bone">{timed ? hhmm(resolved.startMinutes) : '—'}</dd>
          </div>
          <div>
            <dt className="label !text-[9.5px]">Keys back</dt>
            <dd className="mono text-bone">{timed ? hhmm(resolved.endMinutes) : duration(resolved.endMinutes - resolved.startMinutes)}</dd>
          </div>
          <div>
            <dt className="label !text-[9.5px]">Travel each way</dt>
            <dd className="mono text-bone">
              {resolved.travelMinutes}m{resolved.peak && <span className="text-amber"> (+{resolved.travelMinutes - resolved.baseTravelMinutes} rush)</span>}
            </dd>
          </div>
          <div>
            <dt className="label !text-[9.5px]">Unit free again</dt>
            <dd className="mono text-bone">{timed ? hhmm(resolved.freeMinutes) : `+${OPS.turnaroundMinutes}m restock`}</dd>
          </div>
        </dl>
      )}

      {slot && bookings && !compact && <DayContext slot={slot} bookings={bookings} />}
    </section>
  );
}

/** The candidate window placed on its unit's actual day, between real jobs. */
function DayContext({ slot, bookings }: { slot: SlotOption; bookings: Booking[] }) {
  const span = OPS.dispatchEnd - OPS.dispatchStart;
  const pct = (m: number) => `${((m - OPS.dispatchStart) / span) * 100}%`;
  const w = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const unitId = slot.unitId;
  const date = slot.plan.date;
  const jobs = unitId
    ? bookings.filter((b) => b.unitId === unitId && blocksCapacity(b) && lagosClock(Date.parse(b.startAt)).date === date)
    : [];

  return (
    <div className="mt-6 border-t border-line pt-4">
      <div className="label mb-2 flex justify-between">
        <span>{unitId ? `${unitById(unitId).name} · day plan` : 'Why this window is closed'}</span>
        <span className="mono">
          {hhmm(OPS.dispatchStart)}–{hhmm(OPS.dispatchEnd)}
        </span>
      </div>
      {unitId ? (
        <div className="relative h-9 bg-graphite">
          {jobs.map((b) => {
            const from = lagosClock(Date.parse(b.occupiedStart)).minutes;
            const to = lagosClock(Date.parse(b.occupiedEnd)).minutes;
            return (
              <div
                key={b.id}
                className="absolute inset-y-1 overflow-hidden border border-line-strong bg-panel-2 px-1.5"
                style={{ left: pct(from), width: w(from, to) }}
                title={`${b.vehicleLabel} · ${zoneById(b.zoneId)?.name}`}
              >
                <span className="mono truncate text-[10px] leading-7 text-muted">{b.vehicleLabel}</span>
              </div>
            );
          })}
          <motion.div
            layout
            className="absolute inset-y-0 border border-acid bg-acid/20 shadow-[0_0_20px_rgba(201,255,61,.25)]"
            style={{ left: pct(slot.plan.departMinutes), width: w(slot.plan.departMinutes, slot.plan.freeMinutes) }}
          >
            <span className="mono absolute -top-5 left-0 whitespace-nowrap text-[10px] text-acid">YOUR JOB</span>
          </motion.div>
        </div>
      ) : null}
      <p className={`mt-3 text-[13px] ${slot.status === 'available' ? 'text-silver' : 'text-tail'}`}>{slot.reason}</p>
    </div>
  );
}
