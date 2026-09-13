'use client'

import { usePathname } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { usePublicSettings } from '@/components/public-settings-provider'
import { DreamyOrnament } from '@/components/dreamy-ui/ornaments'

export default function AnnouncementBar() {
  const pathname = usePathname()
  const settings = usePublicSettings()

  if (pathname !== '/') {
    return null
  }

  const isEnabled = settings.announcement_enabled === 'true'
  const text = settings.announcement_text?.trim() || null

  if (!isEnabled || !text) {
    return null
  }

  return (
    <div className="dreamy-announcement-bar relative border-b border-white/70 bg-[var(--theme-color-announcement)]/55 py-2.5 sm:py-3">
      <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-10">
        <div className="dreamy-glass-panel relative flex items-center gap-3 overflow-hidden rounded-lg px-4 py-3 sm:px-5 sm:py-3.5">
          <DreamyOrnament
            kind="bow"
            className="pointer-events-none absolute -right-1 -top-2 size-9 rotate-6 opacity-80"
          />
          <DreamyOrnament
            kind="sparkle"
            className="pointer-events-none absolute bottom-0 right-12 hidden size-5 opacity-70 sm:block"
          />
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-color)] text-white shadow-[0_6px_16px_rgba(211,78,126,0.2)]">
            <Megaphone className="size-4" />
          </span>
          <div className="relative z-10 flex flex-1 flex-col gap-1 pr-8 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-sm font-bold text-[var(--theme-color)] leading-tight">ประกาศ</span>
            <span className="text-sm leading-relaxed whitespace-pre-line text-[var(--dreamy-text)]">{text}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
