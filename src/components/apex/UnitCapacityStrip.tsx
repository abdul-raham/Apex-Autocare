import { motion } from 'framer-motion';
import { OPS, UNITS } from '../../data/apex';
import { zoneById } from '../../lib/catalog';
import { blocksCapacity, stageAt, unitUtilization, type JobStage } from '../../lib/scheduling';
import { hhmm, lagosClock, lagosMs } from '../../lib/time';
import type { Booking } from '../../lib/types';

export interface UnitCapacityStripProps {
  bookings: Booking[];
  date: string;
  /** Moment being viewed (live clock or the scrubbed playhead), epoch ms. */
  at: number;
}

const STAGE_TEXT: Record<JobStage, string> = {
  scheduled: 'Queued',
  travel: 'En route',
  arrived: 'Setting up',
  detailing: 'Detailing',
  inspection: 'Inspecting',
  returning: 'Returning',
  complete: 'Complete',
};

/** Compact live capacity: what each unit is doing now, when it's next free, and how full its day is. */
export function UnitCapacityStrip({ bookings, date, at }: UnitCapacityStripProps) {
  const day = bookings.filter((b) => blocksCapacity(b) && lagosClock(Date.parse(b.startAt)).date === date);

  return (
    <div className="grid gap-px border border-line bg-line md:grid-cols-3" role="list" aria-label="Mobile unit capacity">
      {UNITS.map((u) => {
        const jobs = day.filter((b) => b.unitId === u.id).sort((a, z) => a.startAt.localeCompare(z.startAt));
        const live = jobs.find((b) => {
          const s = stageAt(b, at).stage;
          return s !== 'scheduled' && s !== 'complete';
        });
        const stage = live ? stageAt(live, at) : null;
        const upcoming = jobs.find((b) => Date.parse(b.occupiedStart) > at);
        const busyUntil = live ? Date.parse(live.occupiedEnd) : at;
        const freeFrom = Math.max(busyUntil, lagosMs(date, OPS.dispatchStart));
        const freeTo = upcoming ? Date.parse(upcoming.occupiedStart) : lagosMs(date, OPS.dispatchEnd);
        const util = unitUtilization(bookings, u.id, date);
        const status = stage ? STAGE_TEXT[stage.stage] : upcoming ? 'At base' : jobs.length ? 'Day complete' : 'Standby';

        return (
          <div key={u.id} role="listitem" className="bg-ink p-4">
            <div className="flex items-center justify-between">
              <span className="label !text-bone">{u.name}</span>
              <span className={`label flex items-center gap-1.5 ${stage ? '!text-acid' : ''}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${stage ? 'bg-acid' : 'bg-dim'}`} /> {status}
              </span>
            </div>
            <div className="mt-3 min-h-[40px] text-[14px]">
              {live ? (
                <>
                  <span className="text-bone">{live.vehicleLabel}</span>
                  <span className="text-muted"> · {zoneById(live.zoneId)?.name.split(' / ')[0]}</span>
                  <div className="mt-2 h-[3px] bg-line">
                    <motion.div className="h-full bg-acid" initial={false} animate={{ width: `${(stage?.progress ?? 0) * 100}%` }} />
                  </div>
                </>
              ) : (
                <span className="text-muted">No job on the car</span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <dt className="label !text-[9px]">Next free</dt>
                <dd className="mono text-bone">{freeTo - freeFrom > 90 * 60_000 ? hhmm(lagosClock(freeFrom).minutes) : upcoming ? hhmm(lagosClock(Date.parse(upcoming.occupiedEnd)).minutes) : '—'}</dd>
              </div>
              <div>
                <dt className="label !text-[9px]">Next job</dt>
                <dd className="mono text-bone">{upcoming ? hhmm(lagosClock(Date.parse(upcoming.startAt)).minutes) : '—'}</dd>
              </div>
              <div>
                <dt className="label !text-[9px]">Day load</dt>
                <dd className={`mono ${util > 0.85 ? 'text-amber' : 'text-bone'}`}>{Math.round(util * 100)}%</dd>
              </div>
            </dl>
            <div className="mt-2 h-[3px] bg-line" aria-hidden>
              <div className={`h-full ${util > 0.85 ? 'bg-amber' : 'bg-silver/70'}`} style={{ width: `${util * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
