"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const t = reduce
    ? { duration: 0.12 }
    : { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(4px)" }}
        transition={t}
        className="will-change-[opacity,transform,filter] motion-reduce:transform-none motion-reduce:filter-none"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
