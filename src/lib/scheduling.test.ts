import { describe, expect, it } from 'vitest';
import { OPS, UNITS } from '../data/apex';
import { buildBooking } from './bookings';
import { parseInquiry } from './inquiry';
import { computeQuote } from './quote';
import { dayAvailability, evaluateSlot, planJob, stageAt, summarizeDays } from './scheduling';
import { generateSeed } from './seed';
import { addDays, isWeekend, lagosClock, lagosMs } from './time';
import type { JobSpec } from './types';

// 2026-10-05 is a Monday. Clock pinned well before the horizon so nothing is "past".
const TODAY = '2026-10-05';
const NOW = lagosMs(addDays(TODAY, -2), 9 * 60);
const SPEC: JobSpec = { classId: 'suv', serviceId: 'signature-reset', addonIds: [], zoneId: 'lekki-phase-1' };
const seed = generateSeed(TODAY);

describe('quote', () => {
  it('scales service price by vehicle and adds add-ons and zone surcharge', () => {
    const q = computeQuote({ classId: 'luxury', serviceId: 'signature-reset', addonIds: ['engine-bay'], zoneId: 'ikoyi' });
    // 45,000 × 1.5 = 67,500 + 15,000 + 5,000
    expect(q.subtotal).toBe(87500);
    expect(q.deposit).toBe(26500);
    expect(q.detailMinutes).toBe(150 + 25);
  });

  it('larger vehicles take longer', () => {
    const sedan = computeQuote({ ...SPEC, classId: 'sedan' }).detailMinutes;
    const pickup = computeQuote({ ...SPEC, classId: 'pickup' }).detailMinutes;
    expect(pickup).toBeGreaterThan(sedan);
  });
});

