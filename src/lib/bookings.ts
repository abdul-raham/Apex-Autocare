import { computeQuote } from './quote';
import { planJob } from './scheduling';
import type { Booking, CreateBookingInput, JobSpec } from './types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `APX-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
}

/** Stable code for seeded bookings so the local demo is reproducible. */
export function hashCode(input: string): string {
  let h = 2166136261;
  let out = '';
  for (let i = 0; i < 5; i++) {
    for (const ch of input + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
  }
  return `APX-${out}`;
}

export function normalizeCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.startsWith('APX') ? `APX-${clean.slice(3)}` : `APX-${clean}`;
}

interface BuildOptions {
  id: string;
  code: string;
  source: Booking['source'];
  createdAt: string;
  paymentStatus?: Booking['paymentStatus'];
}

/** Turn a spec + slot into a fully-costed booking record (times, money, occupancy). */
export function buildBooking(input: CreateBookingInput, opts: BuildOptions): Booking {
  const plan = planJob(input.spec, input.date, input.startMinutes);
  const quote = computeQuote(input.spec);
  const paid = (opts.paymentStatus ?? 'deposit_paid') === 'deposit_paid';
  return {
    id: opts.id,
    code: opts.code,
    isDemo: true,
    source: opts.source,
    customerName: input.customer.name.trim(),
    customerPhone: input.customer.phone.trim(),
    customerEmail: input.customer.email?.trim() || undefined,
    classId: input.spec.classId,
    vehicleLabel: input.customer.vehicleLabel.trim(),
    serviceId: input.spec.serviceId,
    addonIds: [...input.spec.addonIds],
    zoneId: input.spec.zoneId,
    address: input.customer.address.trim(),
    unitId: input.unitId,
    startAt: new Date(plan.startMs).toISOString(),
    endAt: new Date(plan.endMs).toISOString(),
    travelMinutes: plan.travelMinutes,
    setupMinutes: plan.setupMinutes,
    detailMinutes: plan.detailMinutes,
    inspectionMinutes: plan.inspectionMinutes,
    occupiedStart: new Date(plan.occupiedStartMs).toISOString(),
    occupiedEnd: new Date(plan.occupiedEndMs).toISOString(),
    subtotal: quote.subtotal,
    depositAmount: quote.deposit,
    paymentStatus: paid ? 'deposit_paid' : 'pending',
    status: paid ? 'confirmed' : 'pending_deposit',
    rescheduleCount: 0,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  };
}

/** Re-time an existing booking onto a new slot, keeping its identity and money. */
export function retimeBooking(b: Booking, date: string, startMinutes: number, unitId: string, at: string): Booking {
  const spec: JobSpec = { classId: b.classId, serviceId: b.serviceId, addonIds: b.addonIds, zoneId: b.zoneId };
  const plan = planJob(spec, date, startMinutes);
  return {
    ...b,
    unitId,
    startAt: new Date(plan.startMs).toISOString(),
    endAt: new Date(plan.endMs).toISOString(),
    travelMinutes: plan.travelMinutes,
    occupiedStart: new Date(plan.occupiedStartMs).toISOString(),
    occupiedEnd: new Date(plan.occupiedEndMs).toISOString(),
    rescheduleCount: b.rescheduleCount + 1,
    updatedAt: at,
  };
}

export const specOf = (b: Booking): JobSpec => ({ classId: b.classId, serviceId: b.serviceId, addonIds: b.addonIds, zoneId: b.zoneId });
