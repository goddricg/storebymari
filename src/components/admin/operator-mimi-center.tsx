'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Send,
  Bell,
  Bot,
  History,
  PackagePlus,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Users,
  Smartphone,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  Link2,
  Mail,
  Brain,
  Wand2,
  Clock,
  Calendar,
  Play,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useSession } from '@/lib/auth/use-session'
import { SITE_BRAND_PWA_ICON_192_PATH } from '@/lib/site-branding'

interface BroadcastRecord {
  id: string;
  title: string;
  body: string;
  url: string | null;
  target: string;
  senderName: string | null;
  recipientsCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

interface RestockEvent {
  id: string;
  productId?: string;
  productName: string;
  addedCount: number;
  remainingStock: number;
  previousStock: number;
  currentLiveStock: number;
  currentPrice?: string;
  isPublished?: boolean;
  actorName: string;
  actorEmail: string;
  occurredAt: string;
}

interface PromoScheduleSlot {
  id: string;
  productId: string;
  productName: string;
  scheduledTime: string;
  timeFormatted: string;
  status: "pending" | "sent" | "skipped_out_of_stock" | "skipped_expired" | "failed";
  sentAt?: string;
  broadcastId?: string;
  liveStockAtTrigger?: number;
  error?: string;
}

interface DailyPromoScheduleState {
  date: string;
  timesPerProduct: number;
  enabled: boolean;
  totalSlots: number;
  completedSlots: number;
  pendingSlots: number;
  slots: PromoScheduleSlot[];
  lastRunAt?: string;
  generatedAt: string;
}

export default function OperatorMimiCenter() {
  const { user } = useSession()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [target, setTarget] = useState('ALL')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)

  // MCP Integration State
  const [origin, setOrigin] = useState('https://storebymari.com')
  const [isCopied, setIsCopied] = useState(false)
  const [isTestingMcp, setIsTestingMcp] = useState(false)
  const [mcpTestResult, setMcpTestResult] = useState<{
    success: boolean;
    server?: string;
    version?: string;
    latency?: number;
    tools?: { name: string; description: string }[];
    error?: string;
  } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  // Never put the MCP server secret in a client bundle or URL. The dashboard
  // is already behind the admin session; external MCP clients authenticate
  // with the server-only MCP_SECRET_KEY in their own connector settings.
  const mcpApiUrl = `${origin}/api/mcp`
  const mcpRootUrl = `${origin}/mcp`

  const handleCopyUrl = (urlToCopy: string) => {
    navigator.clipboard.writeText(urlToCopy)
    setIsCopied(true)
    toast.success('คัดลอก URL สำหรับ Gemini Spark เรียบร้อยแล้วค่ะ!')
    setTimeout(() => setIsCopied(false), 2500)
  }

  const handleTestMcp = async () => {
    setIsTestingMcp(true)
    setMcpTestResult(null)
    const startTime = performance.now()
    try {
      // Same-origin cookies authenticate the dashboard request. A remote
      // connector must send its Authorization header separately.
      const res = await fetch('/api/mcp')
      const elapsed = Math.round(performance.now() - startTime)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setMcpTestResult({
        success: true,
        server: data.server,
        version: data.version,
        latency: elapsed,
        tools: data.tools || [],
      })
      toast.success(`เชื่อมต่อ MCP สำเร็จ (${elapsed}ms) ระบบพร้อมใช้งาน 100%!`)
    } catch (err: any) {
      setMcpTestResult({
        success: false,
        error: err?.message || 'ไม่สามารถเชื่อมต่อ MCP Server ได้',
      })
      toast.error(`การทดสอบล้มเหลว: ${err?.message}`)
    } finally {
      setIsTestingMcp(false)
    }
  }

