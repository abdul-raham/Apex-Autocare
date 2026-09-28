import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { AutomationPulse } from '../components/apex/AutomationPulse';
import { AutomotiveFooter } from '../components/apex/AutomotiveFooter';
import { ConfirmationPass } from '../components/apex/ConfirmationPass';
import { RescheduleSlider } from '../components/apex/RescheduleSlider';
import { OPS } from '../data/apex';
import { normalizeCode } from '../lib/bookings';
import { naira } from '../lib/catalog';
import { repository, type BookingRecord } from '../lib/repository';
import type { ReminderPrefs } from '../lib/types';
import { ApexLink, useApexPass } from '../motion/ApexPass';
import { useBoard, useNow } from '../store/boardStore';
import { telemetry } from '../store/telemetryStore';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; record: BookingRecord };

export default function ManageBooking() {
  const { bookingId = '' } = useParams();
  const code = normalizeCode(bookingId);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const lastSync = useBoard((s) => s.lastSync);
  const init = useBoard((s) => s.init);

  const fetchRecord = useCallback(async () => {
    try {
      const record = await repository.getBooking(code);
      setLoad(record ? { state: 'ready', record } : { state: 'missing' });
    } catch (e) {
      setLoad({ state: 'error', message: (e as Error).message });
    }
  }, [code]);

  useEffect(() => init(), [init]);
  // refetch whenever the shared board changes (another tab, realtime, our own edits)
  useEffect(() => {
    void fetchRecord();
  }, [fetchRecord, lastSync]);

  return (
    <>
      <div className="shell pb-10 pt-28 sm:pt-32">
        <div className="label mb-4 flex items-center gap-3">
          <span className="!text-acid">05</span>
          <span className="h-px w-10 bg-line-strong" /> Manage booking
        </div>
        {load.state === 'loading' && (
          <div className="grid gap-4" aria-busy="true">
            <div className="skeleton h-16 w-2/3 rounded-[3px]" />
            <div className="skeleton h-[360px] rounded-[6px]" />
          </div>
        )}
        {load.state === 'missing' && <Lookup code={code} />}
        {load.state === 'error' && (
          <div className="border border-tail/50 p-8" role="alert">
            <div className="label mb-2 !text-tail">Booking service unreachable</div>
            <p className="text-silver">{load.message} Your booking is safe — try again in a moment.</p>
            <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={() => void fetchRecord()}>
              Retry
            </button>
          </div>
        )}
        {load.state === 'ready' && <Manage record={load.record} onChange={(r) => setLoad({ state: 'ready', record: r })} />}
      </div>
      <AutomotiveFooter showCta={false} />
    </>
  );
}

function Lookup({ code }: { code: string }) {
  const { go } = useApexPass();
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim().length >= 4) go(`/manage/${normalizeCode(value)}`);
  };
  return (
    <div className="grid gap-6">
      <h1 className="display text-[clamp(52px,8vw,120px)] text-bone">No pass found.</h1>
      <p className="max-w-[48ch] text-silver">
        We couldn't find <span className="mono text-bone">{code}</span>. Check the code on your confirmation, or start a new booking.
      </p>
      <form onSubmit={submit} className="flex max-w-md gap-2">
        <label htmlFor="lookup" className="sr-only">
          Booking code
        </label>
        <input id="lookup" className="field mono uppercase" placeholder="APX-XXXXX" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="btn btn-primary shrink-0">
          Open →
        </button>
      </form>
      <ApexLink to="/book" className="label hover:!text-bone">
        Or build a new detail →
      </ApexLink>
    </div>
  );
}

