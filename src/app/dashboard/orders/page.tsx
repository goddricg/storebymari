import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/server";
import { listOrdersByUser } from "@/lib/orders/repository";
import { listPurchaseCasesByUser } from "@/lib/purchase-cases/repository";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { normalizeNewlines } from "@/lib/utils";
import { OrderDetailsDialog } from "@/components/orders/order-details-dialog";
import { getSiteConfig } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = getSiteConfig();
  return {
    title: "ประวัติสั่งซื้อ",
    description: `ตรวจสอบประวัติการสั่งซื้อสินค้าของคุณกับ ${siteName}`,
    robots: { index: false, follow: false },
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPrice(value: number | null) {
  if (value == null) return "-";
  if (value === 0) return "ฟรี";
  return `${value.toLocaleString("th-TH", { minimumFractionDigits: 2 })} พ้อยท์`;
}

export default async function OrdersPage() {
  const user = await requireUser();
  const [orders, purchaseCases] = await Promise.all([
    listOrdersByUser(user.id, 200),
    listPurchaseCasesByUser(user.id, 200),
  ]);
  const legacyOrders = orders.filter((order) => !order.caseOrderId);
  const { siteName } = getSiteConfig();

  return (
    <section className="bg-[var(--theme-color-bg-bottom)] py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        <div className="space-y-3 text-left">
          <Badge className="w-fit bg-[var(--theme-color)]/10 text-[var(--theme-color)]">ประวัติสั่งซื้อ</Badge>
          <h1 className="text-2xl font-bold text-[#0B0B0B] sm:text-3xl lg:text-4xl">
            ประวัติการซื้อสินค้าของคุณ
          </h1>
          <p className="max-w-2xl text-sm text-[#6B7280]">
            ทุกคำสั่งซื้อที่คุณทำผ่านระบบ {siteName} จะถูกบันทึกไว้ที่นี่ หากพบปัญหากรุณาติดต่อทีมงานพร้อมแจ้งหมายเลขอ้างอิงคำสั่งซื้อ
          </p>
        </div>

        <Separator className="my-6 bg-[#E5E7EB] sm:my-8" />

        {purchaseCases.length === 0 && legacyOrders.length === 0 ? (
          <Card className="border-dashed border-[var(--theme-color)]/30 bg-[#fff4ed]">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-[var(--theme-color)]">
              <p className="text-lg font-semibold">ยังไม่มีประวัติการสั่งซื้อ</p>
              <p className="text-sm text-[#B91C1C]">
                เริ่มต้นเลือกสินค้าจากหน้าแรกหรือหน้า &quot;สินค้า&quot; เพื่อทำรายการสั่งซื้อได้ทันที
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {purchaseCases.length > 0 ? (
              <div className="mb-8 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-[#0B0B0B]">Case Order</h2>
                  <p className="mt-1 text-sm text-[#6B7280]">รายการซื้อที่รวมเป็นคำสั่งซื้อเดียว พร้อมเอกสารบิลเงินสด</p>
                </div>
                <div className="space-y-4">
                  {purchaseCases.map((purchaseCase) => {
                    const caseOrders = orders.filter((order) => purchaseCase.items.some((item) => item.orderIds.includes(order.id)));
                    return (
                      <Card key={purchaseCase.id} className="border border-[#f3b0c5] bg-white shadow-sm">
                        <CardContent className="space-y-4 p-4 sm:p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className="bg-[var(--theme-color)] text-white">{purchaseCase.caseOrderNo}</Badge>
                                <Badge variant="outline" className="border-green-300 text-green-700">{purchaseCase.status === "COMPLETED" ? "สำเร็จ" : purchaseCase.status}</Badge>
                              </div>
                              <p className="mt-2 text-xs text-[#6B7280]">วันที่: {formatDate(purchaseCase.completedAt ?? purchaseCase.createdAt)}</p>
                              {purchaseCase.receipt ? <p className="mt-1 text-xs font-semibold text-[#d8447b]">Receipt No.: {purchaseCase.receipt.receiptNo}</p> : null}
                            </div>
                            {purchaseCase.receipt ? (
                              <Button asChild size="sm" className="w-full bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)] sm:w-auto">
                                <Link href={`/dashboard/receipts/${purchaseCase.id}`} target="_blank">ดู / พิมพ์บิลเงินสด</Link>
                              </Button>
                            ) : <span className="text-xs text-[#9CA3AF]">ไม่มี Receipt สำหรับรายการก่อนวันที่กำหนด</span>}
                          </div>
                          <div className="rounded-xl border border-[#F1D5C2] bg-[#FFFBF8] p-3">
                            <div className="space-y-2">
                              {purchaseCase.items.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                                  <span className="min-w-0 truncate text-[#374151]">{item.productName} × {item.quantity}</span>
                                  <span className="shrink-0 font-semibold text-[#a65a3f]">{formatPrice(item.amount)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex justify-between border-t border-[#F1D5C2] pt-3 text-sm font-bold text-[#111827]">
                              <span>ยอดรวม</span><span className="text-[var(--theme-color)]">{formatPrice(purchaseCase.totalPoints)}</span>
                            </div>
                          </div>
                          {caseOrders.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {caseOrders.map((order) => order.productDetails ? (
                                <OrderDetailsDialog
                                  key={order.id}
                                  productName={normalizeNewlines(order.productName)}
                                  productDetails={normalizeNewlines(order.productDetails)}
                                  accountEmail={order.accountEmail}
                                  accountPassword={order.accountPassword}
                                  reference={order.id}
                                  price={order.price}
                                  purchaseDate={order.purchaseDate}
                                />
                              ) : null)}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {legacyOrders.length > 0 ? (
              <div>
                {purchaseCases.length > 0 ? <h2 className="mb-4 text-xl font-bold text-[#0B0B0B]">รายการเดิมที่ยังไม่จัดกลุ่ม Case Order</h2> : null}
            {/* Desktop Table View */}
            <div className="hidden sm:block rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
              <table className="min-w-full table-fixed divide-y divide-[#E5E7EB]">
                <colgroup>
                  <col className="w-[40%] lg:w-[45%]" />
                  <col className="w-[20%]" />
                  <col className="w-[25%] lg:w-[20%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-[#F9FAFB] text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  <tr>
                    <th scope="col" className="px-4 py-4 lg:px-6">สินค้า</th>
                    <th scope="col" className="px-4 py-4 lg:px-6">พ้อยท์ที่ใช้</th>
                    <th scope="col" className="px-4 py-4 lg:px-6">วันที่</th>
                    <th scope="col" className="px-4 py-4 lg:px-6 text-center">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#0B0B0B]">
                  {legacyOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="px-4 py-4 lg:px-6">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-[#0B0B0B] line-clamp-2 whitespace-pre-line" title={normalizeNewlines(order.productName)}>
                          {normalizeNewlines(order.productName)}
                        </span>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                            <span>อ้างอิง: {order.id.slice(0, 8)}...</span>
                            {order.typeMenu ? (
                              <span className="rounded-full bg-[var(--theme-color)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--theme-color)]">
                                {order.typeMenu}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 lg:px-6 font-semibold text-[var(--theme-color)]">
                        {formatPrice(order.price)}
                      </td>
                      <td className="px-4 py-4 lg:px-6 text-sm text-[#6B7280]">
                        <span>{formatDate(order.purchaseDate ?? order.createdAt)}</span>
                      </td>
                      <td className="px-4 py-4 lg:px-6 text-center">
                        {order.productDetails ? (
                          <OrderDetailsDialog
                            productName={normalizeNewlines(order.productName)}
                            productDetails={normalizeNewlines(order.productDetails || '')}
                            accountEmail={order.accountEmail}
                            accountPassword={order.accountPassword}
                            reference={order.id}
                            price={order.price}
                            purchaseDate={order.purchaseDate}
                          />
                        ) : (
                          <span className="text-[#9CA3AF]">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="space-y-4 sm:hidden">
              {legacyOrders.map((order) => (
                <Card key={order.id} className="border border-[#E5E7EB] bg-white shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-[#0B0B0B] line-clamp-2 whitespace-pre-line">{normalizeNewlines(order.productName)}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                        <span>อ้างอิง: {order.id.slice(0, 8)}...</span>
                        {order.typeMenu ? (
                          <Badge className="bg-[var(--theme-color)]/10 text-[var(--theme-color)] text-[11px]">
                            {order.typeMenu}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
                      <div className="space-y-1">
                        <p className="text-xs text-[#6B7280]">พ้อยท์ที่ใช้</p>
                        <p className="font-semibold text-[var(--theme-color)]">{formatPrice(order.price)}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-xs text-[#6B7280]">วันที่</p>
                        <p className="text-sm text-[#0B0B0B]">{formatDate(order.purchaseDate ?? order.createdAt)}</p>
                      </div>
                    </div>
                    {order.productDetails && (
                      <div className="pt-2">
                        <OrderDetailsDialog
                          productName={normalizeNewlines(order.productName)}
                          productDetails={normalizeNewlines(order.productDetails)}
                          accountEmail={order.accountEmail}
                          accountPassword={order.accountPassword}
                          reference={order.id}
                          price={order.price}
                          purchaseDate={order.purchaseDate}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}



