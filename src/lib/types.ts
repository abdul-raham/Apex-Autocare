import type { VehicleClassId } from '../data/apex';

export interface JobSpec {
  classId: VehicleClassId;
  serviceId: string;
  addonIds: string[];
  zoneId: string;
}

export type PaymentStatus = 'pending' | 'deposit_paid' | 'refunded';
export type BookingStatus = 'confirmed' | 'pending_deposit' | 'cancelled';

export interface Booking {
  id: string;
  code: string;
  isDemo: boolean;
  source: 'seed' | 'web';
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  classId: VehicleClassId;
  vehicleLabel: string;
  serviceId: string;
  addonIds: string[];
  zoneId: string;
  address?: string;
  unitId: string;
  /** Crew arrival at the customer (setup begins). UTC ISO string. */
  startAt: string;
  /** Crew leaves the customer (inspection done). UTC ISO string. */
  endAt: string;
  travelMinutes: number;
  setupMinutes: number;
  detailMinutes: number;
  inspectionMinutes: number;
  /** Full crew commitment: outbound travel → return + turnaround. UTC ISO strings. */
  occupiedStart: string;
  occupiedEnd: string;
  subtotal: number;
  depositAmount: number;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  rescheduleCount: number;
  createdAt: string;
  updatedAt: string;
}

export type EventStatus = 'completed' | 'scheduled' | 'cancelled';

export type EventType =
  | 'quote_calculated'
  | 'slot_validated'
  | 'unit_assigned'
  | 'deposit_verified'
  | 'deposit_pending'
  | 'deposit_nudge'
  | 'calendar_blocked'
  | 'confirmation_sent'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'crew_brief'
  | 'review_request'
  | 'rescheduled'
  | 'cancelled'
  | 'reminder_prefs_updated';

export interface BookingEvent {
  id: string;
  bookingId: string;
  bookingCode: string;
  type: EventType;
  label: string;
  status: EventStatus;
  scheduledFor: string | null;
  completedAt: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  address: string;
  vehicleLabel: string;
}

export interface CreateBookingInput {
  spec: JobSpec;
  date: string;
  startMinutes: number;
  unitId: string;
  customer: CustomerInput;
}

export interface ReminderPrefs {
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
  dayBefore: boolean;
  twoHours: boolean;
}

export class SlotConflictError extends Error {
  constructor(message = 'That window was just taken by another booking.') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export class BackendUnavailableError extends Error {
  constructor(message = 'The booking service is unreachable.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}
