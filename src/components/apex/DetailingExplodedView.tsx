import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ANATOMY, type ZoneRegion } from '../../data/apex';
import { addonById, naira, serviceById } from '../../lib/catalog';
import { useBooking } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';
import { VehicleStage } from './VehicleStage';

/**
 * Interactive anatomy. Hover or tap a hotspot: the rest of the car drops into
 * shadow, the region's treatment spec flies out, and the relevant service or
 * module can be mounted straight into the booking.
 */
export function DetailingExplodedView() {
  const [active, setActive] = useState<ZoneRegion>('exterior');
  const serviceId = useBooking((s) => s.draft.serviceId);
  const addonIds = useBooking((s) => s.draft.addonIds);
  const setService = useBooking((s) => s.setService);
  const toggleAddon = useBooking((s) => s.toggleAddon);
  const region = ANATOMY.find((r) => r.id === active)!;

  const suggestion =
    region.suggest.kind === 'service'
      ? { name: serviceById(region.suggest.id).name, added: serviceId === region.suggest.id, meta: 'Base service' }
      : { name: addonById(region.suggest.id)!.name, added: addonIds.includes(region.suggest.id), meta: `+${naira(addonById(region.suggest.id)!.price)} · +${addonById(region.suggest.id)!.minutes}m` };

  const add = () => {
    if (suggestion.added) return;
    if (region.suggest.kind === 'service') setService(region.suggest.id);
    else toggleAddon(region.suggest.id);
    telemetry(`${suggestion.name} added to your detail`, { tone: 'ok', channel: 'QUOTE' });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
      <div>
        <VehicleStage
          vehicle="suv"
          hotspots={ANATOMY.map((r) => ({ id: r.id, label: r.label, at: r.at }))}
          activeHotspot={active}
          onHotspot={(id) => setActive(id as ZoneRegion)}
          spotlight={region.at}
          sizes="(max-width: 1024px) 100vw, 60vw"
          telemetry={[{ label: 'Isolated', value: region.label.toUpperCase(), corner: 'tl' }]}
        />
        <div className="mt-3 flex flex-wrap gap-1.5 lg:hidden" role="group" aria-label="Regions">
          {ANATOMY.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={active === r.id}
              onClick={() => setActive(r.id)}
              className={`label border px-2.5 py-1.5 ${active === r.id ? 'border-acid !text-acid' : 'border-line'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="min-h-[420px]">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            <div className="label mb-2">Region {String(ANATOMY.indexOf(region) + 1).padStart(2, '0')} / 05</div>
            <h3 className="display text-[clamp(44px,5.4vw,80px)] text-bone">{region.label}</h3>
            <div className="relative mt-5 aspect-[16/9] overflow-hidden rounded-[3px]">
              <img
                src={region.image.src}
                srcSet={region.image.srcSet}
                sizes="(max-width: 1024px) 100vw, 40vw"
                alt={region.image.alt}
                loading="lazy"
                data-active="true"
                className="photo-editorial h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
            </div>
            <ul className="mt-5 grid gap-2">
              {region.treats.map((t, i) => (
                <motion.li
                  key={t}
                  className="flex items-start gap-3 border-b border-line pb-2 text-[14px] text-silver"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.07 }}
                >
                  <span className="mono mt-0.5 text-[11px] text-acid">{String(i + 1).padStart(2, '0')}</span>
                  {t}
                </motion.li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="label !text-[9.5px]">Recommended</div>
                <div className="text-[15px] text-bone">
                  {suggestion.name} <span className="mono ml-1 text-[12px] text-muted">{suggestion.meta}</span>
                </div>
              </div>
              <button type="button" className={`btn btn-sm ${suggestion.added ? 'btn-ghost' : 'btn-primary'}`} onClick={add} disabled={suggestion.added}>
                {suggestion.added ? '✓ In your detail' : 'Add to detail +'}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
