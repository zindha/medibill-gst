import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

/**
 * Counts up to `value` with a smooth spring whenever the value changes.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 22, mass: 1 });
  const display = useTransform(spring, (v) =>
    format ? format(v) : Math.round(v).toLocaleString("en-IN"),
  );

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  return <motion.span className={className}>{display}</motion.span>;
}

export default AnimatedNumber;
