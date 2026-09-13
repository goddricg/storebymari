'use client'

import { useSession } from '@/lib/auth/use-session'
import { Badge } from '@/components/ui/badge'

export function VipBadge() {
  const { user } = useSession()
  const isVipUser = user?.tier === 'vip'

  if (!isVipUser) {
    return null
  }

  return (
    <Badge className="bg-purple-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm sm:text-xs">
      VIP
    </Badge>
  )
}

