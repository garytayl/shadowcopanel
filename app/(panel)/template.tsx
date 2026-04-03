"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const t = reduce
    ? { duration: 0.12 }
    : { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={
          reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985, filter: "blur(8px)" }
        }
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.99, filter: "blur(5px)" }}
        transition={t}
        className="will-change-[opacity,transform,filter] motion-reduce:transform-none motion-reduce:filter-none"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
