"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  /** Extra help (e.g. InPlainEnglish) — renders below the subtitle */
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-6 md:mb-8"
    >
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-4 max-w-3xl">{children}</div> : null}
    </motion.div>
  );
}
