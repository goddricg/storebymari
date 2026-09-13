"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Crown, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserTier } from "@/lib/auth/user";

const tierLabels: Record<UserTier, string> = {
  normal: "Normal",
  vip: "VIP",
  walkin: "Walk-in",
};

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days} วัน ${hours} ชั่วโมง ${minutes} นาที ${seconds} วินาที`;
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TierStatusCard({
  tier,
  tierExpiresAt,
}: {
  tier: UserTier;
  tierExpiresAt: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const expiryTime = tierExpiresAt ? new Date(tierExpiresAt).getTime() : NaN;
  const hasValidExpiry = Number.isFinite(expiryTime) && expiryTime > now;
  const displayedTier: UserTier = tier !== "normal" && tierExpiresAt && !hasValidExpiry ? "normal" : tier;
  const remaining = useMemo(
    () => hasValidExpiry ? expiryTime - now : 0,
    [expiryTime, hasValidExpiry, now]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card className="border border-[#f2b2c5] bg-gradient-to-br from-white via-[#fff9fb] to-[#fff0f6] shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-[#542b3a]">
          <Crown className="size-5 text-[#e783a0]" />
          สถานะ Tier ของคุณ
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#f6c7d5] bg-white/80 p-3">
          <p className="text-xs text-[#9d7080]">Tier ปัจจุบัน</p>
          <p className="mt-1 text-lg font-extrabold text-[#d95780]">{tierLabels[displayedTier]}</p>
        </div>
        <div className="rounded-xl border border-[#f6c7d5] bg-white/80 p-3">
          <p className="flex items-center gap-1 text-xs text-[#9d7080]"><Clock3 className="size-3.5" /> ระยะเวลา</p>
          <p className="mt-1 text-sm font-semibold text-[#542b3a]">
            {displayedTier === "normal"
              ? "ไม่มีวันหมดอายุ"
              : hasValidExpiry
                ? `เหลือ ${formatRemaining(remaining)}`
                : "หมดอายุแล้ว กลับสู่ Normal"}
          </p>
        </div>
        <div className="rounded-xl border border-[#f6c7d5] bg-white/80 p-3">
          <p className="flex items-center gap-1 text-xs text-[#9d7080]"><ShieldCheck className="size-3.5" /> วันหมดอายุ</p>
          <p className="mt-1 text-sm font-semibold text-[#542b3a]">
            {displayedTier === "normal" || !tierExpiresAt ? "ไม่มีวันหมดอายุ" : formatExpiry(tierExpiresAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
