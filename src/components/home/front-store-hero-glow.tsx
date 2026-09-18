"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const glowFrames = {
  borderColor: ["#ff4fae", "#ffffff", "#ff4fae"],
  opacity: [0.92, 1, 0.92],
  boxShadow: [
    "0 0 10px 2px rgba(255, 79, 174, 0.96), 0 0 30px 6px rgba(255, 67, 165, 0.66)",
    "0 0 13px 2px rgba(255, 255, 255, 1), 0 0 36px 8px rgba(255, 238, 249, 0.82)",
    "0 0 10px 2px rgba(255, 79, 174, 0.96), 0 0 30px 6px rgba(255, 67, 165, 0.66)",
  ],
};

export default function FrontStoreHeroGlow() {
  const prefersReducedMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Framer Motion may report `null` briefly (or in environments without a
  // resolved media-query value). Only disable the effect when the user has
  // explicitly requested reduced motion.
  const shouldAnimate = hasMounted && prefersReducedMotion !== true;

  return (
    <motion.div
      aria-hidden="true"
      className="front-store-hero-glow"
      initial={false}
      animate={shouldAnimate ? glowFrames : undefined}
      transition={
        shouldAnimate
          ? {
              duration: 2.8,
              ease: "easeInOut",
              repeat: Infinity,
              times: [0, 0.5, 1],
            }
          : undefined
      }
    />
  );
}
