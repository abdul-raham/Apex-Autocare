import { OPS, UNITS, type MobileUnit } from '../data/apex';
import { unitById, zoneById } from './catalog';
import { detailMinutesFor } from './quote';
import { hhmm, lagosClock, lagosMs, weekday } from './time';
import type { Booking, JobSpec } from './types';

/**
 * Deterministic feasibility engine.
 *
 * A job occupies a mobile unit from the moment it leaves base until it is back and
 * restocked:  travel → setup → detail → inspection → travel back → turnaround.
 * A start time is offered only when at least one active unit can absorb that whole
 * window without overlapping anything it already carries, inside dispatch hours.
 * Booking, rescheduling and the owner view all run through this one module.
 */

export type SegmentKind = 'travel' | 'setup' | 'detail' | 'inspection' | 'return';

export interface Segment {
  kind: SegmentKind;
  from: number;
  to: number;
  minutes: number;
}

export interface JobPlan {
  date: string;
  startMinutes: number;
  travelMinutes: number;
  baseTravelMinutes: number;
  peak: boolean;
  setupMinutes: number;
  detailMinutes: number;
  inspectionMinutes: number;
  departMinutes: number;
  endMinutes: number;
  returnMinutes: number;
  /** Unit is free again (after turnaround). */
  freeMinutes: number;
  segments: Segment[];
  startMs: number;
  endMs: number;
  occupiedStartMs: number;
  occupiedEndMs: number;
}

export function isPeak(date: string, startMinutes: number): boolean {
  const day = weekday(date);
  if (day === 0 || day === 6) return false;
  return OPS.peakWindows.some(([from, to]) => startMinutes >= from && startMinutes < to);
}

export function travelFor(zoneId: string, date: string, startMinutes: number) {
  const zone = zoneById(zoneId);
  const base = zone?.travelMinutes ?? 0;
  const peak = isPeak(date, startMinutes);
  const minutes = peak
    ? Math.ceil((base * (zone?.peakFactor ?? 1)) / OPS.travelRounding) * OPS.travelRounding
    : base;
  return { minutes, base, peak };
}

export function planJob(spec: JobSpec, date: string, startMinutes: number): JobPlan {
  const travel = travelFor(spec.zoneId, date, startMinutes);
  const detail = detailMinutesFor(spec);
  const setup = OPS.setupMinutes;
  const inspection = OPS.inspectionMinutes;

  const depart = startMinutes - travel.minutes;
  const end = startMinutes + setup + detail + inspection;
  const back = end + travel.minutes;
  const free = back + OPS.turnaroundMinutes;

  const segments: Segment[] = [
    { kind: 'travel', from: depart, to: startMinutes, minutes: travel.minutes },
    { kind: 'setup', from: startMinutes, to: startMinutes + setup, minutes: setup },
    { kind: 'detail', from: startMinutes + setup, to: startMinutes + setup + detail, minutes: detail },
    { kind: 'inspection', from: end - inspection, to: end, minutes: inspection },
    { kind: 'return', from: end, to: back, minutes: travel.minutes },
  ];

  return {
    date,
    startMinutes,
    travelMinutes: travel.minutes,
    baseTravelMinutes: travel.base,
    peak: travel.peak,
    setupMinutes: setup,
    detailMinutes: detail,
    inspectionMinutes: inspection,
    departMinutes: depart,
    endMinutes: end,
    returnMinutes: back,
    freeMinutes: free,
    segments,
    startMs: lagosMs(date, startMinutes),
    endMs: lagosMs(date, end),
    occupiedStartMs: lagosMs(date, depart),
    occupiedEndMs: lagosMs(date, free),
  };
}

/** Segments for a persisted booking, in Lagos minutes of its own day. */
export function bookingSegments(b: Booking): Segment[] {
  const start = lagosClock(Date.parse(b.startAt)).minutes;
  const setupEnd = start + b.setupMinutes;
  const detailEnd = setupEnd + b.detailMinutes;
  const end = detailEnd + b.inspectionMinutes;
  return [
    { kind: 'travel', from: start - b.travelMinutes, to: start, minutes: b.travelMinutes },
    { kind: 'setup', from: start, to: setupEnd, minutes: b.setupMinutes },
    { kind: 'detail', from: setupEnd, to: detailEnd, minutes: b.detailMinutes },
    { kind: 'inspection', from: detailEnd, to: end, minutes: b.inspectionMinutes },
    { kind: 'return', from: end, to: end + b.travelMinutes, minutes: b.travelMinutes },
  ];
}

