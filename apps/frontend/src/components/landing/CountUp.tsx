// src/components/landing/CountUp.tsx

import { useEffect, useRef, useState } from "react";

export interface CountUpProps {
  /** Target number to count up to. */
  end: number;
  /** Animation duration in ms. Default 2000. */
  duration?: number;
  /** Text appended after the number (e.g. "+", "%"). */
  suffix?: string;
  /** Text prepended before the number (e.g. "+", "$"). */
  prefix?: string;
  /** Number of decimal places. Default 0. */
  decimals?: number;
  /** ClassName passed to the wrapping span. */
  className?: string;
  /** If false, animation won't start until element is on screen. Default true. */
  startOnView?: boolean;
}

/**
 * Animated number counter. Counts from 0 → `end` over `duration` ms.
 * Triggers on mount, or on viewport entry if `startOnView` is true.
 * Uses requestAnimationFrame. No external libraries.
 */
export default function CountUp({
  end,
  duration = 2000,
  suffix = "",
  prefix = "",
  decimals = 0,
  className,
  startOnView = true,
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const [hasStarted, setHasStarted] = useState(!startOnView);
  const ref = useRef<HTMLSpanElement | null>(null);

  // Trigger on view
  useEffect(() => {
    if (!startOnView || hasStarted) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setHasStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasStarted(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [startOnView, hasStarted]);

  // Animate
  useEffect(() => {
    if (!hasStarted) return;
    let raf = 0;
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setValue(end * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setValue(end);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasStarted, end, duration]);

  const formatted = value.toLocaleString("es-EC", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
