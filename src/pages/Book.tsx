import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AutomationPulse } from '../components/apex/AutomationPulse';
import { AvailabilityOrbit } from '../components/apex/AvailabilityOrbit';
import { BookingProgressRail } from '../components/apex/BookingProgressRail';
import { BookingTimelineEngine } from '../components/apex/BookingTimelineEngine';
import { ConfirmationPass } from '../components/apex/ConfirmationPass';
import { DepositDock } from '../components/apex/DepositDock';
import { InquirySimulator } from '../components/apex/InquirySimulator';
import { LiveQuoteCapsule } from '../components/apex/LiveQuoteCapsule';
import { LocationRadar } from '../components/apex/LocationRadar';
import { ServiceComposer } from '../components/apex/ServiceComposer';
import { VehicleMorphSelector } from '../components/apex/VehicleMorphSelector';
import { serviceById, vehicleById, zoneById } from '../lib/catalog';
import type { BookingRecord } from '../lib/repository';
import { dayShort, hhmm } from '../lib/time';
import { EngineStartConfirmation } from '../motion/EngineStartConfirmation';
import { GarageArrival } from '../motion/GarageEntry';
import { MagneticStep } from '../motion/MagneticStep';
import { useAvailability, useBoard, useBoardData } from '../store/boardStore';
import { STEPS, useBooking, useSpec, type Step } from '../store/bookingStore';
import { telemetry } from '../store/telemetryStore';

const HEADINGS: { kicker: string; title: string; body: string }[] = [
  { kicker: 'Vehicle', title: 'What are we detailing?', body: 'Body size sets the base time and product use. Everything downstream recalculates.' },
  { kicker: 'Service', title: 'Compose the detail.', body: 'One base service, any modules. Price and time assemble live.' },
  { kicker: 'Location', title: 'Where is the car?', body: 'Travel time decides which windows a unit can actually make.' },
  { kicker: 'Time', title: 'Pick a real window.', body: 'Only windows a unit can complete end-to-end are offered.' },
  { kicker: 'Confirm', title: 'Lock it in.', body: '' },
];