export const blocksCapacity = (b: Booking) => b.status !== 'cancelled';

// ─── Availability ───────────────────────────────────────────────────────────

export type SlotStatus = 'available' | 'booked' | 'curfew' | 'lead' | 'past' | 'zone';

export interface Blocker {
  unitId: string;
  code: string;
  label: string;
  from: number;
  to: number;
}

export interface SlotOption {
  start: number;
  status: SlotStatus;
  unitId: string | null;
  freeUnitIds: string[];
  reason: string;
  /** Lower is better: idle fragments the job would strand, plus a peak-traffic penalty. */
  score: number;
  recommended: boolean;
  plan: JobPlan;
  blockers: Blocker[];
}

export interface AvailabilityQuery {
  date: string;
  spec: JobSpec;
  bookings: Booking[];
  now?: number;
  excludeBookingId?: string;
  preferredUnitId?: string;
  units?: MobileUnit[];
}

/** A gap shorter than this can't hold even the smallest job, so it's wasted crew time. */
const STRANDED_GAP = 150;

function unitWindows(bookings: Booking[], unitId: string, excludeId?: string) {
  return bookings
    .filter((b) => b.unitId === unitId && b.id !== excludeId && blocksCapacity(b))
    .map((b) => ({ b, from: Date.parse(b.occupiedStart), to: Date.parse(b.occupiedEnd) }))
    .sort((a, z) => a.from - z.from);
}

function minutesOf(ms: number) {
  return lagosClock(ms).minutes;
}

export function evaluateSlot(q: AvailabilityQuery & { start: number }): SlotOption {
  const { date, spec, bookings, start, excludeBookingId, preferredUnitId } = q;
  const units = q.units ?? UNITS;
  const now = q.now ?? Date.now();
  const plan = planJob(spec, date, start);
  const base = { start, plan, unitId: null, freeUnitIds: [] as string[], score: Infinity, recommended: false, blockers: [] as Blocker[] };

  const zone = zoneById(spec.zoneId);
  if (!zone || !zone.serviced) {
    return { ...base, status: 'zone', reason: zone?.note ?? 'Pick a serviced location first.' };
  }
  if (plan.startMs < now) {
    return { ...base, status: 'past', reason: 'This window has already passed.' };
  }
  if (plan.startMs < now + OPS.minLeadMinutes * 60_000) {
    return { ...base, status: 'lead', reason: `Units need ${OPS.minLeadMinutes / 60}h notice to load and route.` };
  }
  if (plan.departMinutes < OPS.dispatchStart) {
    return { ...base, status: 'curfew', reason: `Unit would have to leave base before ${hhmm(OPS.dispatchStart)}.` };
  }
  if (plan.freeMinutes > OPS.dispatchEnd) {
    return {
      ...base,
      status: 'curfew',
      reason: `A ${Math.round((plan.freeMinutes - plan.departMinutes) / 6) / 10}h job here would return after the ${hhmm(OPS.dispatchEnd)} dispatch cut-off.`,
    };
  }

  const free: { unitId: string; score: number }[] = [];
  const blockers: Blocker[] = [];

  for (const unit of units) {
    const windows = unitWindows(bookings, unit.id, excludeBookingId);
    const clash = windows.find((w) => w.from < plan.occupiedEndMs && w.to > plan.occupiedStartMs);
    if (clash) {
      blockers.push({
        unitId: unit.id,
        code: clash.b.code,
        label: `${unit.name.replace('Mobile ', '')} is on ${clash.b.vehicleLabel} in ${zoneById(clash.b.zoneId)?.name ?? clash.b.zoneId} until ${hhmm(minutesOf(clash.to))}`,
        from: minutesOf(clash.from),
        to: minutesOf(clash.to),
      });
      continue;
    }
    const prev = [...windows].reverse().find((w) => w.to <= plan.occupiedStartMs);
    const next = windows.find((w) => w.from >= plan.occupiedEndMs);
    const gapBefore = plan.departMinutes - (prev ? minutesOf(prev.to) : OPS.dispatchStart);
    const gapAfter = (next ? minutesOf(next.from) : OPS.dispatchEnd) - plan.freeMinutes;
    const stranded = (gapBefore > 0 && gapBefore < STRANDED_GAP ? gapBefore : 0) + (gapAfter > 0 && gapAfter < STRANDED_GAP ? gapAfter : 0);
    const score = stranded + (plan.peak ? 25 : 0) + (unit.id === preferredUnitId ? -5 : 0) + start / 1000;
    free.push({ unitId: unit.id, score });
  }

  if (!free.length) {
    return {
      ...base,
      blockers,
      status: 'booked',
      reason: `All ${units.length} units committed — ${blockers.map((b) => b.label).join('; ')}.`,
    };
  }

  free.sort((a, z) => a.score - z.score);
  const best = free[0];
  const unit = unitById(best.unitId);
  return {
    ...base,
    blockers,
    status: 'available',
    unitId: best.unitId,
    freeUnitIds: free.map((f) => f.unitId),
    score: best.score,
    reason: `${unit.name} free ${hhmm(plan.departMinutes)}–${hhmm(plan.freeMinutes)}${plan.peak ? ' · peak traffic priced in' : ''}.`,
  };
}

