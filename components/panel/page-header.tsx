"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Extra help (e.g. InPlainEnglish) — renders below the subtitle */
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const words = title.split(/\s+/).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 text-pretty md:mb-8"
    >
      <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
        <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
          {words.map((word, i) => (
            <motion.span
              key={`${i}-${word}`}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: reduce ? 0 : 0.035 + i * 0.05,
                duration: 0.38,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-transparent dark:from-teal-100 dark:via-cyan-200 dark:to-amber-200"
            >
              {word}
            </motion.span>
          ))}
        </span>
      </h1>
      {description != null && description !== "" ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.12, duration: 0.35 }}
          className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-sm"
        >
          {description}
        </motion.div>
      ) : null}
      {children ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.18, duration: 0.35 }}
          className="mt-4 max-w-3xl"
        >
          {children}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
