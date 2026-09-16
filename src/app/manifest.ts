import type { MetadataRoute } from 'next'

import { getSiteConfig } from '@/lib/site-config'
import {
  SITE_BRAND_PWA_ICON_192_PATH,
  SITE_BRAND_PWA_ICON_512_PATH,
  SITE_BRAND_PWA_MASKABLE_192_PATH,
  SITE_BRAND_PWA_MASKABLE_512_PATH,
} from '@/lib/site-branding'

export default function manifest(): MetadataRoute.Manifest {
  const { siteName } = getSiteConfig();
  return {
    name: `${siteName} - ขายแอพพรีเมียมราคาถูก`,
    short_name: siteName,
    description: 'ศูนย์รวมบัญชีพรีเมียมแท้ ราคาถูก ปลอดภัย พร้อมรับประกัน',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#120b17',
    theme_color: '#170f1d',
    icons: [
      {
        src: SITE_BRAND_PWA_ICON_192_PATH,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: SITE_BRAND_PWA_MASKABLE_192_PATH,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: SITE_BRAND_PWA_ICON_512_PATH,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: SITE_BRAND_PWA_MASKABLE_512_PATH,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
