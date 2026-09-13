'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Brain,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  MessageSquare,
  BookOpen,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  HelpCircle,
  Lightbulb,
  Layers,
  Wand2,
} from 'lucide-react'
import type { MimiKnowledgeRule } from '@/lib/mimi/knowledge'

const CATEGORIES = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'troubleshooting', label: '🔧 แก้ปัญหาการใช้งาน', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { id: 'sales', label: '🛒 การขาย & แนะนำสินค้า', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  { id: 'announcement', label: '📢 ประกาศด่วนเฉพาะช่วง', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
  { id: 'policy', label: '📜 นโยบาย & กฎร้าน', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { id: 'general', label: '💡 ทั่วไป / คำถามบ่อย', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
]

export default function MimiKnowledgeCenter() {
  const [rules, setRules] = useState<MimiKnowledgeRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [category, setCategory] = useState<'troubleshooting' | 'sales' | 'policy' | 'announcement' | 'general'>('troubleshooting')
  const [situation, setSituation] = useState('')
  const [guidance, setGuidance] = useState('')
  const [specialNotes, setSpecialNotes] = useState('')

  const fetchRules = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/mimi/knowledge')
      const data = await res.json()
      if (data.success && Array.isArray(data.rules)) {
        setRules(data.rules)
      } else {
        toast.error('ไม่สามารถโหลดข้อมูลห้องสอนงานได้')
      }
    } catch (e) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!situation.trim() || !guidance.trim()) {
      toast.error('กรุณากรอกสถานการณ์และแนวทางการตอบให้ครบถ้วน')
      return
    }

    try {
      setIsSaving(true)
      const res = await fetch('/api/admin/mimi/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          category,
          situation: situation.trim(),
          guidance: guidance.trim(),
          specialNotes: specialNotes.trim(),
          isActive: true,
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(editingId ? 'อัปเดตบทเรียนสำเร็จ!' : 'บันทึกบทเรียนสอนงานมิมิสำเร็จ!')
        // Reset form
        setEditingId(null)
        setSituation('')
        setGuidance('')
        setSpecialNotes('')
        setShowAddForm(false)
        fetchRules()
      } else {
        toast.error(data.message || 'เกิดข้อผิดพลาดในการบันทึก')
      }
    } catch (e) {
      toast.error('เชื่อมต่อเซิร์ฟเวอร์ขัดข้อง')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggle = async (rule: MimiKnowledgeRule) => {
    const nextState = !rule.isActive
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, isActive: nextState } : r))
    )

    try {
      const res = await fetch('/api/admin/mimi/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, isActive: nextState }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(nextState ? `เปิดใช้งานบทเรียน "${rule.situation.substring(0, 20)}..." แล้ว` : `ปิดใช้งานบทเรียนแล้ว`)
      } else {
        // Rollback
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, isActive: rule.isActive } : r))
        )
        toast.error('ไม่สามารถสลับสถานะได้')
      }
    } catch {
      // Rollback
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: rule.isActive } : r))
      )
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`คุณต้องการลบบทเรียน "${name.substring(0, 30)}..." ใช่หรือไม่?`)) return

    try {
      const res = await fetch(`/api/admin/mimi/knowledge?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        toast.success('ลบบทเรียนเรียบร้อยแล้ว')
        setRules((prev) => prev.filter((r) => r.id !== id))
      } else {
        toast.error('ลบไม่สำเร็จ')
      }
    } catch {
      toast.error('เกิดข้อผิดพลาดในการลบ')
    }
  }

  const handleStartEdit = (rule: MimiKnowledgeRule) => {
    setEditingId(rule.id)
    setCategory(rule.category)
    setSituation(rule.situation)
    setGuidance(rule.guidance)
    setSpecialNotes(rule.specialNotes || '')
    setShowAddForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filteredRules = rules.filter((r) => {
    const matchCat = selectedCategory === 'all' || r.category === selectedCategory
    const matchSearch =
      r.situation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.guidance.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.specialNotes || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 via-pink-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-pink-200 border border-white/10">
              <Brain className="w-3.5 h-3.5 text-pink-400" />
              <span>Mimi Dynamic Knowledge Base & Training Room</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <span>ห้องสอนงานมิมิ (AI Operator)</span>
              <Badge className="bg-pink-500/20 text-pink-300 border-pink-400/30 text-xs">
                Real-time Sync
              </Badge>
            </h1>
            <p className="text-sm text-purple-100/80 leading-relaxed">
              สอนมิมิว่าเมื่อเจอลูกค้าพูดแบบนี้ หรือเกิดสถานการณ์นี้ ต้องรับมือและตอบอย่างไร กฎที่เปิดใช้งานจะถูกส่งเข้าสมองของมิมิบน LINE OA ทันทีในเสี้ยววินาที!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRules}
              disabled={isLoading}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-2 text-xs h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>รีเฟรช</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingId(null)
                setSituation('')
                setGuidance('')
                setSpecialNotes('')
                setShowAddForm(!showAddForm)
              }}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white gap-2 font-semibold shadow-lg shadow-pink-500/25 text-xs h-9"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'ปิดฟอร์ม' : 'สอนบทเรียนใหม่'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Add / Edit Form Card */}
      {showAddForm && (
        <Card className="border-pink-500/30 bg-gradient-to-br from-card via-card to-pink-500/5 shadow-xl">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <span>{editingId ? 'แก้ไขบทเรียนการสอน' : 'สอนงานมิมิเรื่องใหม่'}</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              ระบุคำถามหรือสถานการณ์ที่ลูกค้ามักจะเจอ พร้อมแนวทางที่อยากให้มิมิสื่อสารตอบกลับ
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            <form onSubmit={handleSaveRule} className="space-y-4">
              {/* Category selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">หมวดหมู่ของบทเรียน:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id as any)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                        category === c.id
                          ? 'border-pink-500 bg-pink-500/15 text-pink-600 dark:text-pink-300 shadow-sm'
                          : 'border-border bg-background/50 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Situation / Customer Trigger */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>สถานการณ์ / คำถามของลูกค้า (Trigger):</span>
                  <span className="text-[11px] text-muted-foreground font-normal">เช่น &quot;ลูกค้าบอกเข้า Netflix แล้วขึ้นจอเต็ม&quot;</span>
                </label>
                <Input
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="เช่น ลูกค้าแจ้งจอเต็ม, ขอรหัสใหม่, ถามวิธีสั่งซื้อ, หรือ Viu เข้าไม่ได้"
                  required
                  className="bg-background/80 text-sm focus-visible:ring-pink-500"
                />
              </div>

              {/* Guidance / Handling */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>แนวทางรับมือและคำตอบที่ถูกต้อง (Guidance & Action):</span>
                  <span className="text-[11px] text-muted-foreground font-normal">สอนมิมิว่าควรพูดยังไง และทำอะไร</span>
                </label>
                <Textarea
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder="เช่น ให้มิมิตอบอย่างเห็นใจ แนะนำให้ลูกค้ารอระบบรีเซ็ต 10 นาที หากไม่ได้ให้ส่งลิงก์แจ้งเคลมบนเว็บ storebymari.com/orders"
                  rows={3}
                  required
                  className="bg-background/80 text-sm focus-visible:ring-pink-500"
                />
              </div>

              {/* Special Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>เงื่อนไขพิเศษ / ข้อห้าม (Special Notes): (ถ้ามี)</span>
                  <span className="text-[11px] text-muted-foreground font-normal">เช่น &quot;ห้ามแจกแอคในแชทเด็ดขาด&quot;</span>
                </label>
                <Input
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="เช่น ห้ามแจกเมลใหม่ในแชท ต้องให้กดเคลมผ่านระบบเว็บเท่านั้น"
                  className="bg-background/80 text-sm focus-visible:ring-pink-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs h-9"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  size="sm"
                  className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold text-xs h-9 gap-1.5 shadow-md shadow-pink-500/20"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{editingId ? 'อัปเดตบทเรียน' : 'บันทึกเข้าสมองมิมิ'}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === c.id
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาคำถาม / สถานการณ์..."
            className="pl-8 text-xs h-9 bg-background/80"
          />
        </div>
      </div>

      {/* Knowledge Cards List */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin text-pink-500" />
          <span className="text-xs">กำลังโหลดคลังความรู้ของมิมิ...</span>
        </div>
      ) : filteredRules.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-muted-foreground space-y-2">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-semibold">ยังไม่มีบทเรียนในหมวดหมู่นี้</p>
          <p className="text-xs">กดปุ่ม &quot;สอนบทเรียนใหม่&quot; ด้านบนเพื่อเริ่มป้อนความรู้ให้มิมิได้เลยค่ะ</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRules.map((rule) => {
            const catMeta = CATEGORIES.find((c) => c.id === rule.category)
            return (
              <Card
                key={rule.id}
                className={`transition-all duration-200 hover:shadow-md border ${
                  rule.isActive ? 'border-border/80' : 'opacity-60 bg-muted/30 border-dashed'
                }`}
              >
                <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[11px] font-semibold ${catMeta?.color || ''}`}>
                        {catMeta?.label || rule.category}
                      </Badge>
                      {rule.source === 'line_group' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">
                          📱 สอนผ่านกลุ่ม LINE
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[10px]">
                          💻 สอนผ่านหน้าเว็บ
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-foreground leading-snug pt-1">
                      {rule.situation}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => handleToggle(rule)}
                      title={rule.isActive ? 'เปิดใช้งานอยู่ (คลิกเพื่อปิด)' : 'ปิดอยู่ (คลิกเพื่อเปิด)'}
                    />
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  <div className="p-3 rounded-xl bg-muted/60 border border-border/30 space-y-1">
                    <div className="text-[11px] font-bold text-pink-600 dark:text-pink-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>แนวทางที่มิมิตอบกลับ:</span>
                    </div>
                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {rule.guidance}
                    </p>
                  </div>

                  {rule.specialNotes && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{rule.specialNotes}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>ผู้สอน: {rule.createdBy}</span>
                    </span>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(rule)}
                        className="h-7 px-2 text-xs hover:text-pink-500"
                      >
                        แก้ไข
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id, rule.situation)}
                        className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
