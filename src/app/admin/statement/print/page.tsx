import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { StatementPrintButton } from "@/components/admin/statement-print-button";
import { requireSuperAdmin } from "@/lib/auth/server";
import { recordAdminAuditEvent } from "@/lib/audit/admin-audit";
import { listTopupStatementForAdmin } from "@/lib/receipts/topup-repository";
import { getSiteId } from "@/lib/site";
import { loadLayoutPublicSettings } from "@/lib/settings/load-layout-public-settings";
import {
  TOPUP_STATEMENT_CUTOFF,
  TOPUP_STATEMENT_MAX_PRINT_ROWS,
  TOPUP_STATEMENT_TIME_ZONE,
  normalizeTopupStatementSource,
  type TopupStatementSourceFilter,
} from "@/lib/topup/statement";
import { normalizeTopupReportDate } from "@/lib/topup/report-time";
import {
  resolveSiteBrandLogo,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_WIDTH,
} from "@/lib/site-branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Statement เติมเงิน | Admin",
    robots: { index: false, follow: false },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: TOPUP_STATEMENT_TIME_ZONE,
  }).format(date);
}

function formatDateOnly(value: string | undefined) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: TOPUP_STATEMENT_TIME_ZONE,
  }).format(date);
}

function sourceHeading(source: TopupStatementSourceFilter) {
  if (source === "SYSTEM") return "SYSTEM / ตรวจสลิปอัตโนมัติ";
  if (source === "ADMIN") return "Manual By Admin";
  return "ทั้งหมด";
}

function sourceText(row: {
  sourceType: "SYSTEM" | "ADMIN";
  sourceLabel: string | null;
  sourceEmail: string | null;
}) {
  if (row.sourceType === "ADMIN") {
    const actor = row.sourceLabel || row.sourceEmail;
    return actor ? `Manual By Admin: ${actor}` : "Manual By Admin";
  }
  return "SYSTEM / ตรวจสลิป";
}

