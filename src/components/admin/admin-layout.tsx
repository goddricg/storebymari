'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Users,
  Package,
  Settings,
  TrendingUp,
  DollarSign,
  FileText,
  Warehouse,
  MessageSquare,
  Wallet,
  Gift,
  Activity,
  ShieldCheck,
  ShoppingBag,
  ClipboardList,
  X,
  Tv,
  ExternalLink,
  Percent,
  Sparkles,
  Brain,
  type LucideIcon,
} from 'lucide-react'
import OperatorMimiCenter from '@/components/admin/operator-mimi-center'
import MimiKnowledgeCenter from '@/components/admin/mimi-knowledge-center'
import UsersTable from '@/components/admin/users-table'
import CategoriesTable from '@/components/admin/categories-table'
import ProductsTable from '@/components/admin/products-table'
import LocalProductsTable from '@/components/admin/local-products-table'
import LocalStockManagementTable from '@/components/admin/local-stock-management-table'
import StockManagementTable from '@/components/admin/stock-management-table'
import SettingsTable from '@/components/admin/settings-table'
import ThemeManager from '@/components/admin/theme-manager'
import LogSettingsTable from '@/components/admin/log-settings-table'
import SalesHistoryTable from '@/components/admin/sales-history-table'
import RevenueHistoryTable from '@/components/admin/revenue-history-table'
import SupportCasesTable from '@/components/admin/support-cases-table'
import DiscountSettingsTable from '@/components/admin/discount-settings-table'
import TopupSummaryTable from '@/components/admin/topup-summary-table'
import TopupReceiptsTable from '@/components/admin/topup-receipts-table'
import TopupStatementTable from '@/components/admin/topup-statement-table'
import TopupBonusRulesTable from '@/components/admin/topup-bonus-rules-table'
import GiftRulesTable from '@/components/admin/gift-rules-table'
import AnalyticsDashboard from '@/components/admin/analytics-dashboard'
import ProductSalesHistory from '@/components/admin/product-sales-history'
import AdminAuditCenter from '@/components/admin/admin-audit-center'
import PurchaseCasesTable from '@/components/admin/purchase-cases-table'
import { useSession } from '@/lib/auth/use-session'
import { isSuperAdminUser } from '@/lib/auth/roles'

// เมนูสำหรับ admin ปกติ
const ADMIN_MENU_ITEMS = [
  { id: 'operator-mimi', label: 'Operator By Mimi', icon: Sparkles },
  { id: 'mimi-training', label: 'ห้องสอนงานมิมิ', icon: Brain },
  { id: 'users', label: 'ผู้ใช้', icon: Users },
  { id: 'netflix-manage', label: 'จัดการ Account Netflix', icon: Tv, href: 'https://manage.storebymari.com' },
  { id: 'analytics', label: 'สถิติ', icon: Activity },
  { id: 'product-sales-history', label: 'ประวัติการขายสินค้า', icon: ShoppingBag },
  { id: 'support', label: 'เคสแจ้งปัญหา', icon: MessageSquare },
  { id: 'categories', label: 'หมวดหมู่', icon: Package },
  { id: 'products', label: 'สินค้า', icon: Package },
  { id: 'stock', label: 'จัดการสต็อก', icon: Warehouse },
  { id: 'discount', label: 'จัดการส่วนลด', icon: Percent },
] as const

// เมนูสำหรับ superadmin (full access)
const SUPERADMIN_MENU_ITEMS = [
  { id: 'operator-mimi', label: 'Operator By Mimi', icon: Sparkles },
  { id: 'mimi-training', label: 'ห้องสอนงานมิมิ', icon: Brain },
  { id: 'users', label: 'ผู้ใช้', icon: Users },
  { id: 'netflix-manage', label: 'จัดการ Account Netflix', icon: Tv, href: 'https://manage.storebymari.com' },
  { id: 'analytics', label: 'สถิติ', icon: Activity },
  { id: 'product-sales-history', label: 'ประวัติการขายสินค้า', icon: ShoppingBag },
  { id: 'categories', label: 'หมวดหมู่', icon: Package },
  { id: 'products', label: 'สินค้า', icon: Package },
  { id: 'stock', label: 'จัดการสต็อก', icon: Warehouse },
  { id: 'support', label: 'เคสแจ้งปัญหา', icon: MessageSquare },
  { id: 'discount', label: 'จัดการส่วนลด', icon: Percent },
  { id: 'sales', label: 'ประวัติการขาย', icon: TrendingUp },
  { id: 'gifts', label: 'ของแถม', icon: Gift },
  { id: 'topups', label: 'รายงานเติมเงิน', icon: Wallet },
  { id: 'topup-receipts', label: 'ออกบิลรายการเติมเงิน', icon: FileText },
  { id: 'statement', label: 'Statement เติมเงิน', icon: ClipboardList },
  { id: 'topup-bonus', label: 'โบนัสเติมเงิน', icon: Gift },
  { id: 'revenue', label: 'สรุปยอด', icon: DollarSign },
  { id: 'purchase-cases', label: 'Case Order / บิลเงินสด', icon: FileText },
  { id: 'settings', label: 'ตั้งค่าเว็บไซต์', icon: Settings },
  { id: 'log', label: 'ตั้งค่า Log', icon: FileText },
] as const

