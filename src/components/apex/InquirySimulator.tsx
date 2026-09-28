import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { DEMO_INQUIRIES } from '../../data/apex';
import { addonById, naira, serviceById, vehicleById, zoneById } from '../../lib/catalog';
import { parseInquiry, type InquiryToken, type ParsedInquiry, type TokenKind } from '../../lib/inquiry';
import { computeQuote } from '../../lib/quote';
import { dayAvailability } from '../../lib/scheduling';
import { addDays, hhmm, lagosClock, relativeDayLabel } from '../../lib/time';
import { useBoardData } from '../../store/boardStore';
import { useBooking, type Step } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';

export interface InquirySimulatorProps {
  /** Called after the inquiry has been applied to the booking draft. */
  onConverted?: (step: Step) => void;
  /** Demo mode on /process: no hand-off button. */
  showHandoff?: boolean;
}

const KIND: Record<TokenKind, string> = {
  vehicle: 'decoration-acid',
  day: 'decoration-amber',
  time: 'decoration-amber',
  zone: 'decoration-silver',
  service: 'decoration-acid',
  addon: 'decoration-acid',
};

function highlight(text: string, tokens: InquiryToken[]) {
  const out: React.ReactNode[] = [];
  let at = 0;
  tokens.forEach((t, i) => {
    if (t.index < at) return;
    out.push(text.slice(at, t.index));
    out.push(
      <motion.mark
        key={i}
        className={`bg-transparent text-bone underline decoration-2 underline-offset-4 ${KIND[t.kind]}`}
        initial={{ backgroundColor: 'rgba(201,255,61,0)' }}
        animate={{ backgroundColor: ['rgba(201,255,61,.35)', 'rgba(201,255,61,0)'] }}
        transition={{ delay: 0.2 + i * 0.12, duration: 0.9 }}
      >
        {text.slice(t.index, t.index + t.text.length)}
      </motion.mark>,
    );
    at = t.index + t.text.length;
  });
  out.push(text.slice(at));
  return out;
}

/**
 * Demo entry point: start from a realistic inbound DM and watch it become
 * structured booking state — plus the reply APEX would send, built from real
 * availability, so the owner never types it.
 */
