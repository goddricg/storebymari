import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RankingCard from "@/components/home/ranking-card";
import { getRankingSnapshot } from "@/lib/ranking/repository";
import { getSiteId } from "@/lib/site";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = getSiteConfig();
  return { title: `Ranking | ${siteName}`, robots: { index: false, follow: false } };
}

export default async function RankingPage() {
  if (getSiteId() !== "main") {
    notFound();
  }

  const snapshot = await getRankingSnapshot();
  return (
    <main className="dreamy-page min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <RankingCard
          initialRows={snapshot.rows}
          settings={snapshot.settings}
          initialPeriodLabel={snapshot.periodLabel}
        />
      </div>
    </main>
  );
}
