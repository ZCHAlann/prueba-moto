// src/hooks/useScrollReveal.ts

import { useEffect, useRef, useState } from "react";

export interface UseScrollRevealOptions {
  /** Fraction of element that must be in view to trigger (0..1). Default 0.15 */
  threshold?: number;
  /** If true, observer disconnects after first reveal. Default true */
  once?: boolean;
  /** Extra margin for the root (CSS shorthand). Default "0px 0px -10% 0px" */
  rootMargin?: string;
}

export interface UseScrollRevealResult<T extends Element = HTMLDivElement> {
  ref: React.RefObject<T>;
  isVisible: boolean;
}

/**
 * Reveal-on-scroll hook powered by IntersectionObserver.
 *
 * Usage:
 *   const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold: 0.2 });
 *   <div ref={ref} className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} />
 */
export function useScrollReveal<T extends Element = HTMLDivElement>(
  options: UseScrollRevealOptions = {}
): UseScrollRevealResult<T> {
  const { threshold = 0.15, once = true, rootMargin = "0px 0px -10% 0px" } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      // Fallback for very old environments — just reveal immediately.
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setIsVisible(false);
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, isVisible };
}
