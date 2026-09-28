import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

/** Number that rolls to its new value like an odometer. */
export function Ticker({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className="num">{text}</motion.span>;
}
