import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { OPS } from '../../data/apex';
import { specOf } from '../../lib/bookings';
import { unitById } from '../../lib/catalog';
import type { BookingRecord } from '../../lib/repository';
import { dayAvailability, type SlotOption } from '../../lib/scheduling';
import { addDays, dateLabel, dayShort, fromIso, hhmm, lagosClock } from '../../lib/time';
import { SlotConflictError, type Booking } from '../../lib/types';
import { useBoard, useBoardData, useNow } from '../../store/boardStore';
import { telemetry } from '../../store/telemetryStore';

export interface RescheduleSliderProps {
  booking: Booking;
  onRescheduled?: (record: BookingRecord) => void;
}

const SPAN = OPS.dispatchEnd - OPS.dispatchStart;
const pct = (m: number) => ((m - OPS.dispatchStart) / SPAN) * 100;
const SNAP_RADIUS = 25; // minutes

/**
 * Drag the appointment along the day. Valid windows pull the block in magnetically;
 * closed windows resist, turn red and say why. The same feasibility engine that
 * built the booking decides every position, excluding the booking itself.
 */
export function RescheduleSlider({ booking, onRescheduled }: RescheduleSliderProps) {
  const { bookings, status } = useBoardData();
  const reschedule = useBoard((s) => s.rescheduleBooking);
  const now = useNow(60_000);
  const today = lagosClock(now).date;
  const original = fromIso(booking.startAt);
  const [date, setDate] = useState(original.date >= today ? original.date : addDays(today, 1));
  const [candidate, setCandidate] = useState<SlotOption | null>(null);
  const [probe, setProbe] = useState<SlotOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const spec = useMemo(() => specOf(booking), [booking]);
  const slots = useMemo(
    () => (status === 'ready' ? dayAvailability({ date, spec, bookings, now, excludeBookingId: booking.id, preferredUnitId: booking.unitId }) : []),
    [status, date, spec, bookings, now, booking.id, booking.unitId],
  );
  const valid = slots.filter((s) => s.status === 'available');
  const isCurrent = (s: SlotOption) => date === original.date && s.start === original.minutes;

  // block geometry
  const current = candidate ?? (date === original.date ? slots.find(isCurrent) ?? null : null);
  const occupied = (slots[0]?.plan.freeMinutes ?? 0) - (slots[0]?.plan.departMinutes ?? 0);
  const leadIn = slots[0] ? slots[0].plan.startMinutes - slots[0].plan.departMinutes : booking.travelMinutes;
  const startMv = useMotionValue(current?.start ?? original.minutes);
  const left = useTransform(startMv, (s) => `${pct(s - leadIn)}%`);
  const startLabel = useTransform(startMv, (s) => hhmm(Math.round(s / 5) * 5));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setCandidate(null);
    setProbe(null);
    setError('');
  }, [date]);

  useEffect(() => {
    if (dragging.current) return;
    const target = current?.start ?? valid[0]?.start ?? original.minutes;
    const c = animate(startMv, target, { type: 'spring', stiffness: 320, damping: 28 });
    return () => c.stop();
  }, [current?.start, valid, original.minutes, startMv]);

  const minuteAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return OPS.dispatchStart + ((clientX - r.left) / r.width) * SPAN + leadIn;
  };
  const nearestValid = (m: number) => valid.reduce<SlotOption | null>((b, s) => (!b || Math.abs(s.start - m) < Math.abs(b.start - m) ? s : b), null);
  const slotAt = (m: number) => slots.reduce<SlotOption | null>((b, s) => (!b || Math.abs(s.start - m) < Math.abs(b.start - m) ? s : b), null);

  const onDown = (e: PointerEvent) => {
    if (!valid.length) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const raw = minuteAt(e.clientX);
    const near = nearestValid(raw);
    if (near && Math.abs(near.start - raw) <= SNAP_RADIUS) {
      // magnetic: pull toward the valid start
      startMv.set(raw + (near.start - raw) * 0.75);
      setInvalid(false);
      setProbe(near);
    } else {
      // resistance: lag behind the pointer, show why the window is closed
      const anchor = probe && probe.status === 'available' ? probe.start : startMv.get();
      startMv.set(anchor + (raw - anchor) * 0.3);
      setInvalid(true);
      setProbe(slotAt(raw));
    }
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const near = nearestValid(startMv.get());
    const target = !invalid && near ? near : probe?.status === 'available' ? probe : current ?? near;
    setInvalid(false);
    if (target) choose(target);
  };

  const choose = (s: SlotOption) => {
    setError('');
    if (isCurrent(s)) {
      setCandidate(null);
      animate(startMv, s.start, { type: 'spring', stiffness: 320, damping: 28 });
      return;
    }
    setCandidate(s);
    setProbe(s);
    animate(startMv, s.start, { type: 'spring', stiffness: 420, damping: 26 });
    telemetry(`Candidate ${dayShort(date)} ${hhmm(s.start)} · ${unitById(s.unitId!).name} · feasible`, { tone: 'ok', channel: 'MOVE' });
  };

  const step = (dir: 1 | -1) => {
    const ref = candidate?.start ?? startMv.get();
    const list = dir > 0 ? valid.filter((s) => s.start > ref + 1) : [...valid].reverse().filter((s) => s.start < ref - 1);
    if (list[0]) choose(list[0]);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else return;
    e.preventDefault();
  };

  const confirm = async () => {
    if (!candidate) return;
    setSaving(true);
    setError('');
    try {
      const record = await reschedule(booking.code, { date, startMinutes: candidate.start, unitId: candidate.unitId! });
      telemetry(`Moved to ${dayShort(date)} ${hhmm(candidate.start)} · reminders re-scheduled`, { tone: 'ok', channel: 'MOVE' });
      setCandidate(null);
      onRescheduled?.(record);
    } catch (e) {
      setError(e instanceof SlotConflictError ? `${e.message} Pick another window.` : (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const late = Date.parse(booking.startAt) - now < OPS.freeChangeHours * 3_600_000;
  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));
  const hours = Array.from({ length: 13 }, (_, i) => OPS.dispatchStart + 60 * i).filter((m) => m <= OPS.dispatchEnd);

  return (
    <section aria-labelledby="reschedule-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 id="reschedule-title" className="display text-[clamp(36px,4.6vw,64px)] text-bone">
          Move it<span className="text-acid">.</span>
        </h2>
        <p className="label max-w-[46ch] text-right">Drag the job · valid windows snap · closed ones push back and say why</p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2 scrollbar-none">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Day">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === date}
              onClick={() => setDate(d)}
              className={`w-[60px] border px-2 py-2 text-left ${d === date ? 'border-acid bg-acid-soft' : 'border-line hover:border-line-strong'}`}
            >
              <span className={`label block !text-[9px] ${d === date ? '!text-acid' : ''}`}>{d === today ? 'Today' : dayShort(d)}</span>
              <span className="mono text-[13px] text-bone">{d.slice(8)}</span>
              {d === original.date && <span className="mt-1 block h-[2px] w-full bg-bone" title="Current booking day" />}
            </button>
          ))}
        </div>
      </div>

      {/* the track */}
      <div className="mt-6 select-none">
        <div className="relative h-5">
          {hours.map((m) => (
            <span key={m} className="mono absolute -translate-x-1/2 text-[10px] text-muted" style={{ left: `${pct(m)}%` }}>
              {hhmm(m).slice(0, 2)}
            </span>
          ))}
        </div>
        <div ref={track} className="relative h-24 touch-none border-y border-line bg-graphite sm:h-28" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {/* per-slot zones */}
          {slots.map((s) => (
            <div
              key={s.start}
              className={`absolute inset-y-0 ${s.status === 'available' ? '' : 'hatch-red opacity-60'}`}
              style={{ left: `${pct(s.start - OPS.slotStep / 2)}%`, width: `${(OPS.slotStep / SPAN) * 100}%` }}
              title={s.status === 'available' ? `${hhmm(s.start)} available` : `${hhmm(s.start)}: ${s.reason}`}
            >
              {s.status === 'available' && <span className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-acid/70" />}
            </div>
          ))}
          {date === original.date && (
            <div className="absolute inset-y-0 border-x border-dashed border-bone/40" style={{ left: `${pct(original.minutes - leadIn)}%`, width: `${(occupied / SPAN) * 100}%` }}>
              <span className="label absolute -bottom-5 left-0 !text-[9px]">Current</span>
            </div>
          )}

          {status === 'ready' && valid.length > 0 && (
            <motion.div
              role="slider"
              tabIndex={0}
              aria-label="Appointment start time"
              aria-valuemin={OPS.firstStart}
              aria-valuemax={OPS.lastStart}
              aria-valuenow={candidate?.start ?? original.minutes}
              aria-valuetext={`${dayShort(date)} ${hhmm(candidate?.start ?? current?.start ?? original.minutes)}`}
              onKeyDown={onKey}
              onPointerDown={onDown}
              className={`absolute inset-y-2 z-10 cursor-grab touch-none border active:cursor-grabbing ${
                invalid ? 'border-tail bg-tail/25' : candidate ? 'border-acid bg-acid/25 shadow-[0_0_24px_rgba(201,255,61,.35)]' : 'border-bone bg-bone/15'
              }`}
              style={{ left, width: `${(occupied / SPAN) * 100}%` }}
              animate={invalid ? { x: [0, -2, 2, 0] } : { x: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex h-full flex-col justify-between p-1.5 sm:p-2">
                <span className="label truncate !text-[9px] !text-bone">{booking.vehicleLabel}</span>
                <motion.span className="mono text-[12px] text-bone">{startLabel}</motion.span>
              </div>
              <span className="absolute inset-y-0 bg-bone/20" style={{ left: `${(leadIn / occupied) * 100}%`, width: 1 }} aria-hidden />
            </motion.div>
          )}
          {status !== 'ready' && <div className="skeleton absolute inset-0" />}
          {status === 'ready' && valid.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="label !text-tail">No feasible window this day for this job</span>
            </div>
          )}
        </div>
      </div>

      {/* explanation + accessible controls */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div aria-live="polite" className="min-h-[60px] text-[14px]">
          <AnimatePresence mode="wait">
            {probe && (
              <motion.p key={`${probe.start}-${probe.status}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={probe.status === 'available' ? 'text-silver' : 'text-tail'}>
                <span className="mono mr-2 text-bone">{hhmm(probe.start)}</span>
                {probe.reason}
              </motion.p>
            )}
          </AnimatePresence>
          {late && <p className="label mt-2 !text-amber">Inside {OPS.freeChangeHours}h of your appointment · move allowed, flagged as a late change</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => step(-1)} aria-label="Previous valid window">
            ◂ Earlier
          </button>
          <label className="sr-only" htmlFor="reschedule-select">
            Choose a window
          </label>
          <select
            id="reschedule-select"
            className="field !min-h-[36px] !w-auto !py-1.5 text-[13px]"
            value={candidate?.start ?? ''}
            onChange={(e) => {
              const s = valid.find((v) => v.start === Number(e.target.value));
              if (s) choose(s);
            }}
          >
            <option value="">Pick a window…</option>
            {valid.map((s) => (
              <option key={s.start} value={s.start}>
                {hhmm(s.start)} · {unitById(s.unitId!).name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => step(1)} aria-label="Next valid window">
            Later ▸
          </button>
        </div>
      </div>

      <AnimatePresence>
        {candidate && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-6 flex flex-col gap-4 border border-acid/60 bg-acid-soft p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="mono text-[14px] text-bone">
              {dayShort(original.date)} {dateLabel(original.date)} {hhmm(original.minutes)} <span className="text-acid">→</span> {dayShort(date)} {dateLabel(date)} {hhmm(candidate.start)}
              <span className="ml-2 text-muted">· {unitById(candidate.unitId!).name}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCandidate(null)}>
                Keep original
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void confirm()} disabled={saving}>
                {saving ? 'Re-checking…' : 'Confirm move →'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-tail">
          {error}
        </p>
      )}
    </section>
  );
}
