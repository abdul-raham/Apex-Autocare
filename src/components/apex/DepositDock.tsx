import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { OPS } from '../../data/apex';
import type { BookingRecord } from '../../lib/repository';
import { naira, serviceById, unitById, vehicleById, zoneById } from '../../lib/catalog';
import { dayLong, dateLabel, duration, hhmm } from '../../lib/time';
import { BackendUnavailableError, SlotConflictError } from '../../lib/types';
import { useBoard } from '../../store/boardStore';
import { useBooking, useQuote } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';

type PayState = 'idle' | 'processing' | 'conflict' | 'error';

export interface DepositDockProps {
  onConfirmed: (record: BookingRecord, opts: { sound: boolean }) => void;
  onChangeSlot: () => void;
}

const PHONE_RE = /^(\+?234|0)[789][01]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOLD_MS = 1100;

const STEPS = ['Contacting demo gateway', 'Deposit authorised (simulated)', 'Re-validating slot against live schedule', 'Blocking calendar'];

/**
 * The deposit step. Collects contact details, states the no-show policy plainly,
 * and runs a clearly-labelled simulated payment. Success is only shown once the
 * booking is actually persisted — a slot taken in the meantime sends the customer
 * back to the orbit instead of pretending.
 */
export function DepositDock({ onConfirmed, onChangeSlot }: DepositDockProps) {
  const draft = useBooking((s) => s.draft);
  const setCustomer = useBooking((s) => s.setCustomer);
  const setAddress = useBooking((s) => s.setAddress);
  const createBooking = useBoard((s) => s.createBooking);
  const mode = useBoard((s) => s.mode);
  const q = useQuote();
  const reduce = useReducedMotion();
  const [state, setState] = useState<PayState>('idle');
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [sound, setSound] = useState(false);

  const phone = draft.customer.phone.replace(/[\s-]/g, '');
  const errors = {
    name: draft.customer.name.trim().length < 2 ? 'Enter the name the crew should ask for' : '',
    phone: !PHONE_RE.test(phone) ? 'Enter a Nigerian mobile, e.g. 0803 123 4567' : '',
    email: draft.customer.email && !EMAIL_RE.test(draft.customer.email) ? 'That email looks incomplete' : '',
    address: draft.address.trim().length < 4 ? 'Street and estate so the unit can find you' : '',
  };
  const valid = !errors.name && !errors.phone && !errors.email && !errors.address;
  const ready = valid && draft.slotStart !== null && !!draft.unitId && !!draft.zoneId;

  const pay = async () => {
    setTouched(true);
    if (!ready || state === 'processing') return;
    setState('processing');
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 420);
    try {
      const [record] = await Promise.all([
        createBooking({
          spec: { classId: draft.classId, serviceId: draft.serviceId, addonIds: draft.addonIds, zoneId: draft.zoneId! },
          date: draft.date,
          startMinutes: draft.slotStart!,
          unitId: draft.unitId!,
          customer: {
            name: draft.customer.name,
            phone,
            email: draft.customer.email || undefined,
            address: draft.address,
            vehicleLabel: draft.vehicleLabel || vehicleById(draft.classId).examples.split(' · ')[0],
          },
        }),
        new Promise((r) => setTimeout(r, reduce ? 200 : 1700)),
      ]);
      clearInterval(ticker);
      telemetry(`Booking ${record.booking.code} persisted · ${record.events.length} automations queued`, { tone: 'ok', channel: 'BOOK' });
      onConfirmed(record, { sound });
    } catch (e) {
      clearInterval(ticker);
      if (e instanceof SlotConflictError) {
        setState('conflict');
        setMessage(e.message);
        telemetry('Slot taken moments ago · no deposit captured', { tone: 'warn', channel: 'BOOK' });
      } else {
        setState('error');
        setMessage(e instanceof BackendUnavailableError ? 'We couldn’t reach the booking service. Nothing was charged and nothing was booked.' : (e as Error).message);
        telemetry('Booking not persisted · safe to retry', { tone: 'error', channel: 'BOOK' });
      }
    }
  };

  const field = (key: 'name' | 'phone' | 'email', label: string, props: Record<string, string>) => (
    <label className="grid gap-1.5">
      <span className="label">{label}</span>
      <input
        className="field"
        value={draft.customer[key]}
        onChange={(e) => setCustomer({ [key]: e.target.value })}
        aria-invalid={touched && !!errors[key]}
        {...props}
      />
      {touched && errors[key] && <span className="text-[12px] text-tail">{errors[key]}</span>}
    </label>
  );

  const zone = draft.zoneId ? zoneById(draft.zoneId) : null;
  const processing = state === 'processing';

  return (
    <section aria-labelledby="deposit-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,.95fr)] lg:gap-12">
      <div>
        <h2 id="deposit-title" className="display text-[clamp(40px,5vw,72px)] text-bone">
          Lock the slot<span className="text-acid">.</span>
        </h2>
        <p className="mt-3 max-w-[48ch] text-silver">A {Math.round(OPS.depositRate * 100)}% deposit commits a unit and crew to your window. The balance is paid on handover, after you've inspected the car.</p>

        <form className="mt-8 grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
          {field('name', 'Name', { autoComplete: 'name', placeholder: 'Adaeze Okafor', maxLength: '80' })}
          {field('phone', 'WhatsApp number', { autoComplete: 'tel', inputMode: 'tel', placeholder: '0803 123 4567', maxLength: '20' })}
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="label">Address · {zone?.name ?? 'zone not set'}</span>
            <input
              className="field"
              value={draft.address}
              onChange={(e) => setAddress(e.target.value)}
              aria-invalid={touched && !!errors.address}
              autoComplete="street-address"
              placeholder="14 Admiralty Way, Lekki Phase 1"
              maxLength={240}
            />
            {touched && errors.address && <span className="text-[12px] text-tail">{errors.address}</span>}
          </label>
          <div className="sm:col-span-2">{field('email', 'Email for receipt (optional)', { autoComplete: 'email', inputMode: 'email', placeholder: 'you@example.com', maxLength: '120' })}</div>
        </form>

        <div className="mt-8 border-l-2 border-amber/70 pl-4 text-[13px] leading-relaxed text-silver">
          <div className="label mb-1 !text-amber">Cancellation & no-show</div>
          Free reschedule or cancellation up to {OPS.freeChangeHours}h before arrival — deposit refunded in full. Inside {OPS.freeChangeHours}h, or if the crew can't access the car, the deposit covers the unit's lost time.
        </div>
      </div>

      <div className="relative self-start border border-line-strong bg-panel p-5 sm:p-7">
        <div className="label flex justify-between">
          <span>Deposit dock</span>
          <span className="!text-amber">Demo payment · no card charged</span>
        </div>
        <dl className="mt-5 grid gap-2 text-[13.5px]">
          {[
            ['Vehicle', `${draft.vehicleLabel || vehicleById(draft.classId).label}`],
            ['Service', [serviceById(draft.serviceId).name, ...draft.addonIds.map((a) => `+${a.replace(/-/g, ' ')}`)].join(' ')],
            ['Window', draft.slotStart !== null ? `${dayLong(draft.date)} ${dateLabel(draft.date)} · ${hhmm(draft.slotStart)}` : '— choose a time'],
            ['Unit', draft.unitId ? unitById(draft.unitId).name : '—'],
            ['On site', duration(q.onSiteMinutes)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 border-b border-line pb-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right capitalize text-bone">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <div className="label">Total</div>
            <div className="mono text-[15px] text-silver">{naira(q.subtotal)}</div>
          </div>
          <div className="text-right">
            <div className="label !text-acid">Deposit due now</div>
            <div className="display-wide text-[34px] leading-none text-bone">{naira(q.deposit)}</div>
          </div>
        </div>

        <div className="mono mt-5 flex items-center justify-between border border-dashed border-line-strong px-3 py-2.5 text-[12px] text-muted">
          <span>DEMO CARD •••• 4081</span>
          <span>{mode === 'supabase' ? 'Persists to Supabase' : 'Persists to local demo store'}</span>
        </div>

        <div className="mt-5">
          <AnimatePresence mode="wait" initial={false}>
            {processing ? (
              <motion.ol key="proc" className="grid gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite">
                {STEPS.map((s, i) => (
                  <li key={s} className={`mono flex items-center gap-2 text-[12px] ${i <= step ? 'text-bone' : 'text-dim'}`}>
                    <span className={i < step ? 'text-acid' : i === step ? 'animate-pulse text-acid' : ''}>{i < step ? '✓' : i === step ? '◉' : '○'}</span>
                    {s}
                    {i === 1 && ` · ${naira(q.deposit)}`}
                  </li>
                ))}
              </motion.ol>
            ) : (
              <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <HoldButton disabled={draft.slotStart === null} instant={!!reduce} onComplete={pay} onBlocked={() => setTouched(true)} blocked={!ready}>
                  Hold to pay {naira(q.deposit)} & start
                </HoldButton>
                <label className="label mt-3 flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="accent-[var(--color-acid)]" />
                  Engine sound on confirmation
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          {state === 'conflict' && (
            <div className="mt-4 border border-amber/60 bg-amber/10 p-3 text-[13px] text-bone" role="alert">
              <div className="label mb-1 !text-amber">Window just taken</div>
              {message} No deposit was captured.
              <button type="button" className="btn btn-ghost btn-sm mt-3 w-full" onClick={onChangeSlot}>
                Choose another window →
              </button>
            </div>
          )}
          {state === 'error' && (
            <div className="mt-4 border border-tail/60 bg-tail/10 p-3 text-[13px] text-bone" role="alert">
              <div className="label mb-1 !text-tail">Not booked</div>
              {message}
              <button type="button" className="btn btn-ghost btn-sm mt-3 w-full" onClick={() => void pay()}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Press-and-hold ignition button. Keyboard: hold Space/Enter. Reduced motion: single press. */
function HoldButton({
  children,
  onComplete,
  disabled,
  instant,
  blocked,
  onBlocked,
}: {
  children: React.ReactNode;
  onComplete: () => void;
  disabled?: boolean;
  instant: boolean;
  blocked: boolean;
  onBlocked: () => void;
}) {
  const progress = useMotionValue(0);
  const width = useTransform(progress, (p) => `${p * 100}%`);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const held = useRef(false);

  useEffect(() => () => anim.current?.stop(), []);

  const start = () => {
    if (disabled) return;
    if (blocked) {
      onBlocked();
      return;
    }
    if (instant) {
      onComplete();
      return;
    }
    held.current = true;
    anim.current?.stop();
    anim.current = animate(progress, 1, {
      duration: (HOLD_MS / 1000) * (1 - progress.get()),
      ease: 'linear',
      onComplete: () => {
        if (held.current) {
          held.current = false;
          onComplete();
        }
      },
    });
  };
  const cancel = () => {
    if (!held.current) return;
    held.current = false;
    anim.current?.stop();
    anim.current = animate(progress, 0, { duration: 0.35, ease: 'easeOut' });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      start();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') cancel();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-describedby="hold-hint"
      className="btn btn-primary relative w-full min-h-[60px] select-none text-[12.5px]"
    >
      <motion.span aria-hidden className="absolute inset-y-0 left-0 bg-ink/25" style={{ width }} />
      <span className="relative flex items-center gap-3">
        <span className="grid h-6 w-6 place-items-center rounded-full border border-ink/60 text-[10px]">⏻</span>
        {children}
      </span>
      <span id="hold-hint" className="sr-only">
        {instant ? 'Press to confirm' : 'Press and hold for one second to confirm'}
      </span>
    </button>
  );
}
