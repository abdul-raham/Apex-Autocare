import { motion } from 'framer-motion';
import { ArrivalHero } from '../components/apex/ArrivalHero';
import { AutomotiveFooter } from '../components/apex/AutomotiveFooter';
import { BookingTimelineEngine } from '../components/apex/BookingTimelineEngine';
import { DetailingExplodedView } from '../components/apex/DetailingExplodedView';
import { LocationRadar } from '../components/apex/LocationRadar';
import { SectionHead } from '../components/apex/SectionHead';
import { OPS, UNITS, ZONES } from '../data/apex';
import { hhmm } from '../lib/time';
import { ApexLink, useApexPass } from '../motion/ApexPass';
import { useIntroReady } from '../motion/IgnitionIntro';

function ServiceAreaStrip() {
  const items = [
    ...ZONES.filter((z) => z.serviced).map((z) => z.name.split(' / ')[0]),
    `${UNITS.length} mobile units`,
    `Dispatch ${hhmm(OPS.dispatchStart)}–${hhmm(OPS.dispatchEnd)}`,
    'Water + power on board',
  ];
  return (
    <div className="relative overflow-hidden border-y border-line bg-graphite py-4" aria-label="Service area">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
        {[...items, ...items].map((t, i) => (
          <span key={i} className="label flex items-center gap-10 !text-silver">
            {t}
            <span className="text-acid" aria-hidden>
              ◆
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const ready = useIntroReady();
  const { go } = useApexPass();

  return (
    <>
      {/* remount on ready so the entrance choreography starts as the garage doors open */}
      <ArrivalHero key={ready ? 'live' : 'held'} entranceDelay={ready ? 0.2 : 600} />
      <ServiceAreaStrip />

      <section id="detail" className="shell scroll-mt-24 pt-20 lg:pt-28">
        <SectionHead
          code="01"
          kicker="Detail"
          title={
            <>
              Every panel.
              <br />
              Isolated<span className="text-acid">.</span>
            </>
          }
          body={
            <>
              Hover the car. Each region shows exactly what the crew treats — then drops the right service straight into your booking.{' '}
              <ApexLink to="/services" className="text-bone underline underline-offset-4 hover:text-acid">
                All services & pricing →
              </ApexLink>
            </>
          }
        />
        <DetailingExplodedView />
      </section>

      <section id="process" className="shell scroll-mt-24 pt-20 lg:pt-28">
        <SectionHead
          code="02"
          kicker="Process"
          title={
            <>
              Real windows,
              <br />
              not wishful ones<span className="text-acid">.</span>
            </>
          }
          body={
            <>
              Every slot we offer is a crew's full commitment: drive out, set up, detail, inspect, drive back. Rush-hour traffic on the bridges is priced in. If the whole job can't fit on a unit, the window simply isn't offered.{' '}
              <ApexLink to="/process" className="text-bone underline underline-offset-4 hover:text-acid">
                See the full process →
              </ApexLink>
            </>
          }
        />
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="border border-line bg-panel p-5 sm:p-8">
          <BookingTimelineEngine demo />
        </motion.div>
      </section>

      <section id="coverage" className="scroll-mt-24 pt-20 lg:pt-28">
        <div className="shell">
          <SectionHead
            code="03"
            kicker="Coverage"
            title={
              <>
                We come
                <br />
                to you<span className="text-acid">.</span>
              </>
            }
            body="Lekki, Ikate, Osapa, Chevron, Ajah and Sangotedo — plus VI and Ikoyi across the Link Bridge. Pick your zone to see travel time, rush-hour penalty and any surcharge."
          />
        </div>
        <div className="shell">
          <LocationRadar variant="teaser" />
        </div>
      </section>

      <section id="book" className="shell scroll-mt-24 pt-20 lg:pt-28">
        <SectionHead
          code="04"
          kicker="Book"
          title={
            <>
              From DM
              <br />
              to confirmed<span className="text-acid">.</span>
            </>
          }
          body="Most bookings start as a WhatsApp message. APEX turns it into a quoted, scheduled, deposit-secured job — and the owner never lifts the phone."
        />
        <div className="grid gap-px border border-line bg-line md:grid-cols-2">
          <button type="button" onClick={() => go('/book')} className="group bg-ink p-8 text-left transition-colors hover:bg-panel sm:p-10">
            <div className="label mb-6">Option A</div>
            <div className="display text-[clamp(36px,4.4vw,64px)] text-bone">Build my detail →</div>
            <p className="mt-4 max-w-[40ch] text-silver">Vehicle, service, location, time, deposit. About two minutes.</p>
          </button>
          <button type="button" onClick={() => go('/book?intro=1')} className="group bg-ink p-8 text-left transition-colors hover:bg-panel sm:p-10">
            <div className="label mb-6">Option B</div>
            <div className="display text-[clamp(36px,4.4vw,64px)] text-bone">Paste a message →</div>
            <p className="mt-4 max-w-[40ch] text-silver">“Can you detail my Range Rover tomorrow?” — watch it become a booking.</p>
          </button>
        </div>
      </section>

      <AutomotiveFooter />
    </>
  );
}
