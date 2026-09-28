import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * ApexPass — the signature route change. The current page compresses, a light
 * streak drives a near-black frame across in the direction of travel (forward =
 * left→right, back = right→left), the route label flashes with tail-light streaks,
 * then the frame exits the same way and the next route rolls in.
 */

interface RouteMeta {
  index: number;
  code: string;
  label: string;
}

export function routeMeta(pathname: string): RouteMeta {
  if (pathname.startsWith('/services')) return { index: 1, code: '01', label: 'Services' };
  if (pathname.startsWith('/process')) return { index: 1, code: '02', label: 'Process' };
  if (pathname.startsWith('/book')) return { index: 2, code: '04', label: 'Book' };
  if (pathname.startsWith('/manage')) return { index: 3, code: '05', label: 'Manage' };
  if (pathname.startsWith('/operations')) return { index: 4, code: 'OPS', label: 'Operations' };
  return { index: 0, code: '00', label: 'Arrival' };
}

type Phase = 'idle' | 'cover' | 'reveal';

interface PassState {
  phase: Phase;
  dir: 1 | -1;
  meta: RouteMeta;
}

interface PassContext {
  phase: Phase;
  dir: 1 | -1;
  /** Navigate with the ApexPass transition. Supports "/path#section". */
  go: (to: string) => void;
  /** Navigate without the pass (another transition already covered the screen). */
  jump: (to: string, state?: unknown) => void;
}

const Ctx = createContext<PassContext | null>(null);

export function useApexPass() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApexPass must be used inside <ApexPassProvider>');
  return ctx;
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top, behavior: 'smooth' });
}

const COVER_S = 0.42;
const REVEAL_S = 0.5;
const EASE = [0.76, 0, 0.24, 1] as const;