describe('seed integrity', () => {
  it('never double-books a unit and keeps every job inside dispatch hours', () => {
    for (const unit of UNITS) {
      const jobs = seed.bookings
        .filter((b) => b.unitId === unit.id)
        .sort((a, z) => Date.parse(a.occupiedStart) - Date.parse(z.occupiedStart));
      for (let i = 1; i < jobs.length; i++) {
        expect(Date.parse(jobs[i].occupiedStart), `${jobs[i - 1].code} overlaps ${jobs[i].code}`).toBeGreaterThanOrEqual(
          Date.parse(jobs[i - 1].occupiedEnd),
        );
      }
      for (const b of jobs) {
        const start = lagosClock(Date.parse(b.occupiedStart));
        const end = lagosClock(Date.parse(b.occupiedEnd));
        expect(start.minutes, b.code).toBeGreaterThanOrEqual(OPS.dispatchStart);
        expect(end.minutes, b.code).toBeLessThanOrEqual(OPS.dispatchEnd);
      }
    }
  });

  it('leaves several bookable windows every day for the primary demo journey', () => {
    for (let d = 0; d < 14; d++) {
      const date = addDays(TODAY, d);
      for (const classId of ['sedan', 'suv', 'luxury'] as const) {
        const open = dayAvailability({ date, spec: { ...SPEC, classId }, bookings: seed.bookings, now: NOW }).filter(
          (s) => s.status === 'available',
        );
        expect(open.length, `${date} ${classId}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('makes Friday–Sunday visibly tighter than midweek', () => {
    const days = summarizeDays(
      Array.from({ length: 7 }, (_, i) => addDays(TODAY, i)),
      { spec: SPEC, bookings: seed.bookings, now: NOW },
    );
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const weekend = avg(days.filter((d) => isWeekend(d.date)).map((d) => d.available));
    const midweek = avg(days.filter((d) => !isWeekend(d.date)).map((d) => d.available));
    expect(weekend).toBeLessThan(midweek);
  });

  it('is deterministic', () => {
    expect(generateSeed(TODAY).bookings.map((b) => b.code)).toEqual(seed.bookings.map((b) => b.code));
  });
});

describe('feasibility', () => {
  const date = addDays(TODAY, 1);
  const lone = buildBooking(
    { spec: SPEC, date, startMinutes: 10 * 60, unitId: 'unit-01', customer: { name: 'A', phone: '1', address: 'x', vehicleLabel: 'X5' } },
    { id: 'b1', code: 'APX-TEST1', source: 'web', createdAt: new Date(NOW).toISOString() },
  );
  const fullHouse = UNITS.map((u, i) => ({ ...lone, id: `b${i}`, code: `APX-T${i}`, unitId: u.id }));

  it('blocks a slot once every unit overlaps it, and explains why', () => {
    const slot = evaluateSlot({ date, spec: SPEC, bookings: fullHouse, now: NOW, start: 10 * 60 + 30 });
    expect(slot.status).toBe('booked');
    expect(slot.blockers).toHaveLength(3);
    expect(slot.reason).toMatch(/All 3 units committed/);
  });

  it('includes travel both ways: a job cannot start the minute the previous one ends', () => {
    const plan = planJob(SPEC, date, 10 * 60);
    const clash = evaluateSlot({ date, spec: SPEC, bookings: fullHouse, now: NOW, start: plan.endMinutes });
    expect(clash.status).toBe('booked');
    const after = Math.ceil(plan.freeMinutes / 30) * 30 + 30;
    expect(evaluateSlot({ date, spec: SPEC, bookings: fullHouse, now: NOW, start: after }).status).toBe('available');
  });

  it('a booking never blocks its own reschedule', () => {
    const slot = evaluateSlot({ date, spec: SPEC, bookings: [lone], now: NOW, start: 10 * 60 + 30, excludeBookingId: 'b1', units: [UNITS[0]] });
    expect(slot.status).toBe('available');
    const blocked = evaluateSlot({ date, spec: SPEC, bookings: [lone], now: NOW, start: 10 * 60 + 30, units: [UNITS[0]] });
    expect(blocked.status).toBe('booked');
  });

  it('refuses jobs that would return after the dispatch cut-off', () => {
    const slot = evaluateSlot({ date, spec: { ...SPEC, classId: 'luxury', serviceId: 'ceramic-shield' }, bookings: [], now: NOW, start: 17 * 60 });
    expect(slot.status).toBe('curfew');
  });

  it('refuses unserviced zones and short-notice slots', () => {
    expect(evaluateSlot({ date, spec: { ...SPEC, zoneId: 'ikeja' }, bookings: [], now: NOW, start: 12 * 60 }).status).toBe('zone');
    const soon = lagosMs(date, 11 * 60);
    expect(evaluateSlot({ date, spec: SPEC, bookings: [], now: soon, start: 12 * 60 }).status).toBe('lead');
  });

  it('prices weekday peak traffic into travel time', () => {
    expect(planJob({ ...SPEC, zoneId: 'ikoyi' }, date, 8 * 60).travelMinutes).toBeGreaterThan(
      planJob({ ...SPEC, zoneId: 'ikoyi' }, date, 12 * 60).travelMinutes,
    );
  });

  it('marks exactly one recommended slot', () => {
    const slots = dayAvailability({ date, spec: SPEC, bookings: seed.bookings, now: NOW });
    expect(slots.filter((s) => s.recommended)).toHaveLength(1);
  });

  it('walks a job through its live stages', () => {
    const at = (m: number) => lagosMs(date, m);
    expect(stageAt(lone, at(9 * 60)).stage).toBe('scheduled');
    expect(stageAt(lone, at(9 * 60 + 50)).stage).toBe('travel');
    expect(stageAt(lone, at(10 * 60 + 5)).stage).toBe('arrived');
    expect(stageAt(lone, at(11 * 60)).stage).toBe('detailing');
    expect(stageAt(lone, at(18 * 60)).stage).toBe('complete');
  });
});

describe('inquiry parser', () => {
  it('reads vehicle, day and zone from a WhatsApp message', () => {
    const p = parseInquiry("Hi! Can you detail my Range Rover tomorrow? I'm in Ikoyi.", TODAY);
    expect(p.classId).toBe('luxury');
    expect(p.vehicleLabel).toBe('Range Rover');
    expect(p.date).toBe(addDays(TODAY, 1));
    expect(p.zoneId).toBe('ikoyi');
    expect(p.serviceId).toBe('signature-reset');
  });

  it('picks up services, add-ons and time of day', () => {
    const p = parseInquiry('Need interior done on my Camry this Saturday morning, Lekki Phase 1. Dog hair everywhere', TODAY);
    expect(p.classId).toBe('sedan');
    expect(p.serviceId).toBe('interior-recovery');
    expect(p.addonIds).toContain('pet-hair');
    expect(p.zoneId).toBe('lekki-phase-1');
    expect(p.dayPart).toBe('morning');
    expect(p.date).toBe('2026-10-10');
  });

  it('understands ceramic on a G-Wagon in VI', () => {
    const p = parseInquiry('How much for ceramic coating on a G-Wagon next Friday afternoon? VI.', TODAY);
    expect(p.classId).toBe('luxury');
    expect(p.serviceId).toBe('ceramic-shield');
    expect(p.zoneId).toBe('victoria-island');
    expect(p.dayPart).toBe('afternoon');
  });
});