export default function Book() {
  const location = useLocation();
  const [params] = useSearchParams();
  const garage = (location.state as { entry?: string } | null)?.entry === 'garage';
  const step = useBooking((s) => s.step);
  const maxStep = useBooking((s) => s.maxStep);
  const goTo = useBooking((s) => s.goTo);
  const draft = useBooking((s) => s.draft);
  const setSlot = useBooking((s) => s.setSlot);
  const setLastBooking = useBooking((s) => s.setLastBooking);
  const resetDraft = useBooking((s) => s.resetDraft);
  const spec = useSpec();
  const { slots, status } = useAvailability(draft.date, spec);
  const bookings = useBoardData().bookings;
  const events = useBoard((s) => s.events);
  const [intro, setIntro] = useState(() => params.get('intro') === '1' || (!garage && maxStep === 0));
  const [done, setDone] = useState<{ record: BookingRecord; sound: boolean } | null>(null);
  const prevStep = useRef(step);
  const direction: 1 | -1 = step >= prevStep.current ? 1 : -1;
  useEffect(() => {
    prevStep.current = step;
  }, [step]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, done]);

  // A changed vehicle/service/zone can make the held window infeasible — release it honestly.
  useEffect(() => {
    if (draft.slotStart === null || status !== 'ready' || !slots.length) return;
    const s = slots.find((x) => x.start === draft.slotStart);
    if (!s || s.status !== 'available') {
      setSlot(null);
      telemetry(`${hhmm(draft.slotStart)} no longer fits this job · pick another window`, { tone: 'warn', channel: 'SLOT' });
    } else if (s.unitId && !s.freeUnitIds.includes(draft.unitId ?? '')) {
      setSlot(s.start, s.unitId);
    }
  }, [slots, status, draft.slotStart, draft.unitId, setSlot]);

  const selectedSlot = slots.find((s) => s.start === draft.slotStart) ?? null;

  const canContinue = [true, true, !!zoneById(draft.zoneId ?? '')?.serviced, draft.slotStart !== null, false][step];
  const summaries = useMemo(
    () => [
      draft.vehicleLabel || vehicleById(draft.classId).label,
      [serviceById(draft.serviceId).name, draft.addonIds.length ? `+${draft.addonIds.length}` : ''].join(' '),
      draft.zoneId ? zoneById(draft.zoneId)?.name.split(' / ')[0] ?? null : null,
      draft.slotStart !== null ? `${dayShort(draft.date)} ${hhmm(draft.slotStart)}` : null,
      null,
    ],
    [draft],
  );

  const confirmed = (record: BookingRecord, opts: { sound: boolean }) => {
    setDone({ record, sound: opts.sound });
    setLastBooking(record.booking.code);
  };

  const bookAnother = () => {
    setDone(null);
    resetDraft();
    setIntro(false);
  };

  // ── Confirmed: the pass ──────────────────────────────────────────────────
  if (done) {
    const liveEvents = events.filter((e) => e.bookingId === done.record.booking.id);
    return (
      <div className="shell pb-24 pt-28 sm:pt-32">
        <EngineStartConfirmation sound={done.sound}>
          <div className="label mb-5 flex items-center gap-2">
            <span className="dot-live" /> Handled automatically · no owner intervention
          </div>
          <ConfirmationPass booking={done.record.booking} />
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <AutomationPulse events={liveEvents.length ? liveEvents : done.record.events} variant="sequence" max={12} title="What just happened" />
            <div className="grid content-start gap-4">
              <p className="text-silver">
                Your crew brief, reminders and aftercare are scheduled. Reschedule or cancel any time from your pass — the same live schedule decides what's possible.
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn btn-ghost" onClick={bookAnother}>
                  Book another car
                </button>
              </div>
            </div>
          </div>
        </EngineStartConfirmation>
      </div>
    );
  }

  // ── Entry: start from scratch or from a message ─────────────────────────
  if (intro) {
    return (
      <div className="shell pb-24 pt-28 sm:pt-32">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <div className="label mb-4 flex items-center gap-3">
            <span className="!text-acid">04</span>
            <span className="h-px w-10 bg-line-strong" /> Booking mode
          </div>
          <h1 className="display text-[clamp(52px,8vw,128px)] text-bone">
            Start anywhere<span className="text-acid">.</span>
          </h1>
          <div className="mt-10 grid gap-px border border-line bg-line lg:grid-cols-[minmax(0,.7fr)_minmax(0,2fr)]">
            <button type="button" onClick={() => setIntro(false)} className="bg-ink p-8 text-left transition-colors hover:bg-panel">
              <div className="label mb-4">From scratch</div>
              <div className="display text-[44px] text-bone">Build it →</div>
              <p className="mt-3 text-silver">Five steps. About two minutes.</p>
            </button>
            <div className="bg-ink p-6 sm:p-8">
              <InquirySimulator
                onConverted={(s) => {
                  setIntro(false);
                  goTo(s);
                }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── The five steps ───────────────────────────────────────────────────────
  const h = HEADINGS[step];
  return (
    <div className="pb-44 pt-24 sm:pt-28">
      {garage && <GarageArrival />}
      <div className="shell">
        <div className="mb-6 flex items-center justify-between">
          <span className="label">Booking mode · live schedule</span>
          <button type="button" className="label hover:!text-bone" onClick={() => setIntro(true)}>
            Start from a message ↗
          </button>
        </div>
        <BookingProgressRail steps={STEPS} current={step} reached={maxStep} summaries={summaries} onSelect={goTo} assemble={garage} />

        <div className="mt-10 sm:mt-14">
          <MagneticStep stepKey={step} direction={direction}>
            {step !== 4 && (
              <header className="mb-8 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <div className="label mb-3">
                    <span className="!text-acid">{String(step + 1).padStart(2, '0')}</span> / {h.kicker}
                  </div>
                  <h1 className="display text-[clamp(44px,6vw,96px)] text-bone">{h.title}</h1>
                </div>
                <p className="max-w-[36ch] text-silver">{h.body}</p>
              </header>
            )}

            {step === 0 && <VehicleMorphSelector />}
            {step === 1 && <ServiceComposer />}
            {step === 2 && <LocationRadar />}
            {step === 3 && (
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-14">
                <AvailabilityOrbit />
                <div className="xl:pt-[92px]">
                  <BookingTimelineEngine spec={spec} slot={selectedSlot} bookings={bookings} />
                </div>
              </div>
            )}
            {step === 4 && <DepositDock onConfirmed={confirmed} onChangeSlot={() => goTo(3)} />}
          </MagneticStep>

          {step > 0 && (
            <button type="button" className="label mt-10 hover:!text-bone" onClick={() => goTo((step - 1) as Step)}>
              ← Back to {STEPS[step - 1].toLowerCase()}
            </button>
          )}
        </div>
      </div>

      <LiveQuoteCapsule
        onContinue={step < 4 ? () => goTo((step + 1) as Step) : undefined}
        continueLabel={step === 3 ? 'Review & deposit' : `Next: ${STEPS[step + 1]?.toLowerCase() ?? ''}`}
        continueDisabled={!canContinue}
      />
    </div>
  );
}
