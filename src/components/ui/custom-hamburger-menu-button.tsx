"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

export type CustomHamburgerMenuItem = {
  href?: string;
  label: string;
  Icon: LucideIcon;
  onSelect?: () => void;
  tone?: "accent" | "default";
};

export type CustomHamburgerMenuButtonProps = {
  items: readonly CustomHamburgerMenuItem[];
  catImageSrc: string;
  catAlt?: string;
  menuLabel?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderAdditionalItems?: (closeMenu: () => void) => ReactNode;
};

function BadmintonShuttleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m8.25 13.25 8.35-8.35" />
      <path d="m6.35 13.8-1.5 4.45a.75.75 0 0 0 .95.95l4.45-1.5" />
      <path d="M10.1 4.7c2.3-.3 4.45.15 6.5 1.35" />
      <path d="M8.6 6.2c2.15-.1 4.2.5 6.15 1.8" />
      <path d="M7.25 8.1c1.85.15 3.55.9 5.1 2.25" />
      <path d="m16.6 4.9 2.15-1.15" />
      <circle cx="17.7" cy="3.35" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function CustomHamburgerMenuButton({
  items,
  catImageSrc,
  catAlt = "",
  menuLabel = "Menu",
  open,
  defaultOpen = false,
  onOpenChange,
  renderAdditionalItems,
}: CustomHamburgerMenuButtonProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const menuId = `custom-hamburger-menu-${useId().replace(/:/g, "")}`;

  const updateOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  const closeMenu = useCallback(() => {
    updateOpen(false);
  }, [updateOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };

    document.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) triggerRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  return (
    <>
      <AnimatePresence>
        {isOpen ? (
          <motion.button
            key="custom-hamburger-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="ปิดเมนูหลัก"
            data-testid="custom-hamburger-menu-backdrop"
            className="fixed inset-0 z-[55] cursor-default border-0 bg-[#09030f]/60 p-0 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={closeMenu}
          />
        ) : null}
      </AnimatePresence>

      <div className="front-store-hamburger-menu-shell">
        <motion.button
          ref={triggerRef}
          type="button"
          aria-label={isOpen ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          data-testid="custom-hamburger-menu"
          className="front-store-hamburger-trigger"
          whileHover={{ y: -2, scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => updateOpen(!isOpen)}
        >
          <span className="front-store-hamburger-trigger-face">
            <span className="front-store-hamburger-trigger-orb" aria-hidden="true" />
            <span className="front-store-hamburger-trigger-topline">
              <span className="front-store-hamburger-cat-frame">
                <Image
                  src={catImageSrc}
                  alt={catAlt}
                  width={56}
                  height={56}
                  sizes="36px"
                  className="front-store-hamburger-cat"
                />
              </span>
              <span className="front-store-hamburger-morph" aria-hidden="true">
                <AnimatePresence mode="wait" initial={false}>
                  {isOpen ? (
                    <motion.span
                      key="close"
                      className="front-store-hamburger-morph-icon"
                      initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
                      animate={{ rotate: 0, scale: 1, opacity: 1 }}
                      exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <X aria-hidden="true" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="badminton"
                      className="front-store-hamburger-morph-icon"
                      initial={{ rotate: 0, scale: 1, opacity: 1 }}
                      animate={{ rotate: 0, scale: 1, opacity: 1 }}
                      exit={{ rotate: 180, scale: 0.6, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                    >
                      <BadmintonShuttleIcon aria-hidden="true" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </span>
            <span className="front-store-hamburger-label">{menuLabel}</span>
          </span>
        </motion.button>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              ref={menuRef}
              key="custom-hamburger-panel"
              id={menuId}
              role="menu"
              aria-label="เมนูหลัก"
              className="front-store-hamburger-panel"
              initial={{ opacity: 0, scale: 0.92, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -8 }}
              transition={{ type: "spring", stiffness: 360, damping: 26 }}
            >
              <div className="front-store-hamburger-panel-inner">
                <div className="front-store-hamburger-panel-heading">
                  <span className="front-store-hamburger-panel-kicker">QUICK ACCESS // 01</span>
                  <span className="front-store-hamburger-panel-title">เมนูหลัก</span>
                </div>
                <div className="front-store-hamburger-grid">
                  {items.map(({ href, label, Icon, onSelect, tone = "default" }) => {
                    const itemClassName = "front-store-hamburger-menu-item";
                    const itemContent = (
                      <>
                        <span className="front-store-hamburger-menu-icon" aria-hidden="true">
                          <Icon />
                        </span>
                        <span>{label}</span>
                      </>
                    );
                    const handleSelect = () => {
                      onSelect?.();
                      closeMenu();
                    };

                    return href ? (
                      <Link
                        href={href}
                        key={`${href}-${label}`}
                        role="menuitem"
                        data-tone={tone}
                        className={itemClassName}
                        onClick={handleSelect}
                      >
                        {itemContent}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        key={`action-${label}`}
                        role="menuitem"
                        data-tone={tone}
                        className={itemClassName}
                        onClick={handleSelect}
                      >
                        {itemContent}
                      </button>
                    );
                  })}
                  {renderAdditionalItems?.(closeMenu)}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
