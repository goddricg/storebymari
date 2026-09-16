import Link from "next/link";
import { BreadcrumbJsonLd, JsonLd } from "@/components/seo/json-ld";
import { STORE_FAQ } from "@/lib/seo-faq";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("วิธีสั่งซื้อและคำถามที่พบบ่อย", "คู่มือสั่งซื้อ StoreByMari: เลือกสินค้า ตรวจสอบเงื่อนไข ใช้พ้อยท์ ติดตามคำสั่งซื้อและแจ้งปัญหาการใช้งาน", "/buying-guide");

export default function BuyingGuidePage() {
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
    <article className="rounded-3xl border border-pink-200 bg-white p-6 text-slate-900 shadow-sm sm:p-10">
      <BreadcrumbJsonLd items={[{ name: "หน้าแรก", url: "/" }, { name: "วิธีสั่งซื้อ", url: "/buying-guide" }]} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", "@id": absoluteUrl("/buying-guide#faq"), mainEntity: STORE_FAQ.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) }} />
      <nav aria-label="เส้นทาง" className="mb-5 text-sm"><Link href="/" className="underline">หน้าแรก</Link> / วิธีสั่งซื้อ</nav>
      <h1 className="text-2xl font-bold sm:text-3xl">วิธีสั่งซื้อสินค้า StoreByMari</h1>
      <p className="mt-4 leading-8">StoreByMari เป็นหน้าร้านสินค้าและแอปพรีเมียมออนไลน์ ควรอ่านรายละเอียดของแต่ละรายการก่อนซื้อ เพราะราคา ระยะเวลา จำนวนอุปกรณ์ และรูปแบบการรับสินค้าอาจแตกต่างกัน</p>
      <h2 className="mt-8 text-xl font-semibold">ขั้นตอนก่อนยืนยันคำสั่งซื้อ</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-6 leading-7">
        <li><Link className="underline" href="/products">เลือกสินค้า</Link> และอ่านรายละเอียดกับข้อจำกัดให้ครบ</li>
        <li><Link className="underline" href="/login">เข้าสู่ระบบ</Link> หรือสมัครสมาชิก แล้วตรวจสอบพ้อยท์ของบัญชี</li>
        <li>หากยอดไม่เพียงพอ เปิด <Link className="underline" href="/dashboard/topup">เติมพ้อยท์</Link> และทำตามคำแนะนำที่แสดง</li>
        <li>กดสั่งซื้อ ตรวจสอบสินค้า จำนวนและราคาที่ระบบสรุปก่อนยืนยัน</li>
        <li>ตรวจสอบรายการและข้อมูลที่ได้รับใน <Link className="underline" href="/dashboard/orders">ประวัติคำสั่งซื้อ</Link></li>
      </ol>
      <h2 id="faq" className="mt-9 text-xl font-semibold">คำถามที่พบบ่อย</h2>
      <div className="mt-4 divide-y divide-pink-100">{STORE_FAQ.map(item => <section key={item.question} className="py-5">
        <h3 className="font-semibold">{item.question}</h3><p className="mt-2 leading-8 text-slate-700">{item.answer}</p>
      </section>)}</div>
      <h2 className="mt-6 text-xl font-semibold">ขอความช่วยเหลือ</h2>
      <p className="mt-3 leading-8">ใช้ <Link className="underline" href="/support/report">แบบฟอร์มแจ้งปัญหา</Link> และ <Link className="underline" href="/support/check">ตรวจสอบสถานะเคส</Link> เพื่อส่งรายละเอียดและติดตามผลกับร้าน</p>
      <p className="mt-6 text-sm leading-7 text-slate-600">ชื่อแอปและเครื่องหมายการค้าเป็นของเจ้าของแต่ละราย การแสดงชื่อสินค้าไม่ได้หมายถึงการรับรองหรือความเป็นตัวแทนอย่างเป็นทางการจากผู้ให้บริการนั้น</p>
    </article>
  </main>;
}