const CHILD_ADMIN_MENU_ITEMS = [
  { id: 'users', label: 'จัดการผู้ใช้', icon: Users },
  { id: 'netflix-manage', label: 'จัดการ Account Netflix', icon: Tv, href: 'https://manage.storebymari.com' },
  { id: 'analytics', label: 'สถิติ', icon: Activity },
  { id: 'product-sales-history', label: 'ประวัติการขายสินค้า', icon: ShoppingBag },
  { id: 'support', label: 'แจ้งปัญหา', icon: MessageSquare },
  { id: 'local-products', label: 'จัดการสินค้าภายในร้าน', icon: Package },
  { id: 'local-stock', label: 'จัดการสต๊อกสินค้าภายในร้าน', icon: Package },
  { id: 'products', label: 'จัดการราคาสินค้า', icon: Package },
  { id: 'sales', label: 'ประวัติการขาย', icon: TrendingUp },
  { id: 'topups', label: 'ประวัติเติมเงิน', icon: Wallet },
  { id: 'revenue', label: 'สรุปรายรับ/ยอดขาย', icon: DollarSign },
  { id: 'settings', label: 'ตั้งค่าเว็บไซต์', icon: Settings },
] as const

const ADMIN_AUDIT_MENU_ITEM = {
  id: 'audit',
  label: 'ตรวจสอบ Admin',
  icon: ClipboardList,
} as const

type MenuId = typeof SUPERADMIN_MENU_ITEMS[number]['id'] | typeof ADMIN_MENU_ITEMS[number]['id'] | typeof CHILD_ADMIN_MENU_ITEMS[number]['id'] | typeof ADMIN_AUDIT_MENU_ITEM['id']

type AdminRadialMenuItem = {
  readonly id: string
  readonly label: string
  readonly icon: LucideIcon
  readonly href?: string
}

