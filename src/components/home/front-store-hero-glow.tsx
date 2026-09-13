"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const glowFrames = {
  borderColor: ["#ff5bad", "#fffaff", "#ff5bad"],
  boxShadow: [
    "0 0 9px 1px rgba(255, 65, 167, 0.85), 0 0 24px 4px rgba(255, 65, 167, 0.55)",
    "0 0 10px 1px rgba(255, 255, 255, 0.95), 0 0 28px 5px rgba(255, 235, 249, 0.68)",
    "0 0 9px 1px rgba(255, 65, 167, 0.85), 0 0 24px 4px rgba(255, 65, 167, 0.55)",
  ],
};

export default function FrontStoreHeroGlow() {
  const prefersReducedMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const shouldAnimate = hasMounted && prefersReducedMotion === false;

  return (
    <motion.div
      aria-hidden="true"
      className="front-store-hero-glow"
      initial={false}
      animate={shouldAnimate ? glowFrames : undefined}
      transition={
        shouldAnimate
          ? { duration: 3.2, ease: "easeInOut", repeat: Infinity }
          : undefined
      }
    />
  );
}