export function InquirySimulator({ onConverted, showHandoff = true }: InquirySimulatorProps) {
  const [preset, setPreset] = useState(0);
  const [text, setText] = useState<string>(DEMO_INQUIRIES[0].text);
  const [parsed, setParsed] = useState<ParsedInquiry | null>(null);
  const applyInquiry = useBooking((s) => s.applyInquiry);
  const { bookings, status } = useBoardData();
  const channel = DEMO_INQUIRIES[preset]?.channel ?? 'WhatsApp';
  const handle = DEMO_INQUIRIES[preset]?.handle ?? '+234 ••• ••• ••••';

  const convert = () => {
    const p = parseInquiry(text);
    setParsed(p);
    telemetry(`Inquiry parsed · ${p.tokens.length} signals extracted`, { tone: 'ok', channel: 'INBOX' });
  };

  const reply = useMemo(() => {
    if (!parsed || status !== 'ready') return null;
    const today = lagosClock().date;
    const classId = parsed.classId ?? 'suv';
    const zoneId = parsed.zoneId ?? 'lekki-phase-1';
    const zone = zoneById(zoneId);
    if (!zone?.serviced) {
      return `Thanks for reaching out! ${zone?.name ?? 'That area'} is just outside our mobile run for now — we cover Lekki to Sangotedo, VI and Ikoyi.`;
    }
    const spec = { classId, serviceId: parsed.serviceId, addonIds: parsed.addonIds, zoneId };
    const q = computeQuote(spec);
    const first = parsed.date ?? addDays(today, 1);
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, d);
      const open = dayAvailability({ date, spec, bookings }).filter((s) => s.status === 'available');
      if (!open.length) continue;
      const pref = parsed.preferredStart;
      const slot = pref !== undefined ? open.reduce((b, s) => (Math.abs(s.start - pref) < Math.abs(b.start - pref) ? s : b)) : open.find((s) => s.recommended) ?? open[0];
      const moved = parsed.date && date !== parsed.date ? `${relativeDayLabel(parsed.date, today)} is fully committed, but ` : '';
      return `Hi! ${moved}we can have a unit with you ${relativeDayLabel(date, today).toLowerCase()} at ${hhmm(slot.start)} in ${zone.name.split(' / ')[0]}. ${serviceById(parsed.serviceId).name} for your ${parsed.vehicleLabel ?? vehicleById(classId).label} is ${naira(q.subtotal)}; a ${naira(q.deposit)} deposit locks it. Book here in 2 taps →`;
    }
    return 'We’re fully committed this week — we’ll message you the moment a window opens.';
  }, [parsed, bookings, status]);

  const handoff = () => {
    if (!parsed) return;
    const step = applyInquiry(parsed, text, channel);
    telemetry('Booking pre-filled from inquiry · zero back-and-forth', { tone: 'ok', channel: 'INBOX' });
    onConverted?.(step);
  };

  const fields: [string, string | null][] = parsed
    ? [
        ['Vehicle', parsed.classId ? `${parsed.vehicleLabel} · ${vehicleById(parsed.classId).label}` : null],
        ['Day', parsed.date ? relativeDayLabel(parsed.date) : null],
        ['Time', parsed.preferredStart !== undefined ? (parsed.dayPart ? `${parsed.dayPart} (~${hhmm(parsed.preferredStart)})` : hhmm(parsed.preferredStart)) : null],
        ['Zone', parsed.zoneId ? zoneById(parsed.zoneId)?.name ?? null : null],
        ['Service', serviceById(parsed.serviceId).name + (parsed.tokens.some((t) => t.kind === 'service') ? '' : ' (default)')],
        ['Modules', parsed.addonIds.length ? parsed.addonIds.map((a) => addonById(a)?.name).join(', ') : 'None mentioned'],
      ]
    : [];

  return (
    <section aria-labelledby="inquiry-title" className="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <div>
        <div className="label mb-3 flex items-center justify-between">
          <span id="inquiry-title">Inbound · {channel}</span>
          <span className="mono">{handle}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Example messages">
          {DEMO_INQUIRIES.map((m, i) => (
            <button
              key={m.text}
              type="button"
              aria-pressed={preset === i}
              onClick={() => {
                setPreset(i);
                setText(m.text);
                setParsed(null);
              }}
              className={`label border px-2.5 py-1.5 ${preset === i ? 'border-acid !text-acid' : 'border-line hover:border-line-strong'}`}
            >
              {m.channel} {i + 1}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-[4px] border border-line bg-graphite p-4">
          <AnimatePresence mode="wait">
            {parsed ? (
              <motion.p key="hl" className="text-[19px] leading-relaxed text-silver sm:text-[21px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                “{highlight(text, parsed.tokens)}”
              </motion.p>
            ) : (
              <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <label htmlFor="inquiry-text" className="sr-only">
                  Inquiry message
                </label>
                <textarea
                  id="inquiry-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={400}
                  className="w-full resize-none bg-transparent text-[19px] leading-relaxed text-bone outline-none sm:text-[21px]"
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="label !text-[9.5px]">{parsed ? 'Parsed · edit to try your own' : 'Type your own or pick an example'}</span>
            {parsed ? (
              <button type="button" className="label hover:!text-bone" onClick={() => setParsed(null)}>
                Edit
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={convert} disabled={text.trim().length < 6}>
                Turn into booking <span className="arrow">→</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div aria-live="polite">
        <div className="label mb-3">Structured booking state</div>
        {parsed ? (
          <>
            <dl className="grid border-t border-line">
              {fields.map(([k, v], i) => (
                <motion.div
                  key={k}
                  className="grid grid-cols-[92px_1fr_auto] items-center gap-3 border-b border-line py-2.5"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                >
                  <dt className="label">{k}</dt>
                  <dd className={`text-[14px] ${v ? 'text-bone' : 'text-muted'}`}>{v ?? 'Not stated — asked in-flow'}</dd>
                  <span className={`mono text-[11px] ${v ? 'text-acid' : 'text-amber'}`}>{v ? '✓' : '?'}</span>
                </motion.div>
              ))}
            </dl>
            {reply && (
              <motion.div className="mt-5 border-l-2 border-acid bg-panel p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                <div className="label mb-2 flex justify-between">
                  <span className="!text-acid">Auto-reply drafted</span>
                  <span>from live availability</span>
                </div>
                <p className="text-[14px] leading-relaxed text-bone">{reply}</p>
              </motion.div>
            )}
            {showHandoff && (
              <button type="button" className="btn btn-primary mt-5 w-full sm:w-auto" onClick={handoff}>
                Open pre-filled booking <span className="arrow">→</span>
              </button>
            )}
          </>
        ) : (
          <div className="grid h-[260px] place-items-center border border-dashed border-line text-center">
            <p className="label max-w-[30ch]">Vehicle · day · time · zone · service — extracted in one pass</p>
          </div>
        )}
      </div>
    </section>
  );
}