function AdminRadialMenu({
  items,
  activeMenu,
  onSelect,
}: {
  items: readonly AdminRadialMenuItem[]
  activeMenu: string
  onSelect: (menuId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const closeMenu = () => setIsOpen(false)

  return (
    <div className="relative z-[60] lg:hidden">
      <button
        type="button"
        aria-label="Admin Menu / เมนูจัดการระบบ"
        aria-expanded={isOpen}
        aria-controls="admin-radial-menu"
        onClick={() => setIsOpen((current) => !current)}
        className="relative z-[72] flex size-14 shrink-0 items-center justify-center rounded-full bg-transparent p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e979a2]"
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0, scale: isOpen ? 1.04 : 1 }}
          transition={{ type: 'spring', stiffness: 620, damping: 28, mass: 0.55 }}
          className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-[#f39abb] bg-[#ffd7e5] text-[#d94d82] shadow-[0_7px_18px_rgba(217,77,130,0.24)]"
        >
          {isOpen ? <X className="size-6" /> : <ShieldCheck className="size-6" />}
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="ปิดเมนู Admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={closeMenu}
              className="fixed inset-0 z-[55] bg-[#4d2637]/28 backdrop-blur-[2px]"
            />
            <motion.div
              id="admin-radial-menu"
              role="menu"
              aria-label="เมนูจัดการระบบ"
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ type: 'spring', stiffness: 560, damping: 30, mass: 0.65 }}
              onClick={closeMenu}
              className="admin-radial-menu-panel fixed left-3 z-[70] max-h-[calc(100svh-11rem)] w-fit max-w-[calc(100vw-1.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain p-0 touch-pan-y"
            >
              <div className="flex min-w-0 flex-col">
                {items.map((item, index) => {
                  const Icon = item.icon
                  const progress = items.length <= 1 ? 0.5 : index / (items.length - 1)
                  const arcOffset = Math.round(Math.sin(progress * Math.PI) * 92)
                  const isActive = activeMenu === item.id

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.72, x: 34, y: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, scale: 0.72, x: 34, y: -10 }}
                      transition={{
                        type: 'spring',
                        stiffness: 720,
                        damping: 34,
                        mass: 0.6,
                        delay: index * 0.035,
                      }}
                      className="relative flex min-h-[62px] w-fit max-w-full items-start"
                      style={{ marginLeft: `${10 + arcOffset}px` }}
                    >
                      {item.href ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            closeMenu()
                          }}
                          className="flex min-h-14 w-[min(13rem,calc(100vw-4.5rem))] items-center justify-between gap-3 rounded-2xl border-2 border-[#f4b0c8] bg-white/96 px-4 py-3 text-left text-sm font-semibold text-[#7f485c] shadow-[0_8px_18px_rgba(217,77,130,0.16)] transition-colors hover:border-[#e979a2] hover:bg-[#fff4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e979a2]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className="size-5 shrink-0 text-[#e979a2]" />
                            <span className="leading-tight truncate">{item.label}</span>
                          </div>
                          <ExternalLink className="size-4 shrink-0 text-[#e979a2]/70" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation()
                            onSelect(item.id)
                            closeMenu()
                          }}
                          className={cn(
                            'flex min-h-14 w-[min(13rem,calc(100vw-4.5rem))] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold shadow-[0_8px_18px_rgba(217,77,130,0.16)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e979a2]',
                            isActive
                              ? 'border-[#e979a2] bg-[#fff0f6] font-bold text-[#d94d82]'
                              : 'border-[#f4b0c8] bg-white/96 text-[#7f485c] hover:border-[#e979a2] hover:bg-[#fff4f8]'
                          )}
                        >
                          <Icon className="size-5 shrink-0 text-[#e979a2]" />
                          <span className="leading-tight">{item.label}</span>
                        </button>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default function AdminLayout() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useSession()
  
  // ตรวจสอบ role ของผู้ใช้
  const isSuperAdmin = isSuperAdminUser(user)
  // เลือกเมนูตาม role และไซต์
  const isChildSite = Boolean(process.env.NEXT_PUBLIC_SITE_ID && process.env.NEXT_PUBLIC_SITE_ID !== 'main')
  
  const MENU_ITEMS = isChildSite
    ? CHILD_ADMIN_MENU_ITEMS
    : (isSuperAdmin ? [...SUPERADMIN_MENU_ITEMS, ADMIN_AUDIT_MENU_ITEM] : ADMIN_MENU_ITEMS)
  
  // Initialize from URL params
  const menuFromUrl = (() => {
    const menu = searchParams.get('menu') as MenuId | null
    if (menu && menu !== 'netflix-manage' && MENU_ITEMS.some((item) => item.id === menu)) {
      return menu
    }
    // Default menu ตาม role
    if (isChildSite) return 'users'
    return isSuperAdmin ? 'users' : 'support'
  })()
  
  const [activeMenu, setActiveMenu] = useState<MenuId>(menuFromUrl)

  useEffect(() => {
    const menu = searchParams.get('menu') as MenuId | null
    if (menu && menu !== 'netflix-manage' && MENU_ITEMS.some((item) => item.id === menu) && menu !== activeMenu) {
      setActiveMenu(menu)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, MENU_ITEMS])

  const handleMenuClick = (menuId: MenuId) => {
    setActiveMenu(menuId)
    router.push(`/admin?menu=${menuId}`, { scroll: false })
  }

  const renderContent = () => {
    switch (activeMenu) {
      case 'users':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl text-[#0B0B0B]">จัดการผู้ใช้</CardTitle>
                <p className="text-sm text-[#9a5832]">
                  ค้นหาและปรับสิทธิ์การใช้งานให้เหมาะสมกับบทบาทของผู้ใช้
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <UsersTable isChildSite={isChildSite} />
            </CardContent>
          </Card>
        )
      case 'analytics':
        return <AnalyticsDashboard />
      case 'product-sales-history':
        return <ProductSalesHistory />
      case 'categories':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">จัดการหมวดหมู่</CardTitle>
              <p className="text-sm text-[#9a5832]">
                เพิ่ม แก้ไข และลบหมวดหมู่สินค้า
              </p>
            </CardHeader>
            <CardContent>
              <CategoriesTable />
            </CardContent>
          </Card>
        )
      case 'products':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl text-[#0B0B0B]">จัดการสินค้า</CardTitle>
                <p className="text-sm text-[#9a5832]">
                  เพิ่ม แก้ไข และลบสินค้า รวมถึงจัดการหมวดหมู่สินค้า
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ProductsTable />
            </CardContent>
          </Card>
        )
      case 'local-products':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl text-[#0B0B0B]">จัดการสินค้าภายในร้าน</CardTitle>
                <p className="text-sm text-[#9a5832]">
                  เพิ่ม แก้ไข และลบสินค้าเฉพาะภายในร้านของคุณเท่านั้น
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <LocalProductsTable />
            </CardContent>
          </Card>
        )
      case 'local-stock':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">จัดการสต๊อกสินค้าภายในร้าน</CardTitle>
              <p className="text-sm text-[#9a5832]">
                ดูและจัดการสต๊อกสินค้า (ไอดีเกม, รหัสผ่าน ฯลฯ) ภายในร้านของคุณ
              </p>
            </CardHeader>
            <CardContent>
              <LocalStockManagementTable />
            </CardContent>
          </Card>
        )
      case 'stock':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">จัดการสต็อก</CardTitle>
              <p className="text-sm text-[#9a5832]">
                จัดการรายละเอียดบัญชี (Email และ Password) สำหรับแต่ละสินค้า
              </p>
            </CardHeader>
            <CardContent>
              <StockManagementTable />
            </CardContent>
          </Card>
        )
      case 'support':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl text-[#0B0B0B]">จัดการเคสแจ้งปัญหา</CardTitle>
                <p className="text-sm text-[#9a5832]">
                  ติดตามและจัดการเคสแจ้งปัญหาจากลูกค้า
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <SupportCasesTable />
            </CardContent>
          </Card>
        )
      case 'sales':
        if (!isChildSite && !isSuperAdmin) return null
        return (
          <div className="space-y-6">
            <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
              <CardContent className="pt-6">
                <SalesHistoryTable isLocal={false} />
              </CardContent>
            </Card>
            <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
              <CardContent className="pt-6">
                <SalesHistoryTable isLocal={true} />
              </CardContent>
            </Card>
          </div>
        )
      case 'revenue':
        if (!isChildSite && !isSuperAdmin) return null
        return (
          <div className="space-y-6">
            <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
              <CardContent className="pt-6">
                <RevenueHistoryTable isLocal={false} />
              </CardContent>
            </Card>
            <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
              <CardContent className="pt-6">
                <RevenueHistoryTable isLocal={true} />
              </CardContent>
            </Card>
          </div>
        )
      case 'topups':
        if (!isChildSite && !isSuperAdmin) return null
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">ประวัติการเติมเงิน</CardTitle>
              <p className="text-sm text-[#9a5832]">
                ดูยอดเติมเงินย้อนหลัง แยกตามลูกค้า พร้อมยอดรวมและตัวกรองช่วงเวลา
              </p>
            </CardHeader>
            <CardContent>
              <TopupSummaryTable />
            </CardContent>
          </Card>
        )
      case 'purchase-cases':
        if (!isSuperAdmin) return null
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">Case Order / บิลเงินสด</CardTitle>
              <p className="text-sm text-[#9a5832]">ตรวจสอบคำสั่งซื้อที่จัดกลุ่มแล้ว และเปิดพิมพ์ Receipt ของทุก Order</p>
            </CardHeader>
            <CardContent>
              <PurchaseCasesTable />
            </CardContent>
          </Card>
        )
      case 'topup-bonus':
        if (isChildSite || !isSuperAdmin) return null
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">โบนัสการเติมเงิน</CardTitle>
              <p className="text-sm text-[#9a5832]">
                กำหนดยอดเติมเงินและโบนัสพ้อยท์ที่ลูกค้าจะได้รับ โดยแต่ละโปรโมชั่นใช้สิทธิ์ได้ไม่เกิน 2 ครั้งต่อวัน
              </p>
            </CardHeader>
            <CardContent>
              <TopupBonusRulesTable />
            </CardContent>
          </Card>
        )
      case 'topup-receipts':
        if (isChildSite || !isSuperAdmin) return null
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">ออกบิลรายการเติมเงิน</CardTitle>
              <p className="text-sm text-[#9a5832]">
                แสดงรายการใบเสร็จเติมพ้อยท์ที่ออกแล้ว พร้อมเลขที่บิล และเปิดพิมพ์เอกสารได้
              </p>
            </CardHeader>
            <CardContent>
              <TopupReceiptsTable />
            </CardContent>
          </Card>
        )
      case 'statement':
        if (isChildSite || !isSuperAdmin) return null
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">Statement เติมเงิน</CardTitle>
              <p className="text-sm text-[#9a5832]">
                ตรวจสอบยอดโอนเข้าบัญชี หจก.มาริ สตูดิโอ แยก SYSTEM และ Manual By Admin พร้อมเลขที่ใบเสร็จอ้างอิง
              </p>
            </CardHeader>
            <CardContent>
              <TopupStatementTable />
            </CardContent>
          </Card>
        )
      case 'gifts':
        if (!isSuperAdmin) {
          return null
        }
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">ของแถม</CardTitle>
              <p className="text-sm text-[#9a5832]">
                กำหนดของแถมที่ลูกค้าสามารถเลือกได้ตอนสั่งซื้อ โดยอิงจากสินค้าในร้านค้า
              </p>
            </CardHeader>
            <CardContent>
              <GiftRulesTable />
            </CardContent>
          </Card>
        )
      case 'discount':
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">จัดการส่วนลด</CardTitle>
              <p className="text-sm text-[#9a5832]">
                ตั้งค่าเปอร์เซ็นต์ส่วนลดที่แสดงในราคาเดิม
              </p>
            </CardHeader>
            <CardContent>
              <DiscountSettingsTable />
            </CardContent>
          </Card>
        )
      case 'settings':
        // superadmin หรือ admin ของเว็ปลูกเท่านั้นที่เห็นเมนูนี้
        if (!isSuperAdmin && !isChildSite) {
          return null
        }
        return (
          <div className="space-y-6">
            {!isChildSite && isSuperAdmin ? <ThemeManager /> : null}
            <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
              <CardHeader>
                <CardTitle className="text-xl text-[#0B0B0B]">ตั้งค่าเว็บไซต์</CardTitle>
                <p className="text-sm text-[#9a5832]">
                  จัดการการตั้งค่าระบบเติมเงิน RDCW API บัญชีผู้รับเงิน และข้อมูลเว็บไซต์
                </p>
              </CardHeader>
              <CardContent>
                <SettingsTable isMainSite={!isChildSite} />
              </CardContent>
            </Card>
          </div>
        )
      case 'log':
        // เฉพาะ superadmin เท่านั้นที่เห็นเมนูนี้
        if (!isSuperAdmin) {
          return null
        }
        return (
          <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-[#0B0B0B]">ตั้งค่า Log</CardTitle>
              <p className="text-sm text-[#9a5832]">
                ตั้งค่า Discord webhook URLs สำหรับแจ้งเตือนการเติมพ้อย การซื้อสินค้า และ Admin Actions
              </p>
            </CardHeader>
            <CardContent>
              <LogSettingsTable />
            </CardContent>
          </Card>
        )
      case 'audit':
        if (isChildSite || !isSuperAdmin) {
          return null
        }
        return <AdminAuditCenter />
      case 'operator-mimi':
        return <OperatorMimiCenter />
      case 'mimi-training':
        return <MimiKnowledgeCenter />
      default:
        return null
    }
  }

  return (
    <section
      data-admin-shell
      className="min-h-screen bg-[var(--theme-color-bg-bottom)] pt-4 pb-8 sm:pt-6 sm:pb-12"
    >
      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar */}
          <aside className="w-full lg:w-64 lg:shrink-0">
            <AdminRadialMenu
              items={MENU_ITEMS}
              activeMenu={activeMenu}
              onSelect={(menuId) => handleMenuClick(menuId as MenuId)}
            />
            <div className="hidden lg:block">
            <Card className="sticky top-24 rounded-lg border border-[#fed7aa]/60 bg-white/95 shadow-sm shadow-[var(--theme-color)]/10">
              <CardContent className="p-2">
                <nav className="flex flex-row overflow-x-auto gap-2 pb-2 lg:flex-col lg:space-y-1 lg:gap-0 lg:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {MENU_ITEMS.map((item) => {
                    const Icon = item.icon
                    const isActive = activeMenu === item.id
                    const href = 'href' in item ? (item as { href?: string }).href : undefined

                    if (href) {
                      return (
                        <a
                          key={item.id}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors whitespace-nowrap shrink-0 lg:w-full lg:shrink text-[#0B0B0B] hover:bg-[#F9FAFB] hover:text-[#d94d82] group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className="size-4 shrink-0 text-[#9a5832] group-hover:text-[#d94d82] transition-colors" />
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          <ExternalLink className="size-3.5 shrink-0 text-[#9a5832]/60 group-hover:text-[#d94d82] transition-colors" />
                        </a>
                      )
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleMenuClick(item.id as MenuId)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors whitespace-nowrap shrink-0 lg:w-full lg:shrink',
                          isActive
                            ? 'bg-[var(--theme-color)]/10 text-[var(--theme-color)]'
                            : 'text-[#0B0B0B] hover:bg-[#F9FAFB]'
                        )}
                      >
                        <Icon className={cn('size-4 shrink-0', isActive ? 'text-[var(--theme-color)]' : 'text-[#9a5832]')} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </CardContent>
            </Card>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {renderContent()}
          </main>
        </div>
      </div>
    </section>
  )
}

