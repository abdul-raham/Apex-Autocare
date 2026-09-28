import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { AutomationPulse } from '../components/apex/AutomationPulse';
import { AutomotiveFooter } from '../components/apex/AutomotiveFooter';
import { BookingTimelineEngine } from '../components/apex/BookingTimelineEngine';
import { InquirySimulator } from '../components/apex/InquirySimulator';
import { LocationRadar } from '../components/apex/LocationRadar';
import { ServiceComposer } from '../components/apex/ServiceComposer';
import { image } from '../data/apex';
import { useApexPass } from '../motion/ApexPass';
import { useBoardData, useNow } from '../store/boardStore';

const cables = image('lagos-bridge-cables', 'Cable-stay pylon of the Lekki–Ikoyi Link Bridge in black and white');

function Stage({ code, title, body, children }: { code: string; title: string; body: string; children: ReactNode }) {
  return (
    <section className="grid gap-8 border-t border-line py-16 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14 lg:py-24">
      <motion.div
        className="lg:sticky lg:top-28 lg:self-start"
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="label mb-3 !text-acid">{code}</div>
        <h2 className="display text-[clamp(40px,4.6vw,68px)] text-bone">{title}</h2>
        <p className="mt-4 text-silver">{body}</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        {children}
      </motion.div>
    </section>
  );
}

export default function Process() {
  const { go } = useApexPass();
  const { bookings, events, status } = useBoardData();
  const now = useNow(60_000);
  // Follow-through shown from the most recently created booking in the live store.
  const latest = [...bookings].sort((a, z) => z.createdAt.localeCompare(a.createdAt))[0];
  const trail = latest ? events.filter((e) => e.bookingId === latest.id) : [];

  return (
    <>
      <header className="relative overflow-hidden pb-10 pt-28 sm:pt-32">
        <img src={cables.src} srcSet={cables.srcSet} sizes="100vw" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.12]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/40 via-ink/70 to-ink" />
        <div className="shell">
          <div className="label mb-4 flex items-center gap-3">
            <span className="!text-acid">02</span>
            <span className="h-px w-10 bg-line-strong" /> Process
          </div>
          <h1 className="display text-[clamp(56px,9vw,150px)] text-bone">
            Inbound to
            <br />
            handover<span className="text-acid">.</span>
          </h1>
          <p className="mt-6 max-w-[58ch] text-[17px] text-silver">
            How APEX turns “can you detail my car?” into a job a crew can actually complete — travel, setup, detail, inspection and follow-through — without the owner touching it.
          </p>
        </div>
      </header>

      <div className="shell">
        <Stage code="01 · Inbound" title="The message becomes data." body="Vehicle, day, time, zone and service are read straight out of a WhatsApp or Instagram DM. Missing details are asked in the flow, not in a chat thread.">
          <InquirySimulator showHandoff={false} />
        </Stage>
        <Stage code="02 · Quote" title="Price is computed." body="Base service scaled to the vehicle's paint surface, plus each module and any zone surcharge. The same numbers everywhere, from rate card to receipt.">
          <ServiceComposer variant="teaser" onConfigure={() => go('/book')} />
        </Stage>
        <Stage code="03 · Travel" title="Distance is time." body="Each zone carries a real drive time from base, with a rush-hour multiplier for the bridges and the Lekki–Epe expressway. Out-of-range addresses are declined honestly.">
          <LocationRadar variant="teaser" />
        </Stage>
        <Stage code="04 · Feasibility" title="Whole job or no slot." body="A window is only offered if one of three units can drive out, set up, detail, inspect, drive back and restock without touching another job — inside 07:00–19:30.">
          <div className="border border-line bg-panel p-5 sm:p-8">
            <BookingTimelineEngine demo />
          </div>
        </Stage>
        <Stage code="05 · Follow-through" title="Then it runs itself." body="Deposit verified, calendar blocked, confirmation sent, crew briefed, reminders queued, aftercare scheduled. This is the live trail from the most recent booking.">
          <AutomationPulse events={trail} now={now} loading={status !== 'ready'} max={12} title={latest ? `Latest booking · ${latest.code}` : 'Latest booking'} />
        </Stage>
      </div>

      <AutomotiveFooter />
    </>
  );
}
