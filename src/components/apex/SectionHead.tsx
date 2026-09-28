import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Editorial section opener: route code, kicker, display title, supporting copy. */
export function SectionHead({ code, kicker, title, body, aside }: { code: string; kicker: string; title: ReactNode; body?: ReactNode; aside?: ReactNode }) {
  return (
    <motion.header
      className="mb-10 grid gap-6 border-t border-line pt-6 lg:mb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      <div>
        <div className="label mb-4 flex items-center gap-3">
          <span className="!text-acid">{code}</span>
          <span className="h-px w-10 bg-line-strong" />
          {kicker}
        </div>
        <h2 className="display text-[clamp(48px,7.4vw,120px)] text-bone">{title}</h2>
      </div>
      <div className="text-[15px] leading-relaxed text-silver lg:pb-3">
        {body}
        {aside}
      </div>
    </motion.header>
  );
}
