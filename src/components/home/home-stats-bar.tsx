"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  ListChecks,
  TrendingUp,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { CornerCardOrnaments } from "@/components/dreamy-ui/ornaments";

type HomeStatsBarProps = {
  usersCount: number;
  totalStock: number;
  ordersCount: number;
  resolvedCasesCount: number;
};

const STAT_CONFIG: Array<{
  key: "users" | "resolvedCases" | "stock" | "orders";
  label: string;
  icon: LucideIcon;
  format: (values: HomeStatsBarProps) => string;
}> = [
  {
    key: "users",
    label: "จำนวนผู้ใช้งาน",
    icon: Users,
    format: (v) => `${v.usersCount.toLocaleString()} คน`,
  },
  {
    key: "resolvedCases",
    label: "สถิติการแก้ปัญหา",
    icon: BadgeCheck,
    format: (v) => `แก้สำเร็จ ${v.resolvedCasesCount.toLocaleString()} รายการ`,
  },
  {
    key: "stock",
    label: "จำนวนสินค้าคงเหลือ",
    icon: ListChecks,
    format: (v) => `${v.totalStock.toLocaleString()} ชิ้น`,
  },
  {
    key: "orders",
    label: "ยอดคำสั่งซื้อ",
    icon: TrendingUp,
    format: (v) => `${v.ordersCount.toLocaleString()} รายการ`,
  },
];

export default function HomeStatsBar({
  usersCount,
  totalStock,
  ordersCount,
  resolvedCasesCount,
}: HomeStatsBarProps) {
  const [liveStockStats, setLiveStockStats] = useState<{
    totalStock: number;
  } | null>(null);
  const values = {
    usersCount,
    totalStock: liveStockStats?.totalStock ?? totalStock,
    ordersCount,
    resolvedCasesCount,
  };

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/products/stats", { cache: "no-store" });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as {
        totalStock: number;
      };
      setLiveStockStats({
        totalStock: data.totalStock,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void refreshStats();
      }, 800);
    };

    window.addEventListener("products:stock-changed", scheduleRefresh);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener("products:stock-changed", scheduleRefresh);
    };
  }, [refreshStats]);

  return (
    <div className="block">
      <div className="dreamy-glass-panel relative rounded-2xl p-2.5 sm:p-4 lg:p-5">
        <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {STAT_CONFIG.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.key}
                className="dreamy-card dreamy-corner-card-frame dreamy-stat-card group relative overflow-visible rounded-lg transition-all duration-200 hover:-translate-y-1 sm:rounded-xl"
              >
                <CornerCardOrnaments variant={index} />
                <CardContent className="relative z-10 flex min-h-[72px] items-center gap-2 p-2.5 sm:min-h-0 sm:gap-3 sm:p-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-color)]/12 text-[var(--theme-color)] transition-transform duration-200 group-hover:scale-105 sm:size-9">
                    <Icon className="size-3.5 sm:size-4" />
                  </span>
                  <div className="min-w-0 space-y-0.5 sm:space-y-1">
                    <p className="break-words text-[9px] font-medium leading-4 text-[var(--theme-color-text-accent)] sm:text-[11px] sm:leading-normal">
                      {stat.label}
                    </p>
                    <p className="break-words text-xs font-semibold leading-4 text-[var(--dreamy-text)] sm:text-base sm:leading-normal">
                      {stat.format(values)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
