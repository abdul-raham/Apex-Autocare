import { SEED_DAY_OFFSETS, SEED_WEEK, UNITS } from '../data/apex';
import { creationEvents } from './automation';
import { buildBooking, hashCode } from './bookings';
import { addDays, lagosClock, lagosMs, parseHhmm, toIso, weekday } from './time';
import type { Booking, BookingEvent } from './types';

/**
 * Canonical demo state relative to "today" in Lagos. Deterministic: the same day
 * always yields the same bookings, codes and events. supabase/schema.sql
 * (apex_reset_demo) walks the same SEED_WEEK table server-side.
 */
export function generateSeed(today: string = lagosClock().date): { bookings: Booking[]; events: BookingEvent[] } {
  const bookings: Booking[] = [];
  const events: BookingEvent[] = [];

  for (let offset = SEED_DAY_OFFSETS.from; offset <= SEED_DAY_OFFSETS.to; offset++) {
    const date = addDays(today, offset);
    for (const job of SEED_WEEK[weekday(date)] ?? []) {
      const key = `seed-${date}-${job.unit}-${job.start}`;
      // Booked ~3 days ahead, but never "in the future" relative to today's seed.
      const createdAt = new Date(
        Math.min(Date.parse(toIso(addDays(date, -3), 10 * 60 + job.unit * 17 + parseHhmm(job.start) / 30)), lagosMs(today, 6 * 60 + job.unit * 7)),
      ).toISOString();
      const booking = buildBooking(
        {
          spec: { classId: job.vehicle, serviceId: job.service, addonIds: job.addons ?? [], zoneId: job.zone },
          date,
          startMinutes: parseHhmm(job.start),
          unitId: UNITS[job.unit].id,
          customer: { name: job.customer, phone: '', address: '', vehicleLabel: job.label },
        },
        { id: key, code: hashCode(key), source: 'seed', createdAt, paymentStatus: job.pendingDeposit ? 'pending' : 'deposit_paid' },
      );
      bookings.push(booking);
      events.push(...creationEvents(booking, key));
    }
  }
  return { bookings, events };
}