export function ApexPassProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const [state, setState] = useState<PassState>({ phase: 'idle', dir: 1, meta: routeMeta(location.pathname) });
  const pending = useRef<{ to: string; hash?: string } | null>(null);
  const internal = useRef(false);
  const lastPath = useRef(location.pathname);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = state.phase;

  const afterNavigate = useCallback((hash?: string) => {
    if (hash) setTimeout(() => scrollToSection(hash), 60);
    else window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const go = useCallback(
    (to: string) => {
      const [path, hash] = to.split('#');
      const target = path || location.pathname;
      if (target === location.pathname) {
        if (hash) scrollToSection(hash);
        else window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (phaseRef.current !== 'idle') return;
      const from = routeMeta(location.pathname);
      const dest = routeMeta(target);
      const dir: 1 | -1 = dest.index >= from.index ? 1 : -1;
      if (reduce) {
        internal.current = true;
        navigate(to);
        afterNavigate(hash);
        return;
      }
      pending.current = { to, hash };
      setState({ phase: 'cover', dir, meta: dest });
    },
    [location.pathname, navigate, reduce, afterNavigate],
  );

  const jump = useCallback(
    (to: string, navState?: unknown) => {
      internal.current = true;
      navigate(to, { state: navState });
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [navigate],
  );

  const onFrameDone = useCallback(() => {
    if (phaseRef.current === 'cover' && pending.current) {
      const { to, hash } = pending.current;
      pending.current = null;
      internal.current = true;
      navigate(to);
      afterNavigate(hash);
      setState((s) => ({ ...s, phase: 'reveal' }));
    } else if (phaseRef.current === 'reveal') {
      setState((s) => ({ ...s, phase: 'idle' }));
    }
  }, [navigate, afterNavigate]);

  // Browser back/forward and plain links still get the reveal half of the pass.
  useEffect(() => {
    // Compare against the last path rather than a first-render flag: StrictMode
    // mounts effects twice in development, which must never trigger a pass.
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    if (internal.current) {
      internal.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (!reduce) setState({ phase: 'reveal', dir: -1, meta: routeMeta(location.pathname) });
  }, [location.pathname, reduce]);

  const value = useMemo(() => ({ phase: state.phase, dir: state.dir, go, jump }), [state.phase, state.dir, go, jump]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <PassFrame state={state} onDone={onFrameDone} />
    </Ctx.Provider>
  );
}

function PassFrame({ state, onDone }: { state: PassState; onDone: () => void }) {
  const { phase, dir, meta } = state;
  const hiddenStart = dir > 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
  const hiddenEnd = dir > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';
  const edgeFrom = dir > 0 ? '0%' : '100%';
  const edgeTo = dir > 0 ? '100%' : '0%';

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div key="apex-pass" className="pointer-events-auto fixed inset-0 z-[150]" aria-hidden exit={{ opacity: 0, transition: { duration: 0.1 } }}>
          <motion.div
            className="absolute inset-0 overflow-hidden bg-ink"
            initial={{ clipPath: phase === 'reveal' ? 'inset(0 0 0 0)' : hiddenStart }}
            animate={{ clipPath: phase === 'cover' ? 'inset(0 0 0 0)' : hiddenEnd }}
            transition={{ duration: phase === 'cover' ? COVER_S : REVEAL_S, ease: EASE }}
            onAnimationComplete={onDone}
          >
            {/* tail-light streaks */}
            {[0.34, 0.41, 0.63, 0.7].map((top, i) => (
              <motion.span
                key={top}
                className="absolute h-px w-[45vw]"
                style={{
                  top: `${top * 100}%`,
                  background: `linear-gradient(${dir > 0 ? 270 : 90}deg, rgb(255 77 61 / ${i % 2 ? 0.35 : 0.8}), transparent)`,
                  filter: 'blur(0.6px)',
                  boxShadow: '0 0 12px rgb(255 77 61 / 0.6)',
                }}
                initial={{ x: dir > 0 ? '110vw' : '-50vw' }}
                animate={{ x: dir > 0 ? '-50vw' : '110vw' }}
                transition={{ duration: 0.75, delay: i * 0.04, ease: 'linear' }}
              />
            ))}
            <div className="absolute inset-0 grid place-items-center">
              <motion.div
                className="text-center"
                initial={{ opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="label mb-3 text-acid">
                  {dir > 0 ? '→' : '←'} ROUTE {meta.code}
                </div>
                <div className="display text-[clamp(56px,11vw,168px)] text-bone">{meta.label}</div>
                <div className="label mt-4">APEX° · LEKKI RUN</div>
              </motion.div>
            </div>
          </motion.div>
          {/* the light streak rides the leading edge of the frame */}
          <motion.div
            className="absolute inset-y-0 w-px"
            style={{ background: 'var(--color-bone)', boxShadow: '0 0 24px 4px rgb(236 232 222 / 0.55), 0 0 80px 12px rgb(201 255 61 / 0.2)' }}
            initial={{ left: edgeFrom, opacity: 1 }}
            animate={{ left: edgeTo, opacity: [1, 1, 0.2] }}
            transition={{ duration: phase === 'cover' ? COVER_S : REVEAL_S, ease: EASE }}
          />
          <motion.div
            className="absolute inset-y-[38%] w-[34vw]"
            style={{
              background: `linear-gradient(${dir > 0 ? 90 : 270}deg, transparent, rgb(236 232 222 / 0.22))`,
              filter: 'blur(18px)',
              translateX: dir > 0 ? '-100%' : '0%',
            }}
            initial={{ left: edgeFrom }}
            animate={{ left: edgeTo }}
            transition={{ duration: phase === 'cover' ? COVER_S : REVEAL_S, ease: EASE }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Anchor that routes through ApexPass; modified clicks still open normally. */
export function ApexLink({ to, children, onClick, ref, ...rest }: { to: string; ref?: Ref<HTMLAnchorElement> } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { go } = useApexPass();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(to);
  };
  return (
    <a ref={ref} href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/** Wraps the routed page: compresses during the cover, rolls in on reveal. */
export function PassStage({ children }: { children: ReactNode }) {
  const { phase, dir } = useApexPass();
  const location = useLocation();
  return (
    <motion.div
      key={location.pathname}
      initial={phase === 'reveal' ? { x: dir * 28, opacity: 0.6 } : false}
      animate={phase === 'cover' ? { scale: 0.985, opacity: 0.55, x: 0 } : { scale: 1, opacity: 1, x: 0 }}
      transition={{ duration: phase === 'cover' ? COVER_S : 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: '50% 30vh' }}
    >
      {children}
    </motion.div>
  );
}
