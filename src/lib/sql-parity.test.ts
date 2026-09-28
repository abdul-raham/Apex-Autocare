/**
 * Runs supabase/schema.sql + seed.sql inside PGlite (real Postgres in WASM) and
 * proves the database computes exactly what the TypeScript engine computes, and
 * that the RPCs enforce the same rules.
 */
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateSeed } from './seed';
import { computeQuote } from './quote';
import { dayAvailability } from './scheduling';
import { addDays, lagosClock, toIso } from './time';
import type { Booking, BookingEvent } from './types';

const read = (p: string) => readFileSync(new URL(`../../supabase/${p}`, import.meta.url), 'utf8');

let db: PGlite;

async function rpc<T>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<{ r: T }>(sql, params);
  return res.rows[0]?.r as T;
}

const key = (b: Pick<Booking, 'unitId' | 'startAt'>) => `${b.unitId}@${new Date(b.startAt).toISOString()}`;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist, pgcrypto } });
  await db.exec(`create role anon; create role authenticated;`);
  await db.exec(read('schema.sql'));
  await db.exec(read('seed.sql'));
}, 60_000);

describe('supabase schema ↔ TypeScript engine', () => {
  it('seeds the same bookings with identical money, durations and occupied windows', async () => {
    const board = await rpc<{ bookings: Booking[]; events: BookingEvent[] }>('select apex_board() as r');
    const ts = generateSeed(lagosClock().date).bookings;
    const sqlByKey = new Map(board.bookings.map((b) => [key(b), b]));

    expect(board.bookings.length).toBe(ts.length);
    for (const t of ts) {
      const s = sqlByKey.get(key(t));
      expect(s, `missing ${key(t)}`).toBeTruthy();
      expect(s!.subtotal, t.vehicleLabel).toBe(t.subtotal);
      expect(s!.depositAmount).toBe(t.depositAmount);
      expect(s!.detailMinutes).toBe(t.detailMinutes);
      expect(s!.travelMinutes, `${t.vehicleLabel} travel`).toBe(t.travelMinutes);
      expect(new Date(s!.occupiedStart).toISOString()).toBe(t.occupiedStart);
      expect(new Date(s!.occupiedEnd).toISOString()).toBe(t.occupiedEnd);
      expect(s!.status).toBe(t.status);
      expect(s!.addonIds).toEqual([...t.addonIds].sort());
    }
    expect(board.events.length).toBeGreaterThan(ts.length * 5);
  });

  it('creates a booking on a feasible slot and records the automation trail', async () => {
    const board = await rpc<{ bookings: Booking[] }>('select apex_board() as r');
    const date = addDays(lagosClock().date, 2);
    const spec = { classId: 'suv' as const, serviceId: 'signature-reset', addonIds: ['engine-bay'], zoneId: 'ikoyi' };
    const slot = dayAvailability({ date, spec, bookings: board.bookings }).find((s) => s.status === 'available')!;

    const rec = await rpc<{ booking: Booking; events: BookingEvent[] }>('select apex_create_booking($1::jsonb) as r', [
      JSON.stringify({
        ...spec,
        startAt: toIso(date, slot.start),
        unitId: slot.unitId,
        customerName: 'Judge Test',
        customerPhone: '+2348030000000',
        address: '12 Bourdillon Rd',
        vehicleLabel: 'Lexus RX 350',
      }),
    ]);
    expect(rec.booking.code).toMatch(/^APX-[A-Z2-9]{5}$/);
    expect(rec.booking.subtotal).toBe(computeQuote(spec).subtotal);
    expect(new Date(rec.booking.occupiedEnd).getTime()).toBe(slot.plan.occupiedEndMs);
    expect(rec.booking.customerPhone).toBe('+2348030000000');
    const types = rec.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['deposit_verified', 'calendar_blocked', 'confirmation_sent', 'review_request']));

    // The board never exposes phone numbers or addresses.
    const after = await rpc<{ bookings: Booking[] }>('select apex_board() as r');
    const pub = after.bookings.find((b) => b.code === rec.booking.code)!;
    expect(pub.customerPhone ?? null).toBeNull();
    expect(pub.address ?? null).toBeNull();
    expect(pub.customerName).toBe('Judge T.');
  });

  it('refuses to double-book once every unit is committed', async () => {
    const date = addDays(lagosClock().date, 3);
    const book = () =>
      rpc('select apex_create_booking($1::jsonb) as r', [
        JSON.stringify({
          classId: 'sedan', serviceId: 'signature-reset', addonIds: [], zoneId: 'ikate',
          startAt: toIso(date, 8 * 60), unitId: 'unit-01',
          customerName: 'Load Test', customerPhone: '1', address: 'x', vehicleLabel: 'Camry',
        }),
      ]);
    const board = await rpc<{ bookings: Booking[] }>('select apex_board() as r');
    const free = dayAvailability({ date, spec: { classId: 'sedan', serviceId: 'signature-reset', addonIds: [], zoneId: 'ikate' }, bookings: board.bookings })
      .find((s) => s.start === 8 * 60)!.freeUnitIds.length;
    for (let i = 0; i < free; i++) await book();
    await expect(book()).rejects.toThrow(/SLOT_CONFLICT/);
  });

  it('reschedules through the same feasibility rules and supersedes old reminders', async () => {
    const board = await rpc<{ bookings: Booking[] }>('select apex_board() as r');
    const target = board.bookings.find((b) => b.source === 'web' && b.vehicleLabel === 'Lexus RX 350')!;
    const date = addDays(lagosClock().date, 4);
    const spec = { classId: target.classId, serviceId: target.serviceId, addonIds: target.addonIds, zoneId: target.zoneId };
    const slot = dayAvailability({ date, spec, bookings: board.bookings, excludeBookingId: target.id }).find((s) => s.status === 'available')!;

    const rec = await rpc<{ booking: Booking; events: BookingEvent[] }>('select apex_reschedule_booking($1, $2, $3) as r', [
      target.code, toIso(date, slot.start), slot.unitId,
    ]);
    expect(rec.booking.rescheduleCount).toBe(1);
    expect(new Date(rec.booking.startAt).getTime()).toBe(slot.plan.startMs);
    expect(rec.events.some((e) => e.type === 'rescheduled')).toBe(true);
    expect(rec.events.filter((e) => e.type === 'reminder_24h' && e.status === 'cancelled')).toHaveLength(1);
  });

  it('reset removes only demo rows and restores the canonical seed', async () => {
    await db.exec(`
      insert into customers (full_name, is_demo) values ('Real Customer', false);
      insert into vehicles (customer_id, vehicle_class, make, model) select id, 'sedan', 'Toyota', 'Camry' from customers where full_name = 'Real Customer';
      insert into bookings (booking_code, customer_id, vehicle_id, mobile_unit_id, service_id, location_zone, start_at, end_at,
        travel_minutes, setup_minutes, detail_minutes, inspection_minutes, occupied_start, occupied_end, subtotal, deposit_amount, is_demo)
      select 'APX-REAL1', c.id, v.id, 'unit-01', s.id, 'ikate', now() + interval '40 days', now() + interval '40 days 2 hours',
        10, 20, 90, 15, now() + interval '40 days' - interval '10 minutes', now() + interval '40 days 3 hours', 45000, 13500, false
      from customers c join vehicles v on v.customer_id = c.id, services s where c.full_name = 'Real Customer' and s.slug = 'signature-reset';
    `);
    await db.query('select apex_reset_demo()');
    const board = await rpc<{ bookings: Booking[] }>('select apex_board() as r');
    expect(board.bookings.length).toBe(generateSeed(lagosClock().date).bookings.length);
    expect(board.bookings.every((b) => b.source === 'seed')).toBe(true);
    const real = await db.query(`select 1 from bookings where booking_code = 'APX-REAL1'`);
    expect(real.rows).toHaveLength(1);
  });
});
