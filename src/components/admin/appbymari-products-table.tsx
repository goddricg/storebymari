'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  CheckCircle2,
  CircleDollarSign,
  ImagePlus,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type Config = {
  configured: boolean
  hasApiKey: boolean
  isActive: boolean
  baseUrl: string
  totalProducts: number
  enabledProducts: number
  lastSyncedAt: string | null
}

type Product = {
  id: string
  sourceTypeId: string
  name: string
  imageUrl: string | null
  sourceImageUrl: string | null
  hasImageOverride: boolean
  details: string | null
  categoryName: string | null
  costPrice: number
  salePrice: number
  stock: number
  reservedStock: number
  availableStock: number
  isEnabled: boolean
  lastSyncedAt: string | null
}

type ApiError = { message?: string }
type UploadResponse = { url?: string; fileUrl?: string; message?: string }

function formatPoints(value: number) {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH')
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as ApiError | null
  return body?.message || fallback
}

export default function AppByMariProductsTable() {
  const [config, setConfig] = useState<Config | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [apiKey, setApiKey] = useState('')
  const [masterPoint, setMasterPoint] = useState<number | null>(null)
  const [masterPointError, setMasterPointError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTesting, setIsTesting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isRefreshingPoint, setIsRefreshingPoint] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [imageDraft, setImageDraft] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [useSourceImage, setUseSourceImage] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true)
    setError(null)
    try {
      const [configResponse, productsResponse] = await Promise.all([
        fetch('/api/admin/appbymari', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/appbymari/products', { credentials: 'include', cache: 'no-store' }),
      ])
      if (!configResponse.ok) throw new Error(await readError(configResponse, 'โหลดการตั้งค่าไม่สำเร็จ'))
      if (!productsResponse.ok) throw new Error(await readError(productsResponse, 'โหลดรายการสินค้าไม่สำเร็จ'))
      const nextConfig = await configResponse.json() as Config
      const productData = await productsResponse.json() as { products?: Product[] }
      const nextProducts = Array.isArray(productData.products) ? productData.products : []
      setConfig(nextConfig)
      setProducts(nextProducts)
      setPriceDrafts((current) => {
        const next = { ...current }
        nextProducts.forEach((product) => {
          if (!(product.id in next)) next[product.id] = String(product.salePrice)
        })
        return next
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      if (showSpinner) setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (config?.hasApiKey && config.isActive) void refreshMasterPoint()
  }, [config?.hasApiKey, config?.isActive])

  const enabledProducts = useMemo(() => products.filter((product) => product.isEnabled).length, [products])

  const saveConfig = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/appbymari', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            isActive: config?.isActive ?? true,
          }),
        })
        if (!response.ok) throw new Error(await readError(response, 'บันทึกการตั้งค่าไม่สำเร็จ'))
        const nextConfig = await response.json() as Partial<Config>
        setConfig((current) => ({
          configured: Boolean(nextConfig.configured ?? current?.configured),
          hasApiKey: Boolean(nextConfig.hasApiKey ?? current?.hasApiKey),
          isActive: Boolean(nextConfig.isActive ?? current?.isActive),
          baseUrl: nextConfig.baseUrl ?? current?.baseUrl ?? '',
          totalProducts: current?.totalProducts ?? products.length,
          enabledProducts: current?.enabledProducts ?? enabledProducts,
          lastSyncedAt: current?.lastSyncedAt ?? null,
        }))
        setApiKey('')
        toast.success('บันทึกการเชื่อมต่อ Store By Mari แล้ว')
      } catch (saveError) {
        toast.error(saveError instanceof Error ? saveError.message : 'บันทึกการตั้งค่าไม่สำเร็จ')
      }
    })
  }

  const testConnection = async () => {
    setIsTesting(true)
    try {
      const response = await fetch('/api/admin/appbymari/test-connection', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      if (!response.ok) throw new Error(await readError(response, 'เชื่อมต่อไม่สำเร็จ'))
      const body = await response.json() as { message?: string; productCount?: number }
      toast.success(body.message || 'เชื่อมต่อ Store By Mari สำเร็จ', {
        description: `พบสินค้า ${Number(body.productCount ?? 0).toLocaleString('th-TH')} รายการ`,
      })
    } catch (testError) {
      toast.error(testError instanceof Error ? testError.message : 'เชื่อมต่อไม่สำเร็จ')
    } finally {
      setIsTesting(false)
    }
  }

  const syncProducts = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/admin/appbymari/sync', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await readError(response, 'Sync สินค้าไม่สำเร็จ'))
      const body = await response.json() as { count?: number }
      toast.success(`Sync สินค้าจาก Store By Mari แล้ว ${Number(body.count ?? 0).toLocaleString('th-TH')} รายการ`)
      await loadData(false)
    } catch (syncError) {
      toast.error(syncError instanceof Error ? syncError.message : 'Sync สินค้าไม่สำเร็จ')
    } finally {
      setIsSyncing(false)
    }
  }

  const refreshMasterPoint = async () => {
    setIsRefreshingPoint(true)
    setMasterPointError(null)
    try {
      const response = await fetch('/api/admin/appbymari/balance', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await readError(response, 'ดึง Master Point ไม่สำเร็จ'))
      const body = await response.json() as { masterPoint?: number }
      setMasterPoint(Number(body.masterPoint ?? 0))
    } catch (pointError) {
      setMasterPoint(null)
      setMasterPointError(pointError instanceof Error ? pointError.message : 'ดึง Master Point ไม่สำเร็จ')
    } finally {
      setIsRefreshingPoint(false)
    }
  }

  const updateProduct = (product: Product, patch: { salePrice?: number; isEnabled?: boolean }) => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/appbymari/products', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceTypeId: product.sourceTypeId, ...patch }),
        })
        if (!response.ok) throw new Error(await readError(response, 'อัปเดตสินค้าไม่สำเร็จ'))
        const body = await response.json() as { product: Product }
        setProducts((current) => current.map((item) => item.id === product.id ? body.product : item))
        setPriceDrafts((current) => ({ ...current, [product.id]: String(body.product.salePrice) }))
        toast.success(patch.isEnabled === undefined ? 'บันทึกราคาขายแล้ว' : (patch.isEnabled ? 'เปิดแสดงสินค้านี้แล้ว' : 'ปิดแสดงสินค้านี้แล้ว'))
      } catch (updateError) {
        toast.error(updateError instanceof Error ? updateError.message : 'อัปเดตสินค้าไม่สำเร็จ')
      }
    })
  }

  const resetEditState = () => {
    setEditingProduct(null)
    setImageDraft('')
    setImagePreview(null)
    setSelectedImageFile(null)
    setUseSourceImage(false)
  }

  const handleEditOpenChange = (open: boolean) => {
    setIsEditDialogOpen(open)
    if (!open) resetEditState()
  }

  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    setImageDraft(product.hasImageOverride ? product.imageUrl ?? '' : '')
    setImagePreview(product.imageUrl ?? product.sourceImageUrl)
    setSelectedImageFile(null)
    setUseSourceImage(!product.hasImageOverride)
    setIsEditDialogOpen(true)
  }

  const handleImageFileChange = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
      return
    }
    if (file.size <= 0 || file.size > 16 * 1024 * 1024) {
      toast.error('รูปภาพต้องมีขนาดไม่เกิน 16MB')
      return
    }

    setSelectedImageFile(file)
    setUseSourceImage(false)
    setImageDraft('')
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.readAsDataURL(file)
  }

  const uploadProductImage = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'products')
    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!response.ok) throw new Error(await readError(response, 'อัปโหลดรูปภาพไม่สำเร็จ'))
    const body = await response.json() as UploadResponse
    const url = body.url || body.fileUrl
    if (!url) throw new Error('ระบบไม่พบ URL ของรูปภาพที่อัปโหลด')
    return url
  }

  const saveEditedProduct = async () => {
    if (!editingProduct) return
    setIsSavingEdit(true)
    try {
      let imageUrl: string | null = null
      if (useSourceImage) {
        imageUrl = null
      } else if (selectedImageFile) {
        imageUrl = await uploadProductImage(selectedImageFile)
      } else {
        imageUrl = imageDraft.trim() || null
      }

      const response = await fetch('/api/admin/appbymari/products', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTypeId: editingProduct.sourceTypeId, imageUrl }),
      })
      if (!response.ok) throw new Error(await readError(response, 'บันทึกรูปภาพสินค้าไม่สำเร็จ'))
      const body = await response.json() as { product: Product }
      setProducts((current) => current.map((item) => item.id === editingProduct.id ? body.product : item))
      toast.success('บันทึกรูปภาพสินค้าแล้ว')
      handleEditOpenChange(false)
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'บันทึกรูปภาพสินค้าไม่สำเร็จ')
    } finally {
      setIsSavingEdit(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center rounded-2xl bg-white/80 p-12 text-sm text-[#6B7280]"><Loader2 className="mr-2 size-5 animate-spin" />กำลังโหลดสินค้า API จากร้านหลัก...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border-[#f5bfd2] bg-white/95 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-[#111827]"><KeyRound className="size-5 text-[#d94d82]" />การเชื่อมต่อร้านหลัก</CardTitle>
                <p className="mt-1 text-sm text-[#6B7280]">API key จะถูกเก็บและใช้งานเฉพาะฝั่งเซิร์ฟเวอร์ ไม่แสดงกลับในหน้าจอ</p>
              </div>
              <Badge className={config?.isActive && config.hasApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                {config?.isActive && config.hasApiKey ? <><Wifi className="mr-1 size-3.5" />พร้อมใช้งาน</> : <><WifiOff className="mr-1 size-3.5" />ยังไม่พร้อม</>}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appbymari-api-key">API KEY จาก Store By Mari</Label>
              <Input
                id="appbymari-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={config?.hasApiKey ? 'มี API key อยู่แล้ว — กรอกใหม่เมื่อต้องการเปลี่ยน' : 'วาง API key ที่นี่'}
              />
              <p className="text-xs text-[#9CA3AF]">เว้นว่างเพื่อใช้ key เดิม · กรอก key ใหม่เพื่อทดสอบหรือบันทึกแทนของเดิม</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={saveConfig} disabled={isPending} className="bg-[#d94d82] text-white hover:bg-[#c53b70]"><Save className="mr-2 size-4" />บันทึกการเชื่อมต่อ</Button>
              <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={isTesting || (!config?.hasApiKey && !apiKey.trim())}><Wifi className="mr-2 size-4" />{isTesting ? 'กำลังทดสอบ...' : 'TEST Connect'}</Button>
              <label className="flex items-center gap-2 text-sm text-[#374151]"><Switch checked={config?.isActive ?? false} onCheckedChange={(checked) => setConfig((current) => current ? { ...current, isActive: checked } : current)} />เปิดใช้งาน API</label>
            </div>
            <div className="rounded-xl bg-[#fff4f8] p-3 text-xs text-[#7f485c]">Endpoint: <span className="font-mono">{config?.baseUrl || 'https://appbymari.com/api/v1'}</span></div>
          </CardContent>
        </Card>

        <Card className="border-[#f5bfd2] bg-gradient-to-br from-[#fff7fb] to-white shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg text-[#111827]"><CircleDollarSign className="size-5 text-[#d94d82]" />Master Point</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#6B7280]">ยอดของ Account Owner / Super Admin ที่ร้านหลัก</p>
                <p className="mt-2 text-3xl font-bold text-[#d94d82]">{masterPoint == null ? '-' : `${formatPoints(masterPoint)} พ้อยท์`}</p>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => void refreshMasterPoint()} disabled={isRefreshingPoint || !config?.hasApiKey} aria-label="รีเฟรช Master Point"><RefreshCw className={isRefreshingPoint ? 'size-4 animate-spin' : 'size-4'} /></Button>
            </div>
            {masterPointError ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{masterPointError}</p> : <p className="mt-3 text-xs leading-5 text-[#6B7280]">Master Point อ้างอิงแบบสดผ่าน API key และแยกจากพ้อยท์ของลูกค้าใน Store By Mari</p>}
            <div className="mt-4 flex items-center gap-2 text-xs text-[#6B7280]"><ShieldCheck className="size-4 text-emerald-600" />การซื้อสินค้าจากร้านหลักจะหักพ้อยท์ลูกค้าใน Store By Mari และเรียกตัด Master Point ผ่าน API</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-[#f5bfd2] bg-white/95"><CardContent className="p-4"><p className="text-xs text-[#6B7280]">สินค้าที่ Sync แล้ว</p><p className="mt-1 text-2xl font-bold text-[#111827]">{(config?.totalProducts ?? products.length).toLocaleString('th-TH')}</p></CardContent></Card>
        <Card className="border-[#f5bfd2] bg-white/95"><CardContent className="p-4"><p className="text-xs text-[#6B7280]">เปิดแสดงบน Storefront</p><p className="mt-1 text-2xl font-bold text-[#d94d82]">{enabledProducts.toLocaleString('th-TH')}</p></CardContent></Card>
        <Card className="border-[#f5bfd2] bg-white/95"><CardContent className="p-4"><p className="text-xs text-[#6B7280]">Sync ล่าสุด</p><p className="mt-1 text-sm font-semibold text-[#111827]">{formatDate(config?.lastSyncedAt ?? null)}</p></CardContent></Card>
      </div>

      <Card className="border-[#f5bfd2] bg-white/95 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-[#f7dce7] sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="flex items-center gap-2 text-lg text-[#111827]"><Store className="size-5 text-[#d94d82]" />สินค้า API จากร้านหลัก</CardTitle><p className="mt-1 text-sm text-[#6B7280]">รายการนี้แสดงสินค้าทั้งหมดที่ Sync จาก Store By Mari · แก้ไขราคา สถานะ และรูปภาพที่แสดงใน Store By Mari ได้</p></div>
          <Button type="button" variant="outline" onClick={() => void syncProducts()} disabled={isSyncing || !config?.hasApiKey || !config?.isActive}><RefreshCw className={isSyncing ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'} />{isSyncing ? 'กำลัง Sync...' : 'Sync สินค้าจากร้านหลัก'}</Button>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <div className="m-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<Button type="button" variant="link" className="ml-2 p-0 text-red-700" onClick={() => void loadData()}>ลองใหม่</Button></div> : null}
          {products.length === 0 && !error ? <div className="p-12 text-center text-sm text-[#6B7280]">ยังไม่มีรายการสินค้า กด TEST Connect แล้วกด Sync เพื่อดึงสินค้าทั้งหมดจาก Store By Mari</div> : null}
          {products.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-[#fff7fb] text-xs uppercase text-[#7f485c]"><tr><th className="px-4 py-3">สินค้า</th><th className="px-4 py-3">รหัสจากร้านหลัก</th><th className="px-4 py-3">หมวดหมู่</th><th className="px-4 py-3 text-right">ต้นทุน Store By Mari</th><th className="px-4 py-3">ราคาขาย Store By Mari</th><th className="px-4 py-3 text-center">สต็อก</th><th className="px-4 py-3 text-center">แสดงผล</th><th className="px-4 py-3 text-center">แก้ไข</th></tr></thead>
                <tbody className="divide-y divide-[#f7dce7]">
                  {products.map((product) => {
                    const draft = priceDrafts[product.id] ?? String(product.salePrice)
                    return (
                      <tr key={product.id} className="align-middle hover:bg-[#fffafd]">
                        <td className="px-4 py-3"><div className="flex min-w-[220px] items-center gap-3"><div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-[#f9edf3]">{product.imageUrl ? <Image src={product.imageUrl} alt={product.name} fill sizes="48px" className="object-contain p-1" unoptimized /> : <ImagePlus className="m-auto size-5 text-[#d94d82]" />}</div><div><p className="font-semibold text-[#111827]">{product.name}</p><p className="mt-1 line-clamp-1 text-xs text-[#9CA3AF]">{product.details || 'ไม่มีรายละเอียด'}</p>{product.hasImageOverride ? <p className="mt-1 text-[11px] text-[#d94d82]">ใช้รูปที่ตั้งเอง</p> : null}</div></div></td>
                        <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">{product.sourceTypeId}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{product.categoryName || '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#6B7280]">{formatPoints(product.costPrice)} พ้อยท์</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><Input className="w-32" inputMode="decimal" value={draft} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))} /><Button type="button" size="icon" variant="outline" aria-label={`บันทึกราคาสินค้า ${product.name}`} disabled={isPending} onClick={() => { const value = Number(draft); if (!Number.isFinite(value) || value < 0) { toast.error('กรุณาระบุราคาขายที่ถูกต้อง'); return } updateProduct(product, { salePrice: Number(value.toFixed(2)) }) }}><Save className="size-4" /></Button></div></td>
                        <td className="px-4 py-3 text-center"><span className="font-semibold text-[#111827]">{product.availableStock.toLocaleString('th-TH')}</span>{product.reservedStock > 0 ? <span className="mt-1 block text-[11px] text-amber-600">จองอยู่ {product.reservedStock}</span> : null}</td>
                        <td className="px-4 py-3 text-center"><div className="flex flex-col items-center gap-1"><Switch checked={product.isEnabled} onCheckedChange={(checked) => updateProduct(product, { isEnabled: checked })} disabled={isPending} aria-label={`${product.isEnabled ? 'ปิด' : 'เปิด'}การแสดงผล ${product.name}`} />{product.isEnabled ? <span className="flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="size-3" />เปิดอยู่</span> : <span className="text-[11px] text-[#9CA3AF]">ปิดอยู่</span>}</div></td>
                        <td className="px-4 py-3 text-center"><Button type="button" variant="outline" size="icon" aria-label={`แก้ไขสินค้า ${product.name}`} disabled={isPending || isSavingEdit} onClick={() => openEditDialog(product)}><Pencil className="size-4" /></Button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>แก้ไขสินค้า API จากร้านหลัก</DialogTitle>
            <DialogDescription>เปลี่ยนรูปที่ใช้แสดงบน Store By Mari ได้ โดยข้อมูลชื่อ รายละเอียด ต้นทุน และรหัสสินค้ายังคงอ้างอิงจาก Store By Mari</DialogDescription>
          </DialogHeader>
          {editingProduct ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#f7dce7] bg-[#fffafd] p-3 text-sm">
                <p className="font-semibold text-[#111827]">{editingProduct.name}</p>
                <p className="mt-1 font-mono text-xs text-[#6B7280]">{editingProduct.sourceTypeId}</p>
              </div>
              <div className="space-y-2">
                <Label>ตัวอย่างรูปภาพ</Label>
                <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#edb5cc] bg-[#fff7fb]">
                  {imagePreview ? <Image src={imagePreview} alt={`ตัวอย่างรูป ${editingProduct.name}`} fill sizes="480px" className="object-contain p-3" unoptimized /> : <div className="flex flex-col items-center gap-2 text-xs text-[#9CA3AF]"><ImagePlus className="size-8 text-[#d94d82]" />ยังไม่มีรูปภาพ</div>}
                </div>
                <p className="text-xs text-[#6B7280]">{useSourceImage ? 'กำลังใช้รูปต้นฉบับจากร้านหลัก' : selectedImageFile ? `เลือกรูปใหม่แล้ว: ${selectedImageFile.name}` : 'กำลังใช้รูปที่ตั้งเองของ Store By Mari'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="appbymari-edit-image-upload" className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#d94d82] px-3 text-sm font-medium text-white transition hover:bg-[#c53b70]">
                  <Upload className="size-4" />เลือกรูปจากเครื่อง
                </label>
                <input id="appbymari-edit-image-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={isSavingEdit} onChange={(event) => { handleImageFileChange(event.target.files?.[0]); event.currentTarget.value = '' }} />
                <Button type="button" variant="outline" onClick={() => { setSelectedImageFile(null); setUseSourceImage(false); setImagePreview(imageDraft.trim() || null) }} disabled={isSavingEdit}>ใช้ URL</Button>
                <Button type="button" variant="ghost" onClick={() => { setSelectedImageFile(null); setUseSourceImage(true); setImageDraft(''); setImagePreview(editingProduct.sourceImageUrl) }} disabled={isSavingEdit}>ใช้รูปจากร้านหลัก</Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appbymari-edit-image-url">URL รูปภาพ (ถ้ามี)</Label>
                <Input id="appbymari-edit-image-url" value={imageDraft} onChange={(event) => { setImageDraft(event.target.value); setSelectedImageFile(null); setUseSourceImage(false); setImagePreview(event.target.value.trim() || null) }} placeholder="https://... หรือ /uploads/products/..." disabled={isSavingEdit || useSourceImage} />
                <p className="text-xs text-[#9CA3AF]">รองรับ URL HTTPS หรือไฟล์ที่อัปโหลดในเว็บไซต์ หากกด “ใช้รูปจากร้านหลัก” ระบบจะล้างรูปที่ตั้งเองและกลับไปใช้รูปจาก Sync</p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleEditOpenChange(false)} disabled={isSavingEdit}>ยกเลิก</Button>
            <Button type="button" onClick={() => void saveEditedProduct()} disabled={!editingProduct || isSavingEdit} className="bg-[#d94d82] text-white hover:bg-[#c53b70]">{isSavingEdit ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}บันทึกรูปภาพ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
