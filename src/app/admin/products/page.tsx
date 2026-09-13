import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSiteId } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const siteId = getSiteId();
  if (siteId === "child1") {
    return {
      title: "จัดการสินค้า | Premium By Som Admin",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: "จัดการสินค้า | App By Mari Admin | Appbymari",
    robots: { index: false, follow: false },
  };
}

export default function AdminProductsLegacyPage() {
  redirect("/admin");
}
