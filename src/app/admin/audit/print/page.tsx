import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { StatementPrintButton } from "@/components/admin/statement-print-button";
import { requireSuperAdmin } from "@/lib/auth/server";
import { recordAdminAuditEvent } from "@/lib/audit/admin-audit";
import { getAdminDailyWorkReport } from "@/lib/audit/admin-audit-daily-report";
import { getSiteId } from "@/lib/site";
import { loadLayoutPublicSettings } from "@/lib/settings/load-layout-public-settings";
import { getDateOnlyInTopupTimeZone, normalizeTopupReportDate } from "@/lib/topup/report-time";
import {
  resolveSiteBrandLogo,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_WIDTH,
} from "@/lib/site-branding";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const date = (Array.isArray(params.date) ? params.date[0] : params.date) || "";
  return {
    title: `รายงานสรุปเวลาทำงาน Admin ประจำวัน (${date}) | Store By Mari`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminAuditPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireSuperAdmin();
  if (getSiteId() !== "main") redirect("/");

  const publicSettings = await loadLayoutPublicSettings();
  const siteLogoUrl = resolveSiteBrandLogo(publicSettings.site_logo_url);

  const params = await searchParams;
  const today = getDateOnlyInTopupTimeZone();
  const rawDate = firstParam(params.date);
  const date = rawDate ? normalizeTopupReportDate(rawDate) || today : today;
  const actorId = firstParam(params.actorId)?.trim() || undefined;

  const report = await getAdminDailyWorkReport({
    siteId: "main",
    date,
    actorId,
  });

  await recordAdminAuditEvent({
    actor: user,
    action: "AUDIT_DAILY_REPORT_PRINT",
    category: "audit",
    severity: "medium",
    entityType: "audit_daily_report",
    after: {
      date,
      actorId: actorId ?? null,
      totalAdmins: report.totalAdminsActive,
      totalSessions: report.totalSessionsAll,
      totalActions: report.totalActionsAll,
    },
    details: `Printed Admin Daily Work Sessions report for date ${date}`,
    route: "/admin/audit/print",
    method: "GET",
  });

  return (
    <main data-audit-print-page className="audit-print-page mx-auto max-w-[1600px] bg-white p-5 text-[#1f2937] sm:p-8">
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; }
          body { margin: 0; }
          body:has([data-audit-print-page]) [data-site-global-navigation],
          body:has([data-audit-print-page]) [data-site-global-bottom-navigation],
          .audit-no-print { display: none !important; }
          .audit-print-page { max-width: none !important; padding: 0 !important; }
          .audit-print-table thead { display: table-header-group; }
          .audit-print-table tr { break-inside: avoid; page-break-inside: avoid; }
        }
        .audit-print-table { border-collapse: collapse; width: 100%; }
        .audit-print-table th, .audit-print-table td { border: 1px solid #d6d3d1; padding: 6px 8px; vertical-align: top; }
        .audit-print-table th { background: #f5f5f4; font-weight: 700; white-space: nowrap; font-size: 11px; }
        .audit-print-table td { font-size: 11px; }
      `}</style>

      <div className="audit-no-print mb-5 flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <div>
          <p className="text-sm font-semibold text-stone-800">เอกสารรายงานเวลาทำงาน Admin ประจำวัน (A4 แนวนอน)</p>
          <p className="text-xs text-stone-500">กดปุ่มด้านขวาเพื่อพิมพ์ หรือเลือกบันทึกเป็นไฟล์ PDF (Save as PDF) ได้ทันที</p>
        </div>
        <StatementPrintButton />
      </div>

      <header className="border-b-2 border-stone-800 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Image
              src={siteLogoUrl}
              alt="โลโก้เว็บไซต์"
              width={SITE_BRAND_LOGO_WIDTH}
              height={SITE_BRAND_LOGO_HEIGHT}
              priority
              unoptimized
              className="h-14 w-auto max-w-[14rem] shrink-0 object-contain object-left sm:h-16"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#111827] sm:text-2xl">
                รายงานสรุปช่วงเวลาเข้าใช้งานและการทำงานของ Admin ประจำวัน
              </h1>
              <p className="mt-0.5 text-base font-semibold text-[#8c3b5d]">หจก. มาริ สตูดิโอ (storebymari.com)</p>
              <p className="mt-0.5 text-xs text-stone-600">
                ระบบตรวจสอบความปลอดภัยและ Audit ประจำวัน (Daily Work Sessions Report)
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-stone-600">
            <p className="font-semibold text-stone-900 text-sm">วันที่รายงาน: {report.dateTh}</p>
            <p>วันที่ในระบบ: {report.date} (เขตเวลา Asia/Bangkok)</p>
            <p>พิมพ์เอกสารเมื่อ: {new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} น.</p>
            <p className="text-stone-500">พิมพ์โดย: {user.displayName || user.email} ({user.role})</p>
          </div>
        </div>
      </header>

      <section className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-stone-300 p-3 bg-stone-50/50">
          <p className="text-xs text-stone-500">แอดมินที่เข้างานในวันนี้</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {report.totalAdminsActive} <span className="text-xs font-normal text-stone-600">คน</span>
          </p>
        </div>
        <div className="rounded border border-stone-300 p-3 bg-stone-50/50">
          <p className="text-xs text-stone-500">จำนวนช่วงเวลาทำงานรวม</p>
          <p className="mt-1 text-2xl font-bold text-[#8c3b5d]">
            {report.totalSessionsAll} <span className="text-xs font-normal text-stone-600">ช่วงเวลา</span>
          </p>
        </div>
        <div className="rounded border border-stone-300 p-3 bg-stone-50/50">
          <p className="text-xs text-stone-500">รวมเวลาปฏิบัติงานทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {report.totalActiveFormattedAll}
          </p>
        </div>
        <div className="rounded border border-stone-300 p-3 bg-stone-50/50">
          <p className="text-xs text-stone-500">จำนวนการกระทำ (Actions) รวม</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">
            {report.totalActionsAll.toLocaleString("th-TH")} <span className="text-xs font-normal text-stone-600">ครั้ง</span>
          </p>
        </div>
      </section>

      {report.admins.length === 0 ? (
        <div className="my-10 rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          ไม่พบประวัติการเข้าใช้งานหรือปฏิบัติงานของ Admin ในวันที่ {report.dateTh}
        </div>
      ) : (
        <table className="audit-print-table">
          <caption className="sr-only">ตารางสรุปช่วงเวลาทำงานของ Admin ประจำวัน</caption>
          <thead>
            <tr>
              <th style={{ width: "40px" }} className="text-center">ลำดับ</th>
              <th style={{ width: "200px" }}>ผู้ดูแลระบบ (Admin)</th>
              <th style={{ width: "100px" }} className="text-center">จำนวนช่วง</th>
              <th>รายละเอียดช่วงเวลาที่เข้ามาทำงาน (Work Sessions)</th>
              <th style={{ width: "120px" }} className="text-center">เวลารวมในระบบ</th>
              <th style={{ width: "110px" }} className="text-right">Action ทั้งหมด</th>
              <th style={{ width: "220px" }}>งานหลักที่ทำในวันนั้น</th>
            </tr>
          </thead>
          <tbody>
            {report.admins.map((admin, index) => (
              <tr key={admin.actorId}>
                <td className="text-center font-medium">{index + 1}</td>
                <td>
                  <p className="font-bold text-stone-900">{admin.actorName}</p>
                  <p className="text-[10px] text-stone-500">{admin.actorEmail || admin.actorId}</p>
                  <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-700 mt-1">
                    {admin.actorRole}
                  </span>
                </td>
                <td className="text-center">
                  <span className="font-bold text-[#8c3b5d]">{admin.totalSessions}</span> ช่วง
                </td>
                <td>
                  <div className="space-y-1.5">
                    {admin.sessions.map((s) => (
                      <div
                        key={s.sessionIndex}
                        className="rounded border border-stone-200 bg-stone-50/80 px-2 py-1 text-[10px]"
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span className="text-[#8c3b5d]">
                            ช่วงที่ {s.sessionIndex}: {s.startTimeTh} - {s.endTimeTh}
                          </span>
                          <span className="text-stone-700">
                            ({s.durationFormatted} • {s.actionsCount.toLocaleString("th-TH")} ครั้ง)
                          </span>
                        </div>
                        {s.topActionsTh.length > 0 ? (
                          <p className="text-stone-500 mt-0.5 truncate">
                            เน้น: {s.topActionsTh.slice(0, 2).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="text-center font-semibold text-emerald-700">
                  {admin.totalActiveFormatted}
                  <p className="text-[10px] font-normal text-stone-500 mt-0.5">
                    ({admin.firstActionTh} - {admin.lastActionTh})
                  </p>
                </td>
                <td className="text-right">
                  <p className="font-bold text-stone-900">{admin.totalActions.toLocaleString("th-TH")} ครั้ง</p>
                  <p className="text-[10px] text-emerald-600">สำเร็จ {admin.successCount}</p>
                  {admin.failedCount > 0 ? (
                    <p className="text-[10px] text-red-600">ล้มเหลว/ปฏิเสธ {admin.failedCount}</p>
                  ) : null}
                  {admin.highRiskCount > 0 ? (
                    <p className="text-[10px] text-amber-600">เสี่ยงสูง {admin.highRiskCount}</p>
                  ) : null}
                </td>
                <td>
                  <div className="space-y-1">
                    {admin.categoryBreakdown.slice(0, 3).map((cat) => (
                      <div key={cat.category} className="text-[10px] flex justify-between">
                        <span className="text-stone-700">{cat.labelTh}</span>
                        <span className="font-semibold text-stone-900">
                          {cat.count} ครั้ง ({cat.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-8 border-t border-stone-300 pt-4 text-xs text-stone-600">
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <p className="font-semibold text-stone-800">เกณฑ์การจัดกลุ่มช่วงเวลาทำงาน (Working Session Definition):</p>
            <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
              ระบบจัดกลุ่มช่วงเวลาทำงานจากการบันทึกกิจกรรมในระบบ (Audit Trail) โดยหากไม่มีการปฏิบัติงานเกินกว่า 30 นาที (Inactivity Gap) จะนับเป็นการสิ้นสุดช่วงเวลานั้น และเมื่อเริ่มมีกิจกรรมใหม่จะนับเป็นช่วงเวลาถัดไป
            </p>
          </div>
          <div className="text-right text-[11px] text-stone-500">
            <p>เอกสารฉบับนี้เป็นข้อมูลรายงานหลักฐานภายในระบบเว็บไซต์ storebymari.com</p>
            <p>ห้ามเผยแพร่แก่บุคคลภายนอกโดยไม่ได้รับอนุญาตจากผู้ดูแลระบบสูงสุด</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-16 pt-8 text-center">
          <div>
            <div className="mx-auto w-48 border-b border-stone-400 pb-1"></div>
            <p className="mt-2 text-stone-700 font-medium">ผู้จัดทำรายงาน / ผู้ตรวจสอบ</p>
            <p className="text-[11px] text-stone-500">วันที่: ......./......./...........</p>
          </div>
          <div>
            <div className="mx-auto w-48 border-b border-stone-400 pb-1"></div>
            <p className="mt-2 text-stone-700 font-medium">ผู้อนุมัติ / ผู้ดูแลระบบสูงสุด</p>
            <p className="text-[11px] text-stone-500">วันที่: ......./......./...........</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
