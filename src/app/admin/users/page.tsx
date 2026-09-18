import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSiteId } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const siteId = getSiteId();
  if (siteId === "child1") {
    return {
      title: "จัดการผู้ใช้งาน | Premium By Som Admin",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: "จัดการผู้ใช้งาน | Store By Mari Admin | Store By Mari",
    robots: { index: false, follow: false },
  };
}

export default function AdminUsersLegacyPage() {
  redirect("/admin");
}
