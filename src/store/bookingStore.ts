import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VehicleClassId } from '../data/apex';
import type { ParsedInquiry } from '../lib/inquiry';
import { computeQuote } from '../lib/quote';
import { addDays, lagosClock } from '../lib/time';
import type { JobSpec } from '../lib/types';

/**
 * Shared draft booking. VehicleMorphSelector, ServiceComposer, LocationRadar,
 * AvailabilityOrbit, BookingTimelineEngine and LiveQuoteCapsule all read and write
 * this one object, so every component reacts to the same state.
 */

export const STEPS = ['VEHICLE', 'SERVICE', 'LOCATION', 'TIME', 'CONFIRM'] as const;
export type Step = 0 | 1 | 2 | 3 | 4;

export interface Draft {
  classId: VehicleClassId;
  vehicleLabel: string;
  serviceId: string;
  addonIds: string[];
  zoneId: string | null;
  address: string;
  date: string;
  slotStart: number | null;
  unitId: string | null;
  preferredStart: number | null;
  customer: { name: string; phone: string; email: string };
}

interface BookingState {
  draft: Draft;
  step: Step;
  maxStep: Step;
  inquiry: { text: string; channel: string } | null;
  lastBookingCode: string | null;
  setVehicle: (classId: VehicleClassId) => void;
  setVehicleLabel: (label: string) => void;
  setService: (id: string) => void;
  toggleAddon: (id: string) => void;
  setZone: (id: string | null) => void;
  setAddress: (address: string) => void;
  setDate: (date: string) => void;
  setSlot: (start: number | null, unitId?: string | null) => void;
  setCustomer: (patch: Partial<Draft['customer']>) => void;
  goTo: (step: Step) => void;
  next: () => void;
  back: () => void;
  applyInquiry: (parsed: ParsedInquiry, text: string, channel: string) => Step;
  setLastBooking: (code: string | null) => void;
  resetDraft: () => void;
}

const tomorrow = () => addDays(lagosClock().date, 1);

const initialDraft = (): Draft => ({
  classId: 'suv',
  vehicleLabel: '',
  serviceId: 'signature-reset',
  addonIds: [],
  zoneId: null,
  address: '',
  date: tomorrow(),
  slotStart: null,
  unitId: null,
  preferredStart: null,
  customer: { name: '', phone: '', email: '' },
});

export const useBooking = create<BookingState>()(
  persist(
    (set, get) => {
      const patch = (p: Partial<Draft>) => set((s) => ({ draft: { ...s.draft, ...p } }));
      return {
        draft: initialDraft(),
        step: 0,
        maxStep: 0,
        inquiry: null,
        lastBookingCode: null,
        setVehicle: (classId) => patch({ classId }),
        setVehicleLabel: (vehicleLabel) => patch({ vehicleLabel }),
        setService: (serviceId) => patch({ serviceId }),
        toggleAddon: (id) =>
          set((s) => ({
            draft: {
              ...s.draft,
              addonIds: s.draft.addonIds.includes(id) ? s.draft.addonIds.filter((x) => x !== id) : [...s.draft.addonIds, id],
            },
          })),
        setZone: (zoneId) => patch({ zoneId }),
        setAddress: (address) => patch({ address }),
        setDate: (date) => patch({ date, slotStart: null, unitId: null }),
        setSlot: (slotStart, unitId = null) => patch({ slotStart, unitId }),
        setCustomer: (c) => set((s) => ({ draft: { ...s.draft, customer: { ...s.draft.customer, ...c } } })),
        goTo: (step) => set((s) => ({ step, maxStep: Math.max(s.maxStep, step) as Step })),
        next: () => get().goTo(Math.min(4, get().step + 1) as Step),
        back: () => set((s) => ({ step: Math.max(0, s.step - 1) as Step })),
        applyInquiry: (p, text, channel) => {
          const d = get().draft;
          const today = lagosClock().date;
          const draft: Draft = {
            ...d,
            classId: p.classId ?? d.classId,
            vehicleLabel: p.vehicleLabel ?? d.vehicleLabel,
            serviceId: p.serviceId,
            addonIds: p.addonIds,
            zoneId: p.zoneId ?? d.zoneId,
            date: p.date && p.date >= today ? p.date : d.date,
            preferredStart: p.preferredStart ?? null,
            slotStart: null,
            unitId: null,
          };
          // Jump to the first thing the message didn't answer.
          const step: Step = !p.classId ? 0 : !p.zoneId ? 2 : 3;
          set({ draft, step, maxStep: step, inquiry: { text, channel } });
          return step;
        },
        setLastBooking: (lastBookingCode) => set({ lastBookingCode }),
        resetDraft: () => set({ draft: initialDraft(), step: 0, maxStep: 0, inquiry: null }),
      };
    },
    {
      name: 'apex.booking.v1',
      partialize: (s) => ({ draft: s.draft, step: s.step, maxStep: s.maxStep, lastBookingCode: s.lastBookingCode, inquiry: s.inquiry }),
      merge: (persisted, current) => {
        const p = persisted as Partial<BookingState> | undefined;
        if (!p?.draft) return current;
        // A draft left over from a previous day must not point at a past date.
        const stale = p.draft.date < lagosClock().date;
        return {
          ...current,
          ...p,
          draft: { ...initialDraft(), ...p.draft, ...(stale ? { date: tomorrow(), slotStart: null, unitId: null } : {}) },
        };
      },
    },
  ),
);

export function specOf(draft: Draft): JobSpec {
  return { classId: draft.classId, serviceId: draft.serviceId, addonIds: draft.addonIds, zoneId: draft.zoneId ?? '' };
}

export function useSpec(): JobSpec {
  const classId = useBooking((s) => s.draft.classId);
  const serviceId = useBooking((s) => s.draft.serviceId);
  const addonIds = useBooking((s) => s.draft.addonIds);
  const zoneId = useBooking((s) => s.draft.zoneId);
  return useMemo(() => ({ classId, serviceId, addonIds, zoneId: zoneId ?? '' }), [classId, serviceId, addonIds, zoneId]);
}

export function useQuote() {
  const spec = useSpec();
  return useMemo(() => computeQuote(spec), [spec]);
}
