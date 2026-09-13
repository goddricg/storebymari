"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Star, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { RankingEntry, RankingSettings } from "@/lib/ranking/repository";

type RankingCardProps = {
  initialRows: RankingEntry[];
  settings: RankingSettings;
  initialPeriodLabel: string;
};

const rankStyles = {
  1: {
    card: "border-[#f1c454] bg-gradient-to-b from-[#fffaf0] to-[#fff0c6] ring-2 ring-[#f8d97b]/60 ring-offset-2 ring-offset-white",
    badge: "bg-[#f5b82e] text-white",
    frame: "border-[#f4c35f] bg-[#fff9e6] ring-4 ring-[#ffe6a0]/70",
    crownUrl: "/branding/ranking/rank-1-crown.png",
  },
  2: {
    card: "border-[#b9c8e6] bg-gradient-to-b from-[#fcfbff] to-[#eef2ff] ring-2 ring-[#d9e1f2]/70 ring-offset-2 ring-offset-white",
    badge: "bg-[#9eafd2] text-white",
    frame: "border-[#bccbe8] bg-[#f7f9ff] ring-4 ring-[#e0e7f5]/80",
    crownUrl: "/branding/ranking/rank-2-crown.png",
  },
  3: {
    card: "border-[#efaa76] bg-gradient-to-b from-[#fff9f4] to-[#ffe8d1] ring-2 ring-[#f4bd91]/60 ring-offset-2 ring-offset-white",
    badge: "bg-[#df8737] text-white",
    frame: "border-[#e7a077] bg-[#fff4eb] ring-4 ring-[#ffd0af]/75",
    crownUrl: "/branding/ranking/rank-3-crown.png",
  },
} as const;

