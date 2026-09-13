'use client'

import { getSiteConfig } from "@/lib/site-config";
import { getSiteId } from "@/lib/site";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";

export function OrganizationJsonLd() {
  const { siteName, siteUrl } = getSiteConfig();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: siteUrl,
    ...(getSiteId() === 'main' ? { logo: new URL(SITE_BRAND_LOGO_PATH, siteUrl).toString() } : {}),
    description: 'ศูนย์รวมบัญชีพรีเมียมแท้ ราคาถูก ปลอดภัย พร้อมรับประกัน ใช้งานได้จริง ทั้ง Netflix Ultra HD, Spotify Premium, YouTube Premium, Disney+, Prime Video, HBO GO, VIU, WeTV และอีกมากมาย',
    sameAs: ['https://lin.ee/UgJrdRm'],
    areaServed: 'TH',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Thai',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function WebSiteJsonLd() {
  const { siteName, siteUrl } = getSiteConfig();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    inLanguage: 'th',
    description: 'ศูนย์รวมบัญชีพรีเมียมแท้ ราคาถูก ปลอดภัย พร้อมรับประกัน',
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function FAQJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'เช่า Netflix ราคาถูก ที่ไหนดี?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'สามารถเช่า Netflix Ultra HD 4K แท้ 100% ได้ที่ร้านของเรา มีการรับประกันตลอดอายุการใช้งาน ไม่มีจอปลิวแน่นอน',
        },
      },
      {
        '@type': 'Question',
        name: 'หาร Netflix ปลอดภัยไหม?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ปลอดภัย 100% เพราะเราใช้บัญชีแท้ในการแชร์ มีทีมงานคอยดูแลหลังการขาย 24 ชม. หมดปัญหาเรื่องโดนแบนหรือจอซ้อน',
        },
      },
      {
        '@type': 'Question',
        name: 'Spotify Premium ราคาเท่าไหร่?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'เรามีบริการ Spotify Premium ราคาถูก อัปเกรดไอดีเดิมได้ทันที ปลอดภัยและรับประกันตลอดการใช้งาน',
        },
      },
      {
        '@type': 'Question',
        name: 'YouTube Premium ซื้อร้านนี้เป็นแบบไหน?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'บริการแบบ YouTube Premium Family ใช้อีเมลของคุณเองในการรับคำเชิญ (Invite) ปลอดภัย 100% ไม่มีโฆษณาคั่น ฟังเพลงผ่าน YouTube Music ได้',
        },
      },
      {
        '@type': 'Question',
        name: 'ถ้าซื้อแอพพรีเมียมไปแล้วมีปัญหา ทำอย่างไร?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'เรามีบริการดูแลหลังการขายตลอด 24 ชั่วโมง เคลมได้จริง รวดเร็ว ไม่ทิ้งลูกค้า มั่นใจได้เลย',
        },
      }
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function ItemListJsonLd() {
  const { siteUrl } = getSiteConfig();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        url: `${siteUrl}`,
        name: 'Netflix Ultra HD 4K'
      },
      {
        '@type': 'ListItem',
        position: 2,
        url: `${siteUrl}`,
        name: 'Spotify Premium'
      },
      {
        '@type': 'ListItem',
        position: 3,
        url: `${siteUrl}`,
        name: 'YouTube Premium'
      },
      {
        '@type': 'ListItem',
        position: 4,
        url: `${siteUrl}`,
        name: 'Disney+ Hotstar'
      },
      {
        '@type': 'ListItem',
        position: 5,
        url: `${siteUrl}`,
        name: 'Prime Video'
      },
      {
        '@type': 'ListItem',
        position: 6,
        url: `${siteUrl}`,
        name: 'HBO GO'
      },
      {
        '@type': 'ListItem',
        position: 7,
        url: `${siteUrl}`,
        name: 'VIU Premium'
      }
    ]
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