export function slotStarts(): number[] {
  const out: number[] = [];
  for (let m = OPS.firstStart; m <= OPS.lastStart; m += OPS.slotStep) out.push(m);
  return out;
}

export function dayAvailability(q: AvailabilityQuery): SlotOption[] {
  const slots = slotStarts().map((start) => evaluateSlot({ ...q, start }));
  const available = slots.filter((s) => s.status === 'available');
  if (available.length) {
    const best = available.reduce((a, z) => (z.score < a.score ? z : a));
    best.recommended = true;
  }
  return slots;
}

export interface DaySummary {
  date: string;
  available: number;
  total: number;
  firstAvailable: number | null;
}

export function summarizeDays(dates: string[], q: Omit<AvailabilityQuery, 'date'>): DaySummary[] {
  return dates.map((date) => {
    const slots = dayAvailability({ ...q, date });
    const open = slots.filter((s) => s.status === 'available');
    return { date, available: open.length, total: slots.length, firstAvailable: open[0]?.start ?? null };
  });
}

/** Share of a unit's dispatch window already committed on a date (0–1). */
export function unitUtilization(bookings: Booking[], unitId: string, date: string): number {
  const dayStart = lagosMs(date, OPS.dispatchStart);
  const dayEnd = lagosMs(date, OPS.dispatchEnd);
  const used = bookings
    .filter((b) => b.unitId === unitId && blocksCapacity(b))
    .reduce((sum, b) => {
      const from = Math.max(dayStart, Date.parse(b.occupiedStart));
      const to = Math.min(dayEnd, Date.parse(b.occupiedEnd));
      return sum + Math.max(0, to - from);
    }, 0);
  return used / (dayEnd - dayStart);
}

// ─── Live job stage (owner view) ────────────────────────────────────────────

export type JobStage = 'scheduled' | 'travel' | 'arrived' | 'detailing' | 'inspection' | 'returning' | 'complete';

export const STAGE_ORDER: JobStage[] = ['travel', 'arrived', 'detailing', 'inspection', 'complete'];

export function stageAt(b: Booking, atMs: number): { stage: JobStage; progress: number } {
  const start = Date.parse(b.startAt);
  const end = Date.parse(b.endAt);
  const depart = start - b.travelMinutes * 60_000;
  const setupEnd = start + b.setupMinutes * 60_000;
  const detailEnd = setupEnd + b.detailMinutes * 60_000;
  const back = end + b.travelMinutes * 60_000;
  const p = (from: number, to: number) => Math.min(1, Math.max(0, (atMs - from) / Math.max(1, to - from)));

  if (atMs < depart) return { stage: 'scheduled', progress: 0 };
  if (atMs < start) return { stage: 'travel', progress: p(depart, start) };
  if (atMs < setupEnd) return { stage: 'arrived', progress: p(start, setupEnd) };
  if (atMs < detailEnd) return { stage: 'detailing', progress: p(setupEnd, detailEnd) };
  if (atMs < end) return { stage: 'inspection', progress: p(detailEnd, end) };
  if (atMs < back) return { stage: 'returning', progress: p(end, back) };
  return { stage: 'complete', progress: 1 };
}