function AnimatedAmount({ value }: { value: number | null }) {
  const [displayValue, setDisplayValue] = useState(value ?? 0);
  const previousValue = useRef(value ?? 0);

  useEffect(() => {
    if (value === null) return;
    const fromValue = previousValue.current;
    previousValue.current = value;
    if (fromValue === value) return;

    const start = performance.now();
    const duration = 650;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(fromValue + (value - fromValue) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  if (value === null) return <span className="text-sm text-[#a96c7e]">ซ่อนยอด</span>;

  return (
    <span>
      ฿{displayValue.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
    </span>
  );
}

function RankingTile({ entry, showAvatar, showUsername, showAmount }: {
  entry: RankingEntry;
  showAvatar: boolean;
  showUsername: boolean;
  showAmount: boolean;
}) {
  const special = rankStyles[entry.rank as keyof typeof rankStyles];

  return (
    <motion.article
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(entry.rank * 0.035, 0.3), ease: "easeOut" }}
      className={`dreamy-ranking-tile relative flex min-h-[218px] flex-col items-center rounded-2xl border px-2.5 py-3 text-center shadow-[0_7px_18px_rgba(211,78,126,0.08)] sm:min-h-[230px] sm:px-3 ${
        special?.card ?? "border-[#f7a8c0] bg-gradient-to-b from-[#fffafd] to-[#fff2f7]"
      }`}
    >
      <span className={`absolute right-2 top-2 flex size-7 items-center justify-center rounded-full text-sm font-bold shadow-sm ${special?.badge ?? "bg-[#ffd3df] text-[#a53459]"}`}>
        {entry.rank}
      </span>

      <div className={`relative mt-7 flex size-[78px] items-center justify-center rounded-full border-4 p-1 shadow-[0_4px_14px_rgba(211,78,126,0.18)] sm:size-[86px] ${special?.frame ?? "border-white bg-white/75"}`}>
        {special ? (
          <img
            src={special.crownUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 left-1/2 z-20 h-16 w-28 -translate-x-1/2 object-contain drop-shadow-[0_3px_4px_rgba(122,57,37,0.18)] sm:-top-11 sm:h-[4.5rem] sm:w-32"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="relative z-10 size-full overflow-hidden rounded-full border-2 border-white bg-white/75">
          {showAvatar && entry.avatarUrl ? (
            <img
              src={entry.avatarUrl}
              alt={showUsername && entry.username ? `Avatar ของ ${entry.username}` : "Avatar สมาชิกอันดับ"}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="flex size-full items-center justify-center rounded-full bg-[#ffe2ec] text-[#d14d79]">
              <Trophy className="size-7" />
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 min-h-10 w-full break-words text-sm font-bold leading-5 text-[#713545]">
        {showUsername ? entry.username ?? "สมาชิก" : "สมาชิก"}
      </p>
      <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold text-[#c66580]">
        ยอดเติมเงินรวม
      </span>
      <p className="mt-1 text-base font-extrabold text-[#8e263f] sm:text-lg">
        {showAmount ? <AnimatedAmount value={entry.amount} /> : "ซ่อนยอด"}
      </p>
    </motion.article>
  );
}

export default function RankingCard({ initialRows, settings, initialPeriodLabel }: RankingCardProps) {
  const [rows, setRows] = useState(initialRows);
  const [periodLabel, setPeriodLabel] = useState(initialPeriodLabel);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setPeriodLabel(initialPeriodLabel);
  }, [initialPeriodLabel]);

  useEffect(() => {
    if (!settings.enabled || !settings.realtime) return;

    let active = true;
    const refresh = async () => {
      if (active) setIsRefreshing(true);
      try {
        const response = await fetch("/api/ranking", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { rows?: RankingEntry[]; periodLabel?: string };
        if (active && Array.isArray(payload.rows)) setRows(payload.rows);
        if (active && typeof payload.periodLabel === "string") setPeriodLabel(payload.periodLabel);
      } catch {
        // The first server-rendered ranking remains visible when polling is unavailable.
      } finally {
        if (active) setIsRefreshing(false);
      }
    };

    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [settings.enabled, settings.realtime]);

  if (!settings.enabled) return null;

  return (
    <section id="monthly-ranking" className="dreamy-ranking-section relative overflow-hidden rounded-[26px] border border-[#f7b2c5] bg-white/85 p-4 shadow-[0_12px_30px_rgba(211,78,126,0.11)] sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(255,224,160,0.3),transparent_22%),radial-gradient(circle_at_95%_90%,rgba(255,194,218,0.25),transparent_26%)]" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#e4a31d]">
            <Trophy className="size-6" fill="currentColor" />
            <h2 className="text-xl font-extrabold text-[#ed5c82] sm:text-2xl">TOP {settings.count} ยอดเติมเงินสูงสุด</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#9b5568]">
            <p>จัดอันดับจากยอดเติมเงินสำเร็จของสมาชิก</p>
            <span className="rounded-full border border-[#f4b1c5] bg-[#fff4f8] px-2.5 py-1 font-semibold text-[#c65b7b]">
              ประจำเดือน {periodLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          {settings.realtime ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#58a56a]">
              <span className="size-2 rounded-full bg-[#58c878]" /> LIVE
              <RefreshCw className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative mt-5 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-color:#f4aac0_transparent] [scrollbar-width:thin]">
        <div className="grid min-w-[980px] grid-flow-col auto-cols-[minmax(130px,1fr)] gap-2.5 sm:min-w-[1120px] sm:auto-cols-[minmax(142px,1fr)] lg:min-w-0 lg:grid-flow-col lg:auto-cols-fr">
          <AnimatePresence mode="popLayout">
            {rows.map((entry) => (
              <RankingTile
                key={`${entry.rank}-${entry.username ?? "member"}`}
                entry={entry}
                showAvatar={settings.showAvatar}
                showUsername={settings.showUsername}
                showAmount={settings.showAmount}
              />
            ))}
          </AnimatePresence>
        </div>
        {rows.length === 0 ? (
          <div className="dreamy-ranking-empty relative rounded-2xl border border-dashed border-[#f4b6c7] bg-white/70 px-4 py-10 text-center text-sm text-[#a96c7e]">
            ยังไม่มีข้อมูลอันดับในเดือนนี้
          </div>
        ) : null}
      </div>

      <div className="relative mt-2 flex items-center justify-center gap-1 text-xs text-[#b57888]">
        <Star className="size-3.5 text-[#edb536]" fill="currentColor" />
        อันดับจะเริ่มนับใหม่อัตโนมัติเมื่อต้นเดือน โดยไม่ลบประวัติเดิม
        <Star className="size-3.5 text-[#edb536]" fill="currentColor" />
      </div>
    </section>
  );
}