  const [isTestingEmail, setIsTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{
    success: boolean;
    recipient?: string;
    messageId?: string;
    timestamp?: string;
    error?: string;
  } | null>(null)

  const handleTestEmail = async () => {
    setIsTestingEmail(true)
    setEmailTestResult(null)
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'restock' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'ส่งอีเมลทดสอบไม่สำเร็จ')
      }
      setEmailTestResult({
        success: true,
        recipient: data.recipient,
        messageId: data.messageId,
        timestamp: data.timestamp,
      })
      toast.success('ส่งอีเมลแจ้งเตือนสต็อกไปยังที่อยู่ที่ตั้งค่าไว้สำเร็จแล้ว!')
    } catch (err: any) {
      setEmailTestResult({
        success: false,
        error: err?.message || 'ส่งอีเมลไม่สำเร็จ',
      })
      toast.error(`ส่งอีเมลไม่สำเร็จ: ${err?.message}`)
    } finally {
      setIsTestingEmail(false)
    }
  }

  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([])
  const [restocks, setRestocks] = useState<RestockEvent[]>([])
  const [lastResult, setLastResult] = useState<{
    total: number;
    sent: number;
    failed: number;
  } | null>(null)

  const TEST_PRODUCTS_LIST = [
    { name: 'Netflix 4K Ultra HD (30 วัน)', amount: 20, remaining: 25 },
    { name: 'YouTube Premium (ไร้โฆษณา)', amount: 15, remaining: 30 },
    { name: 'Spotify Premium (30 วัน)', amount: 10, remaining: 18 },
    { name: 'Disney+ Hotstar VIP (30 วัน)', amount: 25, remaining: 25 },
    { name: 'Viu Premium พากย์ไทยไม่อั้น', amount: 12, remaining: 15 },
    { name: 'Canva Pro ตลอดชีพ', amount: 8, remaining: 10 },
  ]

  const [autopilotEnabled, setAutopilotEnabled] = useState(true)
  const [isTogglingAutopilot, setIsTogglingAutopilot] = useState(false)
  const [promoEnabled, setPromoEnabled] = useState(true)
  const [timesPerProduct, setTimesPerProduct] = useState(2)
  const [promoSchedule, setPromoSchedule] = useState<DailyPromoScheduleState | null>(null)
  const [isTogglingPromo, setIsTogglingPromo] = useState(false)
  const [isRegeneratingSchedule, setIsRegeneratingSchedule] = useState(false)
  const [isTriggeringNext, setIsTriggeringNext] = useState(false)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [testProductIndex, setTestProductIndex] = useState(0)
  const [aiGeneratedCopy, setAiGeneratedCopy] = useState<{
    title: string;
    body: string;
    modelUsed?: string;
    testItem?: string;
  } | null>(null)

  const fetchData = async () => {
    setIsLoadingData(true)
    try {
      const res = await fetch('/api/admin/broadcast')
      if (!res.ok) throw new Error('Failed to fetch data')
      const data = await res.json()
      if (data.success) {
        setBroadcasts(data.broadcasts || [])
        setRestocks(data.recentRestocks || [])
      }

      // Fetch autopilot and promo schedule status
      const apRes = await fetch('/api/admin/mimi/autopilot')
      if (apRes.ok) {
        const apData = await apRes.json()
        setAutopilotEnabled(apData.enabled)
        setPromoEnabled(apData.promoEnabled ?? true)
        setTimesPerProduct(apData.timesPerProduct ?? 2)
        setPromoSchedule(apData.schedule || null)
      }
    } catch (err: any) {
      console.error(err)
      toast.error('ไม่สามารถโหลดข้อมูล Broadcast และ Restock ได้')
    } finally {
      setIsLoadingData(false)
    }
  }

  const handleTogglePromo = async (checked: boolean) => {
    setIsTogglingPromo(true)
    try {
      const res = await fetch('/api/admin/mimi/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_promo', enabled: checked }),
      })
      const data = await res.json()
      if (data.success) {
        setPromoEnabled(checked)
        if (data.schedule) setPromoSchedule(data.schedule)
        toast.success(
          checked
            ? 'เปิดระบบสุ่มโปรโมทสินค้าอัตโนมัติสำเร็จ! มิมิจะคอยยิงกระจายเวลาตลอดวันค่ะ'
            : 'ปิดระบบสุ่มโปรโมทรายวันชั่วคราวแล้วค่ะ'
        )
      } else {
        throw new Error(data.message || 'บันทึกไม่สำเร็จ')
      }
    } catch (err: any) {
      toast.error(`ไม่สามารถเปลี่ยนสถานะได้: ${err?.message}`)
    } finally {
      setIsTogglingPromo(false)
    }
  }

  const handleSetQuota = async (quota: number) => {
    try {
      const res = await fetch('/api/admin/mimi/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_quota', quota }),
      })
      const data = await res.json()
      if (data.success) {
        setTimesPerProduct(quota)
        if (data.schedule) setPromoSchedule(data.schedule)
        toast.success(`ปรับโควต้าเป็น ${quota} ครั้ง/สินค้า/วัน และสร้างตารางเวลาใหม่เรียบร้อยแล้วค่ะ! ✨`)
      }
    } catch (err: any) {
      toast.error(`ปรับโควต้าไม่สำเร็จ: ${err?.message}`)
    }
  }

  const handleRegenerateSchedule = async () => {
    setIsRegeneratingSchedule(true)
    try {
      const res = await fetch('/api/admin/mimi/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate_schedule' }),
      })
      const data = await res.json()
      if (data.success && data.schedule) {
        setPromoSchedule(data.schedule)
        toast.success('สุ่มสร้างตารางเวลาโปรโมทใหม่ประจำวันเรียบร้อยแล้วค่ะ! 🎲✨')
      }
    } catch (err: any) {
      toast.error(`สร้างตารางไม่สำเร็จ: ${err?.message}`)
    } finally {
      setIsRegeneratingSchedule(false)
    }
  }

  const handleTriggerNextPromo = async () => {
    setIsTriggeringNext(true)
    try {
      const res = await fetch('/api/admin/mimi/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_next' }),
      })
      const data = await res.json()
      if (data.success) {
        if (data.schedule) setPromoSchedule(data.schedule)
        toast.success(data.message || 'ยิงคิวโปรโมทสำเร็จแล้วค่ะ!')
        fetchData()
      } else {
        toast.error(data.message || 'ไม่สามารถยิงคิวได้')
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err?.message}`)
    } finally {
      setIsTriggeringNext(false)
    }
  }

  const handleToggleAutopilot = async (checked: boolean) => {
    setIsTogglingAutopilot(true)
    try {
      const res = await fetch('/api/admin/mimi/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checked }),
      })
      const data = await res.json()
      if (data.success) {
        setAutopilotEnabled(checked)
        toast.success(
          checked
            ? 'เปิดโหมด Mimi AI Auto-Pilot สำเร็จ! เติมสต็อกปุ๊บ มิมิจะยิงแจ้งเตือนทันที'
            : 'ปิดโหมด Auto-Pilot ชั่วคราวแล้วค่ะ'
        )
      } else {
        throw new Error(data.message || 'บันทึกไม่สำเร็จ')
      }
    } catch (err: any) {
      toast.error(`ไม่สามารถเปลี่ยนสถานะได้: ${err?.message}`)
    } finally {
      setIsTogglingAutopilot(false)
    }
  }

  const handleTestGenerateAi = async (overrideIndex?: number) => {
    setIsGeneratingAi(true)
    const nextIdx =
      typeof overrideIndex === 'number'
        ? overrideIndex
        : (testProductIndex + 1) % TEST_PRODUCTS_LIST.length
    setTestProductIndex(nextIdx)
    const target = TEST_PRODUCTS_LIST[nextIdx]

    try {
      const res = await fetch('/api/admin/mimi/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_generate',
          productName: target.name,
          amount: target.amount,
          remainingStock: target.remaining,
        }),
      })
      const data = await res.json()
      if (data.success && data.copy) {
        setAiGeneratedCopy({
          ...data.copy,
          testItem: `${target.name} (+${target.amount})`,
        })
        toast.success(`มิมิคิดคำให้ "${target.name}" สำเร็จแล้วจ้า! ✨`)
      } else {
        throw new Error(data.message || 'ไม่สามารถ Generate ได้')
      }
    } catch (err: any) {
      toast.error(`Generate ไม่สำเร็จ: ${err?.message}`)
    } finally {
      setIsGeneratingAi(false)
    }
  }

  const handleApplyAiGenerated = () => {
    if (!aiGeneratedCopy) return
    setTitle(aiGeneratedCopy.title)
    setBody(aiGeneratedCopy.body)
    setUrl('/products')
    toast.success('นำข้อความของมิมิไปใส่ในฟอร์มประกาศเรียบร้อยแล้วค่ะ!')
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('กรุณากรอกหัวข้อแจ้งเตือน')
      return
    }
    if (!body.trim()) {
      toast.error('กรุณากรอกข้อความแจ้งเตือน')
      return
    }

    setIsSubmitting(true)
    setLastResult(null)

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || undefined,
          target,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ส่งแจ้งเตือนไม่สำเร็จ')
      }

      setLastResult(data.dispatchResult)
      toast.success(`ส่งแจ้งเตือนสำเร็จ! ยิงออกไปยัง ${data.dispatchResult.sent} เครื่อง`)
      setTitle('')
      setBody('')
      setUrl('')
      fetchData()
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || 'เกิดข้อผิดพลาดในการส่งแจ้งเตือน')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApplyRestockToForm = (item: RestockEvent) => {
    const liveStock = typeof item.currentLiveStock === 'number' ? item.currentLiveStock : item.remainingStock;
    setTitle(`🔥 คืนนี้ดูไรดีเตง? ${item.productName} พร้อมส่งแล้วน้า ✨`)
    setBody(`มิมิแอบเอาสต็อก ${item.productName} มาอัปเดตให้แล้วน้าา (เหลือ ${liveStock} ชิ้น) พร้อมส่งใน 1 วิ รีบมากดเลย เดี๋ยวหมดนะคนดี~ 💕`)
    setUrl('/products')
    toast.info('ดึงข้อมูลสินค้าพร้อมสต็อก Real-time เข้าฟอร์มเรียบร้อยแล้วค่ะ!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#201030] via-[#2d123e] to-[#1c0d29] p-6 sm:p-8 text-white shadow-xl border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 text-xs font-semibold tracking-wide border border-pink-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Operator Command Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span>Operator By Mimi</span>
              <Badge className="bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0 text-xs font-normal">
                Gemini Spark
              </Badge>
            </h1>
            <p className="text-sm sm:text-base text-pink-200/80 max-w-2xl leading-relaxed">
              ศูนย์ปฏิบัติการ AI ของมิมิ สำหรับสร้างและยิงการแจ้งเตือนแบบ Push Notification 
              เข้าโทรศัพท์มือถือของผู้ใช้ทุกคน พร้อมระบบติดตาม Log การเติมสต็อกสินค้าจากแอดมิน
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={isLoadingData}
              className="bg-white/5 border-white/20 text-white hover:bg-white/15 gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>รีเฟรชข้อมูล</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Section 0: Gemini Spark MCP Integration Hub */}
      <Card className="border-pink-500/30 bg-gradient-to-br from-card via-card to-pink-500/5 shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/40 pb-4 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-pink-500/20 shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <span>Gemini Spark MCP Integration</span>
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online & Ready
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  เชื่อมต่อมิมิ (Gemini Spark) ผ่านมาตรฐาน Remote Model Context Protocol (MCP) ให้สั่งการระบบผ่านแชทได้ทันที
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestMcp}
                disabled={isTestingMcp}
                className="border-pink-500/30 text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 gap-1.5 text-xs h-9 font-medium"
              >
                {isTestingMcp ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังทดสอบ...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-pink-500" />
                    <span>ทดสอบเชื่อมต่อ (Test Handshake)</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* MCP URL Copy Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-primary" />
                <span>URL สำหรับใส่ใน Gemini Spark (&quot;Custom apps for Spark&quot;)</span>
              </label>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>แดชบอร์ดใช้ Admin Session</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Input
                  readOnly
                  value={mcpApiUrl}
                  className="font-mono text-xs sm:text-sm bg-muted/60 pr-10 select-all focus-visible:ring-pink-500"
                />
              </div>
              <Button
                type="button"
                onClick={() => handleCopyUrl(mcpApiUrl)}
                className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white gap-2 text-xs sm:text-sm font-semibold shrink-0 shadow-md shadow-pink-500/20"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>คัดลอกเรียบร้อย!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>คัดลอก URL</span>
                  </>
                )}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-2 pt-1">
              <span>
                หรือใช้ Root Endpoint: <code className="font-mono text-primary font-semibold cursor-pointer hover:underline" onClick={() => handleCopyUrl(mcpRootUrl)}>{mcpRootUrl}</code>
              </span>
              <button
                type="button"
                onClick={() => handleCopyUrl(mcpRootUrl)}
                className="text-[11px] text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>คัดลอก URL สำรอง</span>
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              การทดสอบจากหน้านี้ใช้ session ของแอดมินโดยอัตโนมัติ ส่วน Gemini Spark หรือไคลเอนต์ภายนอกต้องส่ง
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">Authorization: Bearer</code>
              ด้วยคีย์ MCP ที่เก็บไว้ฝั่งเซิร์ฟเวอร์ ไม่ต้องใส่คีย์ลงใน URL ค่ะ
            </p>
          </div>

          {/* Test Handshake Result Banner */}
          {mcpTestResult && (
            <div
              className={`p-4 rounded-xl border text-xs sm:text-sm transition-all ${
                mcpTestResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                  : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}
            >
              {mcpTestResult.success ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>
                      MCP Server พร้อมใช้งาน 100%! ตอบกลับใน {mcpTestResult.latency} ms (Server: {mcpTestResult.server} v{mcpTestResult.version})
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold mb-1 opacity-90">เครื่องมือ (Tools) ที่มิมิจะได้รับอัตโนมัติ:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {mcpTestResult.tools?.map((tool) => (
                        <Badge
                          key={tool.name}
                          variant="secondary"
                          className="font-mono text-[11px] bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                        >
                          🛠️ {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>การทดสอบล้มเหลว: {mcpTestResult.error}</span>
                </div>
              )}
            </div>
          )}

          {/* 3-Step Setup Guide */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 sm:p-5 space-y-3">
            <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-500" />
              <span>วิธีตั้งค่าเชื่อมต่อกับ Gemini Spark (ทำครั้งเดียวใช้งานได้ตลอดไป)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-card border border-border/40 space-y-1">
                <div className="font-bold text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-pink-500/15 flex items-center justify-center text-[11px]">1</span>
                  <span>เข้าสู่ระบบ Gemini</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  เปิด <b>gemini.google.com</b> บนคอมพิวเตอร์ แล้วไปที่ <b>Settings & help</b> (ปุ่มฟันเฟือง) &gt; <b>Connected Apps</b>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border/40 space-y-1">
                <div className="font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-purple-500/15 flex items-center justify-center text-[11px]">2</span>
                  <span>เพิ่ม Custom app</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  มองหาหัวข้อ <b>Custom apps for Spark</b> กดปุ่ม <b>Add a custom app</b> แล้ววาง URL จากด้านบนลงไปแล้วกด <b>Next</b>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border/40 space-y-1">
                <div className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/15 flex items-center justify-center text-[11px]">3</span>
                  <span>สั่งการผ่านแชท</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  คุยกับมิมิใน Gemini ได้ทันที เช่น &quot;<i>มิมิ ช่วยส่งประกาศ Push Notification ไปที่มือถือทุกคนว่า เติมสต็อก Netflix แล้ว</i>&quot;
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mimi AI Auto-Pilot Controller */}
      <Card className="border-pink-500/30 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 shadow-md">
        <CardContent className="p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/25 shrink-0">
              <Brain className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-foreground">
                  Mimi AI Auto-Pilot (ระบบคิดคำและยิงแจ้งเตือนอัตโนมัติ 24 ชม.)
                </h3>
                <Badge className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 text-[11px] font-medium">
                  Gemini 3.6 Flash
                </Badge>
                {autopilotEnabled ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Auto-Pilot ทำงานอยู่
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    ปิดใช้งานชั่วคราว
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
                เมื่อแอดมินเติมสต็อกสินค้าในเว็บ ระบบจะส่งข้อมูลให้มิมิ (Google Gemini) คิดคำสโลแกนน่ารักๆ 
                และยิง Web Push Notification เข้าหน้าจอมือถือลูกค้าทุกคนทันทีอัตโนมัติ โดยไม่ต้องมีคนสั่ง!
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
            <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-background/80 border border-border/60">
              <span className="text-xs font-semibold text-foreground">เปิดโหมดออโต้:</span>
              <Switch
                checked={autopilotEnabled}
                onCheckedChange={handleToggleAutopilot}
                disabled={isTogglingAutopilot}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTestGenerateAi()}
              disabled={isGeneratingAi}
              className="border-pink-500/30 text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 gap-1.5 text-xs h-9 font-medium shadow-sm"
            >
              {isGeneratingAi ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>มิมิกำลังคิดคำ...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 text-pink-500" />
                  <span>ทดสอบให้มิมิคิดคำ (สุ่มสินค้า)</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>

        {/* AI Generated Result Banner */}
        {aiGeneratedCopy && (
          <div className="px-5 sm:px-6 pb-5 pt-0">
            <div className="p-4 rounded-xl bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-purple-500/10 border border-pink-500/30 shadow-inner space-y-3 animate-in fade-in duration-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-pink-600 dark:text-pink-400 flex flex-wrap items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-pink-500" />
                  <span>
                    ข้อความจากมิมิ AI {aiGeneratedCopy.modelUsed ? `(${aiGeneratedCopy.modelUsed.replace('models/', '')})` : ''}
                  </span>
                  {aiGeneratedCopy.testItem && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-pink-500/20 text-pink-700 dark:text-pink-300 font-semibold border border-pink-500/30">
                      🎯 สินค้าจำลอง: {aiGeneratedCopy.testItem}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestGenerateAi()}
                    disabled={isGeneratingAi}
                    className="text-xs h-7 gap-1 font-medium border-pink-500/30 text-pink-600 dark:text-pink-400 hover:bg-pink-500/10"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>สุ่มประโยค/สินค้าใหม่ 🎲</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleApplyAiGenerated}
                    className="text-xs h-7 gap-1 font-semibold bg-pink-500 text-white hover:bg-pink-600 dark:bg-pink-600 dark:hover:bg-pink-700 shadow-sm"
                  >
                    <Copy className="w-3 h-3" />
                    <span>นำไปใส่ในฟอร์มประกาศ</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 pl-3 border-l-2 border-pink-500/70 bg-background/70 p-3 rounded-r-lg border border-border/40">
                <div className="text-sm font-bold text-foreground">
                  {aiGeneratedCopy.title}
                </div>
                <div className="text-xs text-foreground/85 leading-relaxed">
                  {aiGeneratedCopy.body}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Main Grid: Form + Live Mobile Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Broadcast Form */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-border/60 shadow-md bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                <Send className="w-5 h-5 text-primary" />
                <span>Features ประกาศแจ้งเตือน (Broadcast Push)</span>
              </CardTitle>
              <CardDescription>
                กรอกข้อความที่ต้องการส่งแจ้งเตือน ข้อความจะเด้งบนหน้าจอโทรศัพท์มือถือของผู้ใช้ทุกคนทันที
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Title Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="broadcast-title" className="text-sm font-semibold text-foreground">
                      หัวข้อแจ้งเตือน (Notification Title) <span className="text-destructive">*</span>
                    </label>
                    <span className="text-xs text-muted-foreground">{title.length}/100</span>
                  </div>
                  <Input
                    id="broadcast-title"
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="หัวข้อแจ้งเตือนบนมือถือ... (เช่น เติมสต็อก Netflix แล้วจ้า!)"
                    maxLength={100}
                    required
                    className="bg-background text-base focus-visible:ring-primary"
                  />
                </div>

                {/* Message Body Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="broadcast-body" className="text-sm font-semibold text-foreground">
                      ข้อความแจ้งเตือน (Notification Message/Body) <span className="text-destructive">*</span>
                    </label>
                    <span className="text-xs text-muted-foreground">{body.length}/2000</span>
                  </div>
                  <Textarea
                    id="broadcast-body"
                    name="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="ข้อความแจ้งเตือนที่จะเด้งบนหน้าจอมือถือ... (เช่น Netflix Premium 30 วัน พร้อมส่งแล้ว 50 บัญชี รีบจับจองด่วน!)"
                    rows={4}
                    required
                    className="bg-background resize-none text-base focus-visible:ring-primary"
                  />
                </div>

                {/* Action URL Input */}
                <div className="space-y-2">
                  <label htmlFor="broadcast-url" className="text-sm font-semibold text-foreground">
                    ลิงก์ปลายทางเมื่อกดแจ้งเตือน (Action URL / Deep Link)
                  </label>
                  <Input
                    id="broadcast-url"
                    name="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://storebymari.com/products/..."
                    className="bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    ใส่พาธ เช่น <code className="text-primary font-mono">/products</code> หรือ <code className="text-primary font-mono">/cart</code> เพื่อพาลูกค้าไปหน้านั้นทันที
                  </p>
                </div>

                {/* Target Audience Select */}
                <div className="space-y-2">
                  <label htmlFor="broadcast-target" className="text-sm font-semibold text-foreground">
                    เลือกกลุ่มเป้าหมาย (Target Audience)
                  </label>
                  <select
                    id="broadcast-target"
                    name="target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="ALL">ผู้ใช้งานทุกคน (All Users)</option>
                    <option value="ADMIN">เฉพาะทีมแอดมิน (Admins Only)</option>
                    <option value="USER">เฉพาะลูกค้าทั่วไป (Customers Only)</option>
                  </select>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <Button
                    id="btn-send-broadcast"
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 text-base font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/20 gap-2 transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>กำลังยิงแจ้งเตือนเข้ามือถือทุกคน...</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-5 h-5" />
                        <span>ส่งแจ้งเตือนเข้ามือถือทุกคน</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Last Result Banner */}
                {lastResult && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-bold">ส่ง Broadcast เรียบร้อยแล้ว!</div>
                      <div>
                        ส่งสำเร็จ: <b>{lastResult.sent}</b> เครื่อง / เป้าหมายทั้งหมด: {lastResult.total} เครื่อง
                        {lastResult.failed > 0 && ` (ล้มเหลว: ${lastResult.failed})`}
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Mobile Push Preview */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-border/60 shadow-md bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                <span>ตัวอย่างการแจ้งเตือนบนหน้าจอมือถือ (Live Preview)</span>
              </CardTitle>
              <CardDescription>
                จำลองหน้าตาของ Push Notification ที่จะเด้งบนโทรศัพท์ของผู้ใช้งาน
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Phone Frame Simulator */}
              <div className="mx-auto max-w-[320px] rounded-[32px] bg-[#1a1322] p-3 shadow-2xl border-4 border-[#322340]">
                {/* Phone Notch */}
                <div className="mx-auto mb-4 h-4 w-28 rounded-full bg-black/60" />

                {/* Notification Card on Lockscreen */}
                <div className="rounded-2xl bg-white/95 dark:bg-[#251833]/95 p-3.5 shadow-lg backdrop-blur border border-white/20 text-foreground transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md overflow-hidden bg-primary/20 shrink-0">
                    <img src={SITE_BRAND_PWA_ICON_192_PATH} alt="Store by Mari" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-xs font-bold tracking-tight text-foreground/80">Appbymari</span>
                      <span className="text-[10px] text-muted-foreground">• ตอนนี้</span>
                    </div>
                    <Bell className="w-3.5 h-3.5 text-primary" />
                  </div>

                  <div className="space-y-1 pl-7">
                    <h4 className="text-xs font-bold text-foreground line-clamp-1">
                      {title.trim() || 'หัวข้อแจ้งเตือนบนมือถือ...'}
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
                      {body.trim() || 'ข้อความแจ้งเตือนที่จะเด้งบนหน้าจอมือถือลูกค้าทุกคน...'}
                    </p>
                  </div>
                </div>

                {/* Simulated Home Indicator */}
                <div className="mx-auto mt-6 h-1 w-24 rounded-full bg-white/30" />
              </div>
            </CardContent>
          </Card>

          {/* Quick Mimi Helper Card */}
          <Card className="border-pink-500/20 bg-gradient-to-br from-pink-500/5 via-purple-500/5 to-transparent shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Bot className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-foreground">มิมิ AI Operator & Email Signal</div>
                  <p className="text-muted-foreground leading-relaxed">
                    เมื่อแอดมินเติมสต็อก ระบบจะส่งอีเมลแจ้งเตือนไปยังที่อยู่ที่ตั้งค่าไว้ทันที 
                    มิมิสามารถตรวจจับและนำข้อความมากรอกประกาศที่หน้านี้ หรือยิง API <code className="text-primary font-mono">/api/admin/broadcast</code> ได้ตลอด 24 ชม.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestEmail}
                  disabled={isTestingEmail}
                  className="w-full text-xs font-semibold gap-1.5 h-8 border-pink-500/30 text-pink-600 dark:text-pink-400 hover:bg-pink-500/10"
                >
                  {isTestingEmail ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังส่งอีเมลทดสอบ...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5 text-pink-500" />
                      <span>ทดสอบส่ง Email ไปยังที่อยู่ที่ตั้งค่าไว้</span>
                    </>
                  )}
                </Button>

                {emailTestResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                      emailTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                  >
                    {emailTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                    )}
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="font-bold">
                        {emailTestResult.success ? 'ส่งอีเมลสำเร็จแล้ว!' : 'ส่งอีเมลล้มเหลว'}
                      </div>
                      {emailTestResult.success ? (
                        <div className="text-[11px] opacity-90 truncate">
                          ID: <code className="font-mono">{emailTestResult.messageId}</code>
                        </div>
                      ) : (
                        <div className="text-[11px] opacity-90">{emailTestResult.error}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 2: LOG การอัพเดท การกระทำต่างๆ จาก ADMIN (Realtime Edition) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-primary" />
              <span>Log การเติมของเข้า Stock จากแอดมิน (Admin Restock Feeds)</span>
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                Real-time Stock
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              รายการเติมสต็อกสินค้า พร้อมสถานะสต็อกคงเหลือจริงแบบ Real-time ตามที่ลูกค้าซื้อหรือแอดมินเติมเพิ่ม
            </p>
          </div>
          <Badge variant="outline" className="self-start sm:self-auto text-xs">
            {restocks.length} รายการล่าสุด
          </Badge>
        </div>

        {restocks.length === 0 ? (
          <Card className="border-border/60 bg-card">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {isLoadingData ? 'กำลังโหลดรายการ Restock...' : 'ยังไม่มีรายการเติมสต็อกสินค้าใหม่'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {restocks.map((item) => (
              <Card key={item.id} className="border-border/60 bg-card hover:border-primary/50 transition-all shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-foreground line-clamp-1">
                      {item.productName}
                    </div>
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 shrink-0 text-xs font-bold">
                      +{item.addedCount} ชิ้น
                    </Badge>
                  </div>

                  {/* Realtime Live Stock Banner */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 text-xs">
                    <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${item.currentLiveStock > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      สต็อกจริงตอนนี้:
                    </span>
                    {item.currentLiveStock > 0 ? (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        พร้อมส่ง {item.currentLiveStock} ชิ้น
                      </span>
                    ) : (
                      <span className="font-bold text-rose-500">
                        สินค้าหมดชั่วคราว (0 ชิ้น)
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>ประวัติการเติม:</span>
                      <span className="text-foreground">เดิม {item.previousStock} → เติมเป็น {item.remainingStock} ชิ้น</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ผู้เติม:</span>
                      <span className="text-foreground">{item.actorName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>เวลาเติม:</span>
                      <span>{new Date(item.occurredAt).toLocaleString('th-TH')}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/40">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleApplyRestockToForm(item)}
                      className="w-full text-xs font-semibold gap-1.5 h-8 hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span>ให้มิมิเขียนประกาศจากรายการนี้</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Section 2.5: Mimi Autonomous Daily Promo Schedule (ระบบสุ่มโปรโมทสินค้าอัตโนมัติ) */}
      <Card className="border-purple-500/30 bg-gradient-to-br from-card via-card to-purple-500/5 shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/40 pb-4 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-transparent">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground flex-wrap">
                  <span>Mimi Autonomous Daily Promo Matrix</span>
                  <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs">
                    สินค้าละ {timesPerProduct} ครั้ง/วัน
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  ระบบสุ่มเวลาและสุ่มสินค้าจาก Restock Feeds มากวดขันโปรโมทตลอดช่วง 08:30 - 00:00 น. (Quiet Hours 00:30 - 08:30 น.)
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Quota Selector */}
              <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs">
                <span className="text-muted-foreground px-2">โควต้า:</span>
                {[1, 2, 3].map((q) => (
                  <Button
                    key={q}
                    variant={timesPerProduct === q ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleSetQuota(q)}
                    className={`h-7 px-2.5 text-xs font-semibold ${
                      timesPerProduct === q
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {q} ครั้ง/วัน
                  </Button>
                ))}
              </div>

              {/* Promo Switch */}
              <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-lg border border-border/40">
                <span className="text-xs font-semibold text-foreground">
                  {promoEnabled ? 'เปิดทำงาน' : 'ปิดชั่วคราว'}
                </span>
                <Switch
                  checked={promoEnabled}
                  onCheckedChange={handleTogglePromo}
                  disabled={isTogglingPromo}
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Summary metrics bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center">
              <div className="text-xs text-muted-foreground">ตารางประจำวันที่</div>
              <div className="text-sm sm:text-base font-bold text-foreground mt-0.5 font-mono">
                {promoSchedule?.date || 'วันนี้'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
              <div className="text-xs text-purple-700 dark:text-purple-300">คิวสุ่มทั้งหมด</div>
              <div className="text-base sm:text-xl font-bold text-purple-700 dark:text-purple-300 mt-0.5">
                {promoSchedule?.totalSlots || 0} คิว
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-xs text-emerald-700 dark:text-emerald-300">ส่งสำเร็จแล้ว</div>
              <div className="text-base sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {promoSchedule?.completedSlots || 0} คิว
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="text-xs text-amber-700 dark:text-amber-300">รอดำเนินการ</div>
              <div className="text-base sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {promoSchedule?.pendingSlots || 0} คิว
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>
                {promoSchedule?.lastRunAt
                  ? `ประมวลผลรอบล่าสุดเมื่อ: ${new Date(promoSchedule.lastRunAt).toLocaleTimeString('th-TH')}`
                  : 'ยังไม่มีการยิงในวันนี้'}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateSchedule}
                disabled={isRegeneratingSchedule}
                className="text-xs gap-1.5 h-8 border-purple-500/30 hover:bg-purple-500/10"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-purple-500 ${isRegeneratingSchedule ? 'animate-spin' : ''}`} />
                <span>สุ่มตารางเวลาใหม่</span>
              </Button>

              <Button
                size="sm"
                onClick={handleTriggerNextPromo}
                disabled={isTriggeringNext}
                className="text-xs gap-1.5 h-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-sm"
              >
                {isTriggeringNext ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังยิงคิว...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>ยิงคิวถัดไปทันที (ทดสอบ)</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Slots Table / Grid */}
          {(!promoSchedule?.slots || promoSchedule.slots.length === 0) ? (
            <div className="py-6 text-center text-muted-foreground text-xs bg-muted/20 rounded-xl border border-dashed border-border/60">
              ยังไม่มีคิวโปรโมทสำหรับวันนี้ กดปุ่ม "สุ่มตารางเวลาใหม่" ด้านบนเพื่อเริ่มระบบค่ะ
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {promoSchedule.slots.map((slot, idx) => (
                <div
                  key={slot.id || idx}
                  className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between gap-2 ${
                    slot.status === 'sent'
                      ? 'bg-emerald-500/5 border-emerald-500/30'
                      : slot.status === 'skipped_out_of_stock'
                      ? 'bg-rose-500/5 border-rose-500/20 opacity-70'
                      : slot.status === 'skipped_expired'
                      ? 'bg-amber-500/5 border-amber-500/20 opacity-70'
                      : 'bg-card border-border/60 hover:border-purple-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-foreground">
                      <Clock className="w-3 h-3 text-purple-500" />
                      <span>{slot.timeFormatted} น.</span>
                    </div>

                    <Badge
                      className={`text-[10px] px-1.5 py-0 h-5 font-semibold ${
                        slot.status === 'sent'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0'
                          : slot.status === 'skipped_out_of_stock'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-0'
                          : slot.status === 'skipped_expired'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0'
                          : slot.status === 'failed'
                          ? 'bg-destructive/15 text-destructive border-0'
                          : 'bg-muted text-muted-foreground border-border/40'
                      }`}
                    >
                      {slot.status === 'sent'
                        ? '✅ ส่งแล้ว'
                        : slot.status === 'skipped_out_of_stock'
                        ? '⚠️ ข้าม (หมด)'
                        : slot.status === 'skipped_expired'
                        ? '⏰ ข้าม (เลยเวลา)'
                        : slot.status === 'failed'
                        ? '❌ ล้มเหลว'
                        : '⏳ รอดำเนินการ'}
                    </Badge>
                  </div>

                  <div className="font-semibold text-foreground line-clamp-1">
                    {slot.productName}
                  </div>

                  {slot.sentAt && (
                    <div className="text-[10px] text-muted-foreground/80">
                      ยิงเมื่อ: {new Date(slot.sentAt).toLocaleTimeString('th-TH')}
                    </div>
                  )}

                  {slot.error && (
                    <div className="text-[10px] text-rose-500 truncate" title={slot.error}>
                      {slot.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: ประวัติการประกาศ (Broadcast History) */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <span>ประวัติการประกาศแจ้งเตือน (Broadcast History)</span>
          </h2>
          <Badge variant="outline" className="text-xs">
            {broadcasts.length} รายการ
          </Badge>
        </div>

        {broadcasts.length === 0 ? (
          <Card className="border-border/60 bg-card">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {isLoadingData ? 'กำลังโหลดประวัติ...' : 'ยังไม่มีประวัติการประกาศ'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b) => (
              <Card key={b.id} className="border-border/60 bg-card shadow-sm">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{b.title}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                        {b.target}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {b.body}
                    </p>
                    {b.url && (
                      <div className="text-[11px] text-primary flex items-center gap-1 font-mono">
                        <ExternalLink className="w-3 h-3" />
                        <span>{b.url}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 text-xs text-muted-foreground border-t sm:border-t-0 pt-2 sm:pt-0">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ส่งสำเร็จ {b.sentCount} เครื่อง</span>
                    </div>
                    <div className="text-[11px] mt-0.5">
                      {new Date(b.createdAt).toLocaleString('th-TH')}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">
                      โดย: {b.senderName || 'Mimi Operator'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
