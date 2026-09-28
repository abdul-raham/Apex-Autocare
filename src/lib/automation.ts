import { unitById } from './catalog';
import { naira } from './catalog';
import { duration, hhmm, isoTime, lagosClock, relativeDayLabel, dayShort } from './time';
import type { Booking, BookingEvent, EventType } from './types';

/**
 * The work an owner used to do by hand, recorded as events. Every booking,
 * reschedule and cancellation produces the same trail whether it was persisted
 * locally or in Supabase (supabase/schema.sql mirrors these rules).
 */

let counter = 0;
export const newId = (prefix = 'evt') =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function event(
  b: Booking,
  type: EventType,
  label: string,
  at: string,
  opts: { scheduledFor?: string; metadata?: Record<string, unknown>; id?: string } = {},
): BookingEvent {
  const scheduled = !!opts.scheduledFor;
  return {
    id: opts.id ?? newId(),
    bookingId: b.id,
    bookingCode: b.code,
    type,
    label,
    status: scheduled ? 'scheduled' : 'completed',
    scheduledFor: opts.scheduledFor ?? null,
    completedAt: scheduled ? null : at,
    createdAt: at,
    metadata: opts.metadata,
  };
}

const minus = (iso: string, minutes: number) => new Date(Date.parse(iso) - minutes * 60_000).toISOString();
const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

function windowLabel(b: Booking) {
  return `${hhmm(lagosClock(Date.parse(b.occupiedStart)).minutes)}–${hhmm(lagosClock(Date.parse(b.occupiedEnd)).minutes)}`;
}

/** Follow-through events scheduled against the appointment time; past ones are skipped. */
function followThrough(b: Booking, at: string, idPrefix?: string): BookingEvent[] {
  const unit = unitById(b.unitId);
  const list: [EventType, string, string][] = [
    ['reminder_24h', '24h reminder · arrival window + prep checklist', minus(b.startAt, 24 * 60)],
    ['crew_brief', `Route + job brief pushed to ${unit.name}`, minus(b.occupiedStart, 30)],
    ['reminder_2h', '"Crew en route" notice with live ETA', minus(b.startAt, 120)],
    ['review_request', 'Aftercare tips + review request', plus(b.endAt, 180)],
  ];
  return list
    .filter(([, , when]) => Date.parse(when) > Date.parse(at))
    .map(([type, label, when]) => event(b, type, label, at, { scheduledFor: when, id: idPrefix ? `${idPrefix}-${type}` : undefined }));
}

export function creationEvents(b: Booking, idPrefix?: string): BookingEvent[] {
  const at = b.createdAt;
  const unit = unitById(b.unitId);
  const id = (t: string) => (idPrefix ? `${idPrefix}-${t}` : undefined);
  const out: BookingEvent[] = [
    event(b, 'quote_calculated', `Quote calculated · ${naira(b.subtotal)} · ${duration(b.detailMinutes)} on the car`, at, { id: id('quote') }),
    event(b, 'slot_validated', 'Slot validated against 3 units · zero overlap', at, { id: id('slot') }),
    event(b, 'unit_assigned', `${unit.name} assigned · crew ${unit.crew}`, at, { id: id('unit') }),
  ];
  if (b.paymentStatus === 'deposit_paid') {
    out.push(event(b, 'deposit_verified', `Deposit verified · ${naira(b.depositAmount)} (demo payment)`, at, { id: id('deposit') }));
  } else {
    out.push(event(b, 'deposit_pending', `Deposit of ${naira(b.depositAmount)} awaiting payment · hold active`, at, { id: id('deposit') }));
  }
  out.push(
    event(b, 'calendar_blocked', `Calendar blocked · ${unit.name} ${windowLabel(b)}`, at, { id: id('calendar') }),
    event(b, 'confirmation_sent', 'Confirmation sent · WhatsApp + email (simulated)', at, { id: id('confirm') }),
    ...followThrough(b, at, idPrefix),
  );
  return out;
}

/** Cancel still-pending follow-ups for a booking (used by reschedule and cancel). */
export function supersede(events: BookingEvent[], bookingId: string, at: string): BookingEvent[] {
  return events.map((e) =>
    e.bookingId === bookingId && e.status === 'scheduled' && e.scheduledFor && Date.parse(e.scheduledFor) > Date.parse(at)
      ? { ...e, status: 'cancelled' as const, completedAt: at }
      : e,
  );
}

export function rescheduleEvents(before: Booking, after: Booking, at: string): BookingEvent[] {
  const from = `${dayShort(lagosClock(Date.parse(before.startAt)).date)} ${isoTime(before.startAt)}`;
  const to = `${dayShort(lagosClock(Date.parse(after.startAt)).date)} ${isoTime(after.startAt)}`;
  const out: BookingEvent[] = [
    event(after, 'rescheduled', `Rescheduled ${from} → ${to} · feasibility re-run`, at, { metadata: { from: before.startAt, to: after.startAt } }),
  ];
  if (before.unitId !== after.unitId) {
    out.push(event(after, 'unit_assigned', `Reassigned to ${unitById(after.unitId).name}`, at));
  }
  out.push(
    event(after, 'calendar_blocked', `Calendar moved · ${unitById(after.unitId).name} ${windowLabel(after)}`, at),
    event(after, 'confirmation_sent', 'Updated confirmation sent (simulated)', at),
    ...followThrough(after, at),
  );
  return out;
}

export function cancellationEvents(b: Booking, at: string, depositRetained: boolean): BookingEvent[] {
  return [
    event(
      b,
      'cancelled',
      depositRetained
        ? 'Cancelled inside 12h · deposit retained, slot released to pool'
        : 'Cancelled · deposit refund queued, slot released to pool',
      at,
    ),
  ];
}

export function customEvent(b: Booking, type: EventType, label: string, at: string, metadata?: Record<string, unknown>) {
  return event(b, type, label, at, { metadata });
}

/** Scheduled events whose time has passed count as executed (delivery is simulated). */
export function effectiveStatus(e: BookingEvent, now = Date.now()): 'completed' | 'scheduled' | 'cancelled' {
  if (e.status === 'scheduled' && e.scheduledFor && Date.parse(e.scheduledFor) <= now) return 'completed';
  return e.status;
}

export function eventTime(e: BookingEvent, now = Date.now()): string {
  const iso = e.status === 'scheduled' ? e.scheduledFor! : e.completedAt ?? e.createdAt;
  const c = lagosClock(Date.parse(iso));
  const today = lagosClock(now).date;
  return c.date === today ? hhmm(c.minutes) : `${relativeDayLabel(c.date, today).slice(0, 3).toUpperCase()} ${hhmm(c.minutes)}`;
}
