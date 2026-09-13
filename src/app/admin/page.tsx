import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/admin-layout";

import { getSiteId } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const siteId = getSiteId();
  if (siteId === "child1") {
    return {
      title: "ศูนย์ควบคุม | Premium By Som Admin",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: "ศูนย์ควบคุม | App By Mari Admin | Appbymari",
    robots: { index: false, follow: false },
  };
}

export default async function AdminDashboardPage() {
  const user = await requireAdmin("/login?next=%2Fadmin");
  // ตรวจสอบ role: superadmin หรือ admin
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin' || user?.isAdmin;
  if (!isAdmin) {
    redirect("/");
  }

  return <AdminLayout />;
}
