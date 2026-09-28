import { motion } from 'framer-motion';
import { AutomotiveFooter } from '../components/apex/AutomotiveFooter';
import { SectionHead } from '../components/apex/SectionHead';
import { ServiceComposer } from '../components/apex/ServiceComposer';
import { VehicleMorphSelector } from '../components/apex/VehicleMorphSelector';
import { ADDONS, OPS, SERVICES, VEHICLE_CLASSES, image } from '../data/apex';
import { naira } from '../lib/catalog';
import { duration } from '../lib/time';
import { useApexPass } from '../motion/ApexPass';
import { useBooking } from '../store/bookingStore';

const SERVICE_IMAGES: Record<string, ReturnType<typeof image>> = {
  'signature-reset': image('detail-foam', 'Dark car covered in snow foam during a pre-wash'),
  'interior-recovery': image('detail-interior', 'Quilted tan leather seat after deep cleaning'),
  'exterior-correction': image('detail-polish', 'Detailer machine-polishing a wheel arch'),
  'ceramic-shield': image('detail-headlights', 'Glossy dark paint and LED headlight after coating'),
};

export default function Services() {
  const { go } = useApexPass();
  const classId = useBooking((s) => s.draft.classId);

  return (
    <>
      <div className="shell pt-28 sm:pt-32">
        <div className="label mb-4 flex items-center gap-3">
          <span className="!text-acid">01</span>
          <span className="h-px w-10 bg-line-strong" /> Services & pricing
        </div>
        <h1 className="display text-[clamp(56px,9vw,150px)] text-bone">
          The work<span className="text-acid">.</span>
        </h1>
        <p className="mt-6 max-w-[56ch] text-[17px] text-silver">
          Four base services, five modules, priced by the size of your car. Every number below is the same one you'll be quoted at checkout.
        </p>

        {/* service features */}
        <div className="mt-16 grid gap-px border border-line bg-line md:grid-cols-2">
          {SERVICES.map((s, i) => {
            const img = SERVICE_IMAGES[s.id];
            return (
              <motion.article
                key={s.id}
                className="group relative bg-ink"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-10% 0px' }}
                transition={{ duration: 0.7, delay: (i % 2) * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  <img src={img.src} srcSet={img.srcSet} sizes="(max-width: 768px) 100vw, 50vw" alt={img.alt} loading="lazy" className="photo-editorial h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
                  <span className="label absolute left-5 top-5">{String(i + 1).padStart(2, '0')}{s.tag ? ` · ${s.tag}` : ''}</span>
                </div>
                <div className="p-6 sm:p-8">
                  <h2 className="display text-[clamp(36px,4vw,56px)] text-bone">{s.name}</h2>
                  <p className="mt-3 max-w-[48ch] text-silver">{s.description}</p>
                  <div className="mono mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
                    <span>
                      from <span className="text-bone">{naira(s.basePrice)}</span>
                    </span>
                    <span>
                      from <span className="text-bone">{duration(90 + s.extraMinutes)}</span> on the car
                    </span>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>

      <section className="shell pt-24 lg:pt-32">
        <SectionHead
          code="01·B"
          kicker="Build it"
          title={
            <>
              Your car,
              <br />
              your price<span className="text-acid">.</span>
            </>
          }
          body="Switch the vehicle and watch every price and duration re-scale. Mount modules to see exactly what they add."
        />
        <VehicleMorphSelector showStage={false} showModelInput={false} />
        <div className="mt-12">
          <ServiceComposer />
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button type="button" className="btn btn-primary" onClick={() => go('/book')}>
            Book this detail <span className="arrow">→</span>
          </button>
          <span className="label">Selections carry straight into booking</span>
        </div>
      </section>

      <section className="shell pt-24 lg:pt-32" aria-labelledby="rate-card">
        <div className="label mb-4" id="rate-card">
          Rate card · Naira · before travel surcharge
        </div>
        <div className="overflow-x-auto border border-line scrollbar-none">
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="label p-4 font-normal">Service</th>
                {VEHICLE_CLASSES.map((v) => (
                  <th key={v.id} className={`label p-4 text-right font-normal ${v.id === classId ? '!text-acid' : ''}`}>
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((s) => (
                <tr key={s.id} className="border-b border-line">
                  <td className="p-4 text-bone">{s.name}</td>
                  {VEHICLE_CLASSES.map((v) => (
                    <td key={v.id} className={`mono p-4 text-right ${v.id === classId ? 'text-acid' : 'text-silver'}`}>
                      {naira(Math.round((s.basePrice * v.priceMultiplier) / OPS.priceRounding) * OPS.priceRounding)}
                      <span className="block text-[11px] text-muted">{duration(v.baseMinutes + s.extraMinutes)}</span>
                    </td>
                  ))}
                </tr>
              ))}
              {ADDONS.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-b-0">
                  <td className="p-4 text-silver">+ {a.name}</td>
                  <td colSpan={VEHICLE_CLASSES.length} className="mono p-4 text-right text-silver">
                    {naira(a.price)} · +{a.minutes}m · any vehicle
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AutomotiveFooter />
    </>
  );
}
