import Link from "next/link";

export function StoreGuideLinks() {
  return <section className="my-6 rounded-2xl border border-pink-300/40 bg-[#1b101d]/95 p-5 text-pink-50" aria-labelledby="store-guide-title">
    <h2 id="store-guide-title" className="text-lg font-semibold">เลือกซื้อกับ StoreByMari</h2>
    <p className="mt-2 text-sm leading-7">ดูราคา ระยะเวลา อุปกรณ์ที่รองรับ และข้อจำกัดของสินค้าก่อนสั่งซื้อ ชำระด้วยพ้อยท์ของร้าน และตรวจสอบรายการที่ซื้อได้ในประวัติคำสั่งซื้อ</p>
    <nav aria-label="ข้อมูลการสั่งซื้อ" className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm underline underline-offset-4">
      <Link href="/products">สินค้าทั้งหมด</Link>
      <Link href="/buying-guide">วิธีสั่งซื้อและคำถามที่พบบ่อย</Link>
      <Link href="/support/report">แจ้งปัญหาการใช้งาน</Link>
    </nav>
  </section>;
}
