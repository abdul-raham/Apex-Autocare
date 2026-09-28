import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BRAND, UNITS } from '../../data/apex';
import { ApexLink, useApexPass } from '../../motion/ApexPass';
import { useIntroReady } from '../../motion/IgnitionIntro';

export interface RailStation {
  id: string;
  code: string;
  label: string;
  /** Route (with optional #section) this station travels to. */
  to: string;
  /** Section id on the home page used for scroll tracking. */
  sectionId?: string;
}

export const DEFAULT_STATIONS: RailStation[] = [
  { id: 'detail', code: '01', label: 'Detail', to: '/#detail', sectionId: 'detail' },
  { id: 'process', code: '02', label: 'Process', to: '/#process', sectionId: 'process' },
  { id: 'coverage', code: '03', label: 'Coverage', to: '/#coverage', sectionId: 'coverage' },
  { id: 'book', code: '04', label: 'Book', to: '/book', sectionId: 'book' },
];

export interface RouteRailNavProps {
  stations?: RailStation[];
  unitsActive?: number;
}

/**
 * Journey progress in "station units": −1 before the first station, 0…n−1 on
 * stations, fractional in between. Home tracks scroll continuously; other routes
 * sit on their station.
 */
function useJourney(stations: RailStation[]) {
  const { pathname } = useLocation();
  const [progress, setProgress] = useState(-1);

  useEffect(() => {
    if (pathname !== '/') {
      const fixed = pathname.startsWith('/process') ? 1 : pathname.startsWith('/book') || pathname.startsWith('/manage') ? 3 : pathname.startsWith('/operations') ? 3.6 : -1;
      setProgress(fixed);
      return;
    }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const anchor = window.scrollY + window.innerHeight * 0.45;
      const tops = stations.map((s) => {
        const el = s.sectionId ? document.getElementById(s.sectionId) : null;
        return el ? el.getBoundingClientRect().top + window.scrollY : Infinity;
      });
      let p = -1;
      if (anchor < tops[0]) p = -1 + Math.max(0, anchor / Math.max(1, tops[0]));
      else {
        p = stations.length - 1;
        for (let i = 0; i < tops.length - 1; i++) {
          if (anchor >= tops[i] && anchor < tops[i + 1]) {
            p = i + (anchor - tops[i]) / Math.max(1, tops[i + 1] - tops[i]);
            break;
          }
        }
      }
      setProgress(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    const late = setTimeout(measure, 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pathname, stations]);

  const active = progress < -0.5 || progress > stations.length - 0.4 ? -1 : Math.round(Math.min(stations.length - 1, Math.max(0, progress)));
  return { progress, active };
}

const stationPct = (i: number, n: number) => ((i + 0.5) / n) * 100;

function progressToPct(p: number, n: number) {
  if (p <= -1) return 0;
  if (p < 0) return (p + 1) * stationPct(0, n);
  if (p >= n - 1) return Math.min(100, stationPct(n - 1, n) + (p - (n - 1)) * (100 / n));
  return stationPct(0, n) + p * (100 / n);
}

export function RouteRailNav({ stations = DEFAULT_STATIONS, unitsActive = UNITS.length }: RouteRailNavProps) {
  const { go } = useApexPass();
  const { progress, active } = useJourney(stations);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const ready = useIntroReady();
  const pct = useSpring(0, reduce ? { duration: 0 } : { stiffness: 120, damping: 22, mass: 0.6 });
  const left = useTransform(pct, (v) => `${v}%`);
  const trail = useTransform(pct, (v) => `${v}%`);

  useEffect(() => {
    pct.set(progressToPct(progress, stations.length));
  }, [progress, stations.length, pct]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:bg-acid focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="pointer-events-none fixed inset-x-0 top-3 z-[100] px-3 sm:top-4 sm:px-4">
        <motion.nav
          initial={reduce ? false : { y: -24, opacity: 0 }}
          animate={ready ? { y: 0, opacity: 1 } : { y: -24, opacity: 0 }}
          transition={{ duration: 0.9, delay: ready ? 0.45 : 0, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Journey"
          className="pointer-events-auto mx-auto flex h-14 max-w-[1360px] items-center gap-4 rounded-[4px] border border-line bg-ink/75 pl-4 pr-2 backdrop-blur-md lg:gap-6"
        >
          <ApexLink to="/" className="display-wide shrink-0 text-[17px] tracking-[0.06em] text-bone" aria-label="APEX AutoCare home">
            APEX<span className="text-acid">°</span>
          </ApexLink>

          {/* Desktop route rail */}
          <div className="relative hidden h-full flex-1 items-center md:flex">
            <div className="absolute inset-x-0 top-[72%] h-px bg-line-strong" aria-hidden />
            <motion.div className="absolute left-0 top-[72%] h-px bg-gradient-to-r from-transparent to-acid/70" style={{ width: trail }} aria-hidden />
            <motion.div className="absolute top-[72%] z-10 -translate-x-1/2 -translate-y-1/2" style={{ left }} aria-hidden>
              <span className="block h-2.5 w-2.5 rotate-45 border border-acid bg-ink shadow-[0_0_12px_rgba(201,255,61,.7)]" />
              <span className="absolute left-1/2 top-1/2 h-[3px] w-10 -translate-y-1/2 bg-gradient-to-r from-acid/60 to-transparent blur-[2px]" />
            </motion.div>
            <ol className="relative grid h-full w-full" style={{ gridTemplateColumns: `repeat(${stations.length}, 1fr)` }}>
              {stations.map((s, i) => (
                <li key={s.id} className="relative flex justify-center">
                  <ApexLink
                    to={s.to}
                    aria-current={active === i ? 'step' : undefined}
                    className={`label mt-[9px] h-fit px-2 py-1 transition-colors hover:text-bone ${active === i ? '!text-bone' : ''}`}
                  >
                    <span className={active === i ? 'text-acid' : ''}>{s.code}</span> {s.label}
                  </ApexLink>
                  <span className={`absolute left-1/2 top-[72%] h-[7px] w-px -translate-y-1/2 ${i <= progress ? 'bg-acid/80' : 'bg-line-strong'}`} aria-hidden />
                </li>
              ))}
            </ol>
          </div>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <span className="label hidden items-center gap-2 lg:inline-flex" title="Mobile units dispatching today">
              <span className="dot-live" /> Mobile units: <span className="text-bone">{unitsActive} active</span>
            </span>
            <button type="button" className="btn btn-primary btn-sm hidden sm:inline-flex" onClick={() => go('/book')}>
              Start booking <span className="arrow">↗</span>
            </button>
            <button type="button" className="btn btn-primary btn-sm sm:hidden" onClick={() => go('/book')}>
              Book ↗
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-[3px] border border-line-strong md:hidden"
              aria-expanded={open}
              aria-controls="route-drawer"
              aria-label={open ? 'Close route menu' : 'Open route menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="relative block h-3 w-4">
                <span className={`absolute left-0 h-px w-4 bg-bone transition-transform ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
                <span className={`absolute left-0 h-px w-4 bg-bone transition-transform ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
              </span>
            </button>
          </div>
        </motion.nav>
      </header>

      <RouteDrawer open={open} onClose={() => setOpen(false)} stations={stations} active={active} unitsActive={unitsActive} />
    </>
  );
}

function RouteDrawer({
  open,
  onClose,
  stations,
  active,
  unitsActive,
}: {
  open: boolean;
  onClose: () => void;
  stations: RailStation[];
  active: number;
  unitsActive: number;
}) {
  const { go } = useApexPass();
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="route-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Route"
          className="fixed inset-0 z-[99] bg-ink/95 px-6 pb-8 pt-24 backdrop-blur-md md:hidden"
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          exit={{ clipPath: 'inset(0 0 100% 0)' }}
          transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="label mb-8 flex items-center gap-2">
            <span className="dot-live" /> {unitsActive} mobile units active · {BRAND.coordinates}
          </div>
          <ol className="relative border-l border-line-strong pl-8">
            {stations.map((s, i) => (
              <motion.li
                key={s.id}
                className="relative py-4"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <span
                  className={`absolute -left-[37px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border ${active === i ? 'border-acid bg-acid' : 'border-line-strong bg-ink'}`}
                  aria-hidden
                />
                <ApexLink ref={i === 0 ? first : undefined} to={s.to} onClick={onClose} className="flex items-baseline gap-4">
                  <span className="label text-acid">{s.code}</span>
                  <span className="display text-[56px] text-bone">{s.label}</span>
                </ApexLink>
              </motion.li>
            ))}
          </ol>
          <div className="mt-10 grid gap-3">
            <button type="button" className="btn btn-primary w-full" onClick={() => go('/book')}>
              Start booking <span className="arrow">↗</span>
            </button>
            <ApexLink to="/operations" onClick={onClose} className="btn btn-ghost w-full">
              Owner view
            </ApexLink>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