export default async function TopupStatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireSuperAdmin();
  if (getSiteId() !== "main") redirect("/");
  const publicSettings = await loadLayoutPublicSettings();
  const siteLogoUrl = resolveSiteBrandLogo(publicSettings.site_logo_url);
  const params = await searchParams;
  const rawStartDate = firstParam(params.startDate);
  const rawEndDate = firstParam(params.endDate);
  const startDate = normalizeTopupReportDate(rawStartDate);
  const endDate = normalizeTopupReportDate(rawEndDate);
  const source = normalizeTopupStatementSource(firstParam(params.source));
  const search = (firstParam(params.search) ?? "").trim().slice(0, 100);

  const result = await listTopupStatementForAdmin({
    startDate,
    endDate,
    source,
    search,
    page: 1,
    limit: TOPUP_STATEMENT_MAX_PRINT_ROWS,
    sortOrder: "asc",
  });

  await recordAdminAuditEvent({
    actor: user,
    action: "TOPUP_STATEMENT_PRINT",
    category: "finance",
    severity: "medium",
    entityType: "topup_statement",
    after: {
      source,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      totalRows: result.summary.totalRows,
      printedRows: result.rows.length,
      searchProvided: Boolean(search),
    },
    details: "Printed the top-up statement report",
    route: "/admin/statement/print",
    method: "GET",
  });

  const isTruncated = result.summary.totalRows > result.rows.length;

  return (
    <main data-statement-print-page className="statement-print-page mx-auto max-w-[1600px] bg-white p-5 text-[#1f2937] sm:p-8">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          body { margin: 0; }
          body:has([data-statement-print-page]) [data-site-global-navigation],
          body:has([data-statement-print-page]) [data-site-global-bottom-navigation],
          .statement-no-print { display: none !important; }
          .statement-print-page { max-width: none !important; padding: 0 !important; }
          .statement-print-table thead { display: table-header-group; }
          .statement-print-table tr { break-inside: avoid; page-break-inside: avoid; }
        }
        .statement-print-table { border-collapse: collapse; width: 100%; }
        .statement-print-table th, .statement-print-table td { border: 1px solid #d6d3d1; padding: 6px 7px; vertical-align: top; }
        .statement-print-table th { background: #f5f5f4; font-weight: 700; white-space: nowrap; }
        .statement-print-table td.amount, .statement-print-table td.points { text-align: right; white-space: nowrap; }
        .statement-print-table td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; overflow-wrap: anywhere; }
      `}</style>

      <div className="statement-no-print mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-stone-500">เปิดหน้านี้แล้วกดพิมพ์ หรือเลือก Save as PDF จากหน้าต่างเครื่องพิมพ์</p>
        <StatementPrintButton />
      </div>

      <header className="border-b-2 border-stone-800 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Image
              src={siteLogoUrl}
              alt="โลโก้เว็บไซต์"
              data-statement-site-logo
              width={SITE_BRAND_LOGO_WIDTH}
              height={SITE_BRAND_LOGO_HEIGHT}
              priority
              unoptimized
              className="h-14 w-auto max-w-[14rem] shrink-0 object-contain object-left sm:h-16"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Statement รายการเติมเงิน</h1>
              <p className="mt-1 text-lg font-semibold">หจก.มาริ สตูดิโอ</p>
              <p className="mt-1 text-sm text-stone-600">แหล่งที่มา: {sourceHeading(source)}</p>
            </div>
          </div>
          <div className="text-right text-sm text-stone-600">
            <p>ช่วงวันที่: {formatDateOnly(startDate)} - {formatDateOnly(endDate)}</p>
            <p>เริ่มนับรายการตั้งแต่: {TOPUP_STATEMENT_CUTOFF} ({TOPUP_STATEMENT_TIME_ZONE})</p>
            <p>พิมพ์เมื่อ: {formatDateTime(new Date().toISOString())}</p>
          </div>
        </div>
      </header>

      <section className="my-4 grid grid-cols-4 gap-3 text-sm">
        <div className="rounded border border-stone-300 p-3"><p className="text-stone-500">รายการทั้งหมด</p><p className="mt-1 text-xl font-bold">{result.summary.totalRows.toLocaleString("th-TH")}</p></div>
        <div className="rounded border border-stone-300 p-3"><p className="text-stone-500">ยอดรวม</p><p className="mt-1 text-xl font-bold">{formatMoney(result.summary.totalAmount)} บาท</p></div>
        <div className="rounded border border-stone-300 p-3"><p className="text-stone-500">SYSTEM / Manual</p><p className="mt-1 font-semibold">{result.summary.systemRows.toLocaleString("th-TH")} / {result.summary.adminRows.toLocaleString("th-TH")} รายการ</p><p className="text-stone-600">{formatMoney(result.summary.systemAmount)} / {formatMoney(result.summary.adminAmount)} บาท</p></div>
        <div className="rounded border border-stone-300 p-3"><p className="text-stone-500">ผู้รับแต้มไม่ซ้ำ</p><p className="mt-1 text-xl font-bold">{result.summary.uniqueUsers.toLocaleString("th-TH")}</p></div>
      </section>

      {isTruncated ? (
        <p className="mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          รายการมีมากกว่าขีดจำกัดการพิมพ์ {TOPUP_STATEMENT_MAX_PRINT_ROWS.toLocaleString("th-TH")} รายการ จึงแสดง {result.rows.length.toLocaleString("th-TH")} รายการแรก กรุณาลดช่วงวันที่แล้วพิมพ์ใหม่
        </p>
      ) : null}
      {result.summary.rowsWithoutReceipt > 0 ? (
        <p className="mb-4 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          พบ {result.summary.rowsWithoutReceipt.toLocaleString("th-TH")} รายการที่ยังไม่มีเลขที่ใบเสร็จอ้างอิง
        </p>
      ) : null}

      <table className="statement-print-table text-[11px]">
        <caption className="sr-only">Statement รายการเติมเงินของ หจก.มาริ สตูดิโอ</caption>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>เลขที่ใบเสร็จอ้างอิง</th>
            <th>วันเวลาบันทึก</th>
            <th>ผู้รับแต้ม</th>
            <th>จำนวนเงิน (บาท)</th>
            <th>แหล่งที่มา</th>
            <th>Transaction ID</th>
            <th>แต้มรวม</th>
            <th>รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <td>{row.receiptNo || "ยังไม่มีเลขที่ใบเสร็จ"}</td>
              <td>{formatDateTime(row.recordedAt)}</td>
              <td>{row.buyerName || "-"}<br /><span className="text-stone-500">{row.buyerEmail || "-"}</span></td>
              <td className="amount">{formatMoney(row.amount)}</td>
              <td>{sourceText(row)}</td>
              <td className="mono">{row.transactionId || "-"}</td>
              <td className="points">{formatMoney(row.creditedPoints)}</td>
              <td>{row.note || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-5 border-t border-stone-300 pt-3 text-xs text-stone-600">
        <p>หมายเหตุ: รายการ SYSTEM มาจากการตรวจสอบสลิปอัตโนมัติ ส่วน Manual By Admin มาจากการบันทึกเติมเงินโดยผู้ดูแลระบบ</p>
        <p>เลขที่ใบเสร็จเดิมที่เป็น Legacy reference ยังคงใช้ตามเอกสารที่เคยออกแล้ว ส่วนรายการใหม่และรายการ Backfill ใช้รูปแบบ TU-YYYY-MM-XXXX</p>
      </footer>
    </main>
  );
}