function Manage({ record, onChange }: { record: BookingRecord; onChange: (r: BookingRecord) => void }) {
  const { booking, events } = record;
  const cancel = useBoard((s) => s.cancelBooking);
  const logEvent = useBoard((s) => s.logEvent);
  const now = useNow(60_000);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<ReminderPrefs>({ whatsapp: true, sms: false, email: !!booking.customerEmail, dayBefore: true, twoHours: true });
  const [prefsSaved, setPrefsSaved] = useState(false);
  const cancelled = booking.status === 'cancelled';
  const upcoming = Date.parse(booking.startAt) > now;
  const late = Date.parse(booking.startAt) - now < OPS.freeChangeHours * 3_600_000;

  const doCancel = async () => {
    setBusy(true);
    try {
      const r = await cancel(booking.code);
      onChange(r);
      telemetry(`${booking.code} cancelled · slot released to the pool`, { tone: 'warn', channel: 'MANAGE' });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    const channels = [prefs.whatsapp && 'WhatsApp', prefs.sms && 'SMS', prefs.email && 'email'].filter(Boolean).join(' + ') || 'no channel';
    const timing = [prefs.dayBefore && '24h', prefs.twoHours && '2h'].filter(Boolean).join(' + ') || 'no reminders';
    await logEvent(booking.code, 'reminder_prefs_updated', `Reminder preferences · ${channels} · ${timing}`, { ...prefs });
    setPrefsSaved(true);
    telemetry('Reminder preferences saved', { tone: 'ok', channel: 'MANAGE' });
    setTimeout(() => setPrefsSaved(false), 2200);
  };

  const toggle = (k: keyof ReminderPrefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="grid gap-16 [&>*]:min-w-0">
      <ConfirmationPass booking={booking} showManage={false} />

      {!cancelled && upcoming && <RescheduleSlider booking={booking} onRescheduled={onChange} />}

      <div className="grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="reminders-title" className={cancelled ? 'pointer-events-none opacity-40' : ''}>
          <h2 id="reminders-title" className="label mb-4 !text-bone">
            Reminder preferences
          </h2>
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
            {(
              [
                ['whatsapp', 'WhatsApp'],
                ['sms', 'SMS'],
                ['email', 'Email'],
                ['dayBefore', '24 hours before'],
                ['twoHours', '"Crew en route" 2h before'],
              ] as [keyof ReminderPrefs, string][]
            ).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between gap-4 bg-ink px-4 py-3 text-[14px] text-silver hover:bg-panel">
                {label}
                <input type="checkbox" checked={prefs[k]} onChange={() => toggle(k)} className="h-4 w-4 accent-[var(--color-acid)]" />
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={() => void savePrefs()}>
            {prefsSaved ? '✓ Saved' : 'Save preferences'}
          </button>
        </section>

        <section aria-labelledby="cancel-title">
          <h2 id="cancel-title" className="label mb-4 !text-bone">
            Cancellation
          </h2>
          {cancelled ? (
            <p className="text-silver">
              This booking is cancelled. {booking.paymentStatus === 'refunded' ? `Your ${naira(booking.depositAmount)} deposit refund is queued.` : 'The deposit covered the crew slot.'}
            </p>
          ) : !upcoming ? (
            <p className="text-silver">This appointment has already started.</p>
          ) : (
            <>
              <p className="text-[14px] leading-relaxed text-silver">
                {late
                  ? `You're inside ${OPS.freeChangeHours}h of arrival — cancelling now keeps the ${naira(booking.depositAmount)} deposit to cover the crew's reserved time. Moving the booking is free.`
                  : `Free until ${OPS.freeChangeHours}h before arrival — your ${naira(booking.depositAmount)} deposit is refunded in full.`}
              </p>
              <AnimatePresence mode="wait" initial={false}>
                {confirming ? (
                  <motion.div key="c" className="mt-4 flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button type="button" className="btn btn-sm border-tail bg-tail text-ink" onClick={() => void doCancel()} disabled={busy}>
                      {busy ? 'Cancelling…' : `Yes, cancel ${booking.code}`}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                      Keep booking
                    </button>
                  </motion.div>
                ) : (
                  <motion.button key="b" type="button" className="btn btn-ghost btn-sm mt-4 hover:!border-tail hover:!text-tail" onClick={() => setConfirming(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Cancel booking
                  </motion.button>
                )}
              </AnimatePresence>
            </>
          )}
        </section>
      </div>

      <AutomationPulse events={events} now={now} max={20} title="Automation log for this booking" />
    </div>
  );
}
