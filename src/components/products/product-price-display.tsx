'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth/use-session'
import { usePublicSettings } from '@/components/public-settings-provider'
import { calculateOriginalPrice, getPriceByTier, parseDiscountPercentage } from '@/lib/utils/pricing'

type ProductPriceDisplayProps = {
  price: number | null
  priceVip: number | null
  priceWalkin?: number | null
  isOutOfStock?: boolean
  className?: string
}

export function ProductPriceDisplay({
  price,
  priceVip,
  priceWalkin,
  isOutOfStock = false,
  className,
}: ProductPriceDisplayProps) {
  const { user } = useSession()
  const publicSettings = usePublicSettings()
  // ผู้เข้าชมที่ยังไม่มี session ต้องเห็นราคา Walk-in ก่อนเสมอ
  const userTier = user?.tier ?? 'walkin'

  const effectivePrice = useMemo(() => {
    return getPriceByTier(price, priceVip, priceWalkin, userTier)
  }, [price, priceVip, priceWalkin, userTier])

  const originalPrice = useMemo(() => {
    return calculateOriginalPrice(
      effectivePrice,
      parseDiscountPercentage(publicSettings.discount_percentage),
    )
  }, [effectivePrice, publicSettings.discount_percentage])

  const hasDisplayedDiscount =
    originalPrice != null && effectivePrice != null && originalPrice > effectivePrice

  const formatPrice = (value: number) =>
    `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`

  // หากยังไม่มีราคาที่คำนวณได้ ให้คง empty state เดิมไว้
  if (effectivePrice == null) {
    return (
      <p className={cn(
        "text-xl font-bold",
        isOutOfStock ? "text-gray-500" : "text-[var(--theme-color)]",
        className
      )}>
        -
      </p>
    )
  }

  // แสดงราคาปัจจุบันตาม tier และราคาเดิมจากการตั้งค่าส่วนลดของ Admin
  return (
    <div className="flex flex-col">
      {hasDisplayedDiscount ? (
        <span className="text-xs font-medium text-[#9CA3AF] line-through" aria-label="ราคาเดิม">
          {formatPrice(originalPrice)}
        </span>
      ) : null}
      <p className={cn(
        "text-xl font-bold",
        isOutOfStock ? "text-gray-500" : "text-[var(--theme-color)]",
        className
      )}>
        {effectivePrice === 0 ? "ฟรี" : formatPrice(effectivePrice)}
      </p>
    </div>
  )
}

