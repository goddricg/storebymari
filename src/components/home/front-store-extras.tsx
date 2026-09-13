"use client";

import Image from "next/image";
import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";

export default function FrontStoreExtras() {
  const { isStandalone, triggerInstall } = usePwaInstall();

  return (
    <div className="front-store-extras">
      {!isStandalone ? (
        <section className="front-store-install" aria-label="ติดตั้ง App by Mari บนอุปกรณ์">
          <div className="front-store-install-brand">
            <Image
              src={SITE_BRAND_LOGO_PATH}
              alt="Mari Studio"
              width={1536}
              height={1024}
              sizes="(max-width: 639px) 86px, 184px"
            />
          </div>
          <div className="front-store-install-copy">
            <p className="front-store-install-eyebrow"><Smartphone aria-hidden="true" /> APP BY MARI</p>
            <h2>ความสะดวกไว้ในมือคุณ</h2>
            <p>เพิ่ม App by Mari ไว้บนหน้าจอหลัก แล้วกลับมาเลือกสินค้าได้ง่ายขึ้น</p>
          </div>
          <button
            type="button"
            className="front-store-install-button"
            onClick={() => void triggerInstall()}
          >
            <Download aria-hidden="true" /> ติดตั้งแอป
          </button>
        </section>
      ) : null}

      <footer id="support" className="front-store-footer">
        <Link href="/" className="front-store-footer-brand">Mari Studio</Link>
        <p>© {new Date().getFullYear()} Mari Studio. All rights reserved.</p>
        <nav aria-label="ลิงก์ท้ายหน้า">
          <Link href="/products">สินค้า</Link>
          <Link href="/support/report">แจ้งปัญหา</Link>
          <Link href="#support">ติดต่อเรา</Link>
        </nav>
      </footer>
    </div>
  );
}
