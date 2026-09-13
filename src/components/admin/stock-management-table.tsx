'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, Check, CheckCircle2, Copy, Edit, KeyRound, ListChecks, Loader2, PackagePlus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  previewStockAppend,
  type StockAppendFormat,
} from '@/lib/products/stock-append-preview'
import type { Separator } from '@/lib/products/account-parser'
import type { StockDeliveryType } from '@/lib/products/types'
import {
  canUpgradeStockDeliveryType,
  DEFAULT_STOCK_DELIVERY_TYPE,
  getStockDeliveryIdentity,
  getStockDeliveryIdentityIssue,
  getStockDeliveryTypeLabel,
  STOCK_DELIVERY_TYPE_OPTIONS,
} from '@/lib/products/stock-delivery-type'

type Account = {
  email: string
  password: string
  details?: string
}

type Product = {
  id: string
  typeId: string
  name: string
  imageUrl: string | null
  price: number | null
  stock: number | null
  availableStock?: number
  accountCount?: number
  hasStaticAccount?: boolean
  apiProviderId?: string | null
  accountData: Account[] | null
  stockDeliveryType?: StockDeliveryType
  sourceMode?: 'account-pool' | 'provider' | 'static'
  updatedAt?: string
}

type ProductAccountResponse = {
  product: Product & {
    accountData: Account[]
    accountCount: number
    availableStock: number
    sourceMode: 'account-pool' | 'provider' | 'static'
    stockDeliveryType: StockDeliveryType
  }
}

type AppendResponse = {
  message?: string
  code?: string
  errors?: string[]
  addedCount?: number
  duplicateCount?: number
  rejectedCount?: number
  previousStock?: number
  remainingStock?: number
}

function accountKey(
  account: Account,
  productName: string,
  stockDeliveryType: StockDeliveryType,
): string | null {
  return getStockDeliveryIdentity(account, productName, stockDeliveryType)
}

function maskEmail(value: string): string {
  const [localPart, domain] = value.split('@')
  if (!domain) return value ? 'ข้อมูล Account' : 'ข้อมูลส่งมอบ'
  return `${localPart.slice(0, 2)}***@${domain}`
}

function createOperationKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function StockManagementTable() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [clearingProductId, setClearingProductId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)
  const [accountSaveStatus, setAccountSaveStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({})
  const [deletingAccountIndex, setDeletingAccountIndex] = useState<number | null>(null)
  const [copyingAccountIndex, setCopyingAccountIndex] = useState<number | null>(null)
  const [selectedAccountIndexes, setSelectedAccountIndexes] = useState<Set<number>>(new Set())
  const [isBulkCopying, setIsBulkCopying] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [dataFormat, setDataFormat] = useState<StockAppendFormat>('long')
  const [stockDeliveryType, setStockDeliveryType] = useState<StockDeliveryType>(DEFAULT_STOCK_DELIVERY_TYPE)
  const [rawInput, setRawInput] = useState('')
  const [separator, setSeparator] = useState<Separator>(',')
  const deferredRawInput = useDeferredValue(rawInput)
  const accountSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const accountSaveQueue = useRef<Record<number, { account: Account; version: number }>>({})
  const accountSaveRunning = useRef<Record<number, boolean>>({})
  const accountSaveVersion = useRef<Record<number, number>>({})

  useEffect(() => {
    void fetchProducts()
  }, [])

  useEffect(() => {
    const timers = accountSaveTimers.current
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase()
    setFilteredProducts(
      query
        ? products.filter((product) =>
            product.name.toLowerCase().includes(query) ||
            product.typeId.toLowerCase().includes(query),
          )
        : products,
    )
  }, [searchQuery, products])

  const appendPreview = useMemo(
    () => previewStockAppend({ rawInput: deferredRawInput, dataFormat, separator }),
    [deferredRawInput, dataFormat, separator],
  )

  const isPreviewing = deferredRawInput !== rawInput

  const existingKeys = useMemo(
    () => new Set(
      (editingProduct?.accountData || [])
        .map((account) => accountKey(
          account,
          editingProduct?.name || '',
          stockDeliveryType,
        ))
        .filter((key): key is string => key !== null),
    ),
    [editingProduct?.accountData, editingProduct?.name, stockDeliveryType],
  )

  const appendEstimate = useMemo(() => {
    const seen = new Set<string>()
    let duplicateCount = 0
    let rejectedCount = 0
    for (const account of appendPreview.validAccounts) {
      if (getStockDeliveryIdentityIssue(account, editingProduct?.name || '', stockDeliveryType)) {
        rejectedCount += 1
        continue
      }
      const key = accountKey(account, editingProduct?.name || '', stockDeliveryType)
      if (key !== null && (existingKeys.has(key) || seen.has(key))) {
        duplicateCount += 1
        continue
      }
      if (key !== null) seen.add(key)
    }
    return {
      duplicateCount,
      rejectedCount,
      addedCount: Math.max(0, appendPreview.validAccounts.length - duplicateCount - rejectedCount),
    }
  }, [appendPreview.validAccounts, editingProduct?.name, existingKeys, stockDeliveryType])

  const identityIssues = useMemo(
    () => appendPreview.validAccounts
      .map((account, index) => {
        const issue = getStockDeliveryIdentityIssue(
          account,
          editingProduct?.name || '',
          stockDeliveryType,
        )
        return issue ? `รายการใหม่ #${index + 1}: ${issue}` : null
      })
      .filter((issue): issue is string => Boolean(issue)),
    [appendPreview.validAccounts, editingProduct?.name, stockDeliveryType],
  )

  const estimatedAddCount = appendEstimate.addedCount
  const estimatedFinalStock = (editingProduct?.accountData?.length || 0) + estimatedAddCount
  const hasDeliveryTypeConflict = Boolean(
    editingProduct?.accountData &&
      editingProduct.accountData.length > 0 &&
      editingProduct.stockDeliveryType &&
      !canUpgradeStockDeliveryType(editingProduct.stockDeliveryType, stockDeliveryType),
  )
  const canAppend = Boolean(
    editingProduct &&
      editingProduct.sourceMode !== 'provider' &&
      editingProduct.sourceMode !== 'static' &&
      appendPreview.validAccounts.length > 0 &&
      appendPreview.invalidCount === 0 &&
      identityIssues.length === 0 &&
      !isPreviewing &&
      !hasDeliveryTypeConflict &&
      estimatedAddCount > 0,
  )

  async function fetchProducts() {
    setIsLoadingProducts(true)
    try {
      const res = await fetch(
        '/api/admin/products?limit=1000&isLocal=false&includeAccountData=false',
        { cache: 'no-store' },
      )
      if (!res.ok) {
        toast.error('ไม่สามารถโหลดสินค้าได้')
        return
      }
      const data = (await res.json()) as { products: Product[] }
      setProducts(data.products)
    } catch {
      toast.error('เกิดข้อผิดพลาดในการโหลดสินค้า')
    } finally {
      setIsLoadingProducts(false)
    }
  }

  async function loadProductAccounts(product: Product) {
    setIsLoadingAccounts(true)
    try {
      const res = await fetch(
        `/api/admin/stock/accounts?productId=${encodeURIComponent(product.id)}`,
        { cache: 'no-store' },
      )
      const data = (await res.json()) as ProductAccountResponse & { message?: string }
      if (!res.ok || !data.product) {
        toast.error(data.message || 'ไม่สามารถโหลดรายการ Account ได้')
        return
      }
      setEditingProduct(data.product)
      setStockDeliveryType(data.product.stockDeliveryType ?? DEFAULT_STOCK_DELIVERY_TYPE)
      setAccountSaveStatus({})
      setSelectedAccountIndexes(new Set())
    } catch {
      toast.error('เกิดข้อผิดพลาดในการโหลดรายการ Account')
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  async function handleClearStock(product: Product) {
    if (clearingProductId || hasAccountOperationInProgress()) return

    const currentStock = getAvailableStock(product)
    const providerNotice = product.apiProviderId
      ? '\n\nหมายเหตุ: การเชื่อมต่อ Provider จะยังคงอยู่ และ Stock อาจถูกเติมกลับเมื่อมีการ Sync ครั้งถัดไป'
      : ''
    const confirmed = window.confirm(
      `ยืนยันล้าง Stock ทั้งหมดของ "${product.name}" หรือไม่?\n\nระบบจะล้าง Stock, Account และข้อมูล Static Account ทั้งหมด เหลือ 0 ชิ้น (ปัจจุบันประมาณ ${currentStock} ชิ้น)${providerNotice}`,
    )
    if (!confirmed) return

    setClearingProductId(product.id)
    try {
      const res = await fetch('/api/admin/stock/clear', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.id,
          typeId: product.typeId,
        }),
      })
      const data = (await res.json()) as {
        message?: string
        previousStock?: number
        remainingStock?: number
        clearedAccountCount?: number
      }
      if (!res.ok) {
        toast.error(data.message || 'ไม่สามารถล้าง Stock ได้')
        return
      }

      toast.success(
        `ล้าง Stock ของ ${product.name} แล้ว: ${data.previousStock ?? currentStock} -> ${data.remainingStock ?? 0} ชิ้น`,
      )
      if (editingProduct?.id === product.id) {
        await loadProductAccounts(product)
      }
      await fetchProducts()
    } catch {
      toast.error('ไม่สามารถล้าง Stock ได้ กรุณาลองใหม่')
    } finally {
      setClearingProductId(null)
    }
  }

  function handleEditClick(product: Product) {
    setEditingProduct({ ...product, accountData: null })
    setSelectedAccountIndexes(new Set())
    setIsEditDialogOpen(true)
    void loadProductAccounts(product)
  }

  function hasAccountSaveInProgress(): boolean {
    return (
      Object.values(accountSaveStatus).some((status) => status === 'saving') ||
      Object.keys(accountSaveQueue.current).length > 0 ||
      Object.values(accountSaveRunning.current).some(Boolean)
    )
  }

  async function drainAccountSave(index: number) {
    if (accountSaveRunning.current[index]) return
    accountSaveRunning.current[index] = true

    try {
      while (accountSaveQueue.current[index]) {
        const queued = accountSaveQueue.current[index]
        delete accountSaveQueue.current[index]
        setAccountSaveStatus((current) => ({ ...current, [index]: 'saving' }))

        try {
          if (!editingProduct) break
          const res = await fetch('/api/admin/stock/accounts', {
            method: 'PATCH',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': createOperationKey(),
            },
            body: JSON.stringify({
              productId: editingProduct.id,
              typeId: editingProduct.typeId,
              accountIndex: index,
              account: {
                email: queued.account.email || '',
                password: queued.account.password || '',
                details: queued.account.details || '',
              },
            }),
          })
          const data = (await res.json()) as { message?: string }
          const hasNewerChange = Boolean(accountSaveQueue.current[index])
          if (!res.ok) {
            if (!hasNewerChange) {
              setAccountSaveStatus((current) => ({ ...current, [index]: 'error' }))
              toast.error(data.message || `บันทึกรายละเอียด Account #${index + 1} ไม่สำเร็จ`)
            }
            continue
          }

          if (!hasNewerChange && accountSaveVersion.current[index] === queued.version) {
            setAccountSaveStatus((current) => ({ ...current, [index]: 'saved' }))
          }
        } catch {
          if (!accountSaveQueue.current[index]) {
            setAccountSaveStatus((current) => ({ ...current, [index]: 'error' }))
            toast.error(`บันทึกรายละเอียด Account #${index + 1} ไม่สำเร็จ`)
          }
        }
      }
    } finally {
      accountSaveRunning.current[index] = false
      if (accountSaveQueue.current[index] && !accountSaveTimers.current[index]) {
        accountSaveTimers.current[index] = setTimeout(() => {
          delete accountSaveTimers.current[index]
          void drainAccountSave(index)
        }, 250)
      }
    }
  }

  function handleAccountDetailsChange(account: Account, index: number, details: string) {
    if (!editingProduct?.accountData?.[index]) return

    const nextAccount = { ...account, details }
    const version = (accountSaveVersion.current[index] ?? 0) + 1
    accountSaveVersion.current[index] = version
    accountSaveQueue.current[index] = { account: nextAccount, version }
    setAccountSaveStatus((current) => ({ ...current, [index]: 'saving' }))
    setEditingProduct((current) => {
      if (!current?.accountData) return current
      return {
        ...current,
        accountData: current.accountData.map((item, itemIndex) =>
          itemIndex === index ? nextAccount : item,
        ),
      }
    })

    const timer = accountSaveTimers.current[index]
    if (timer) clearTimeout(timer)
    accountSaveTimers.current[index] = setTimeout(() => {
      delete accountSaveTimers.current[index]
      void drainAccountSave(index)
    }, 500)
  }

  function accountClipboardText(account: Account): string {
    return [
      account.email ? `Email / Username: ${account.email}` : '',
      account.password ? `Password: ${account.password}` : '',
      account.details?.trim() ? `รายละเอียดการส่งมอบ:\n${account.details.trim()}` : '',
    ].filter(Boolean).join('\n')
  }

  async function writeClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    if (!copied) throw new Error('Clipboard copy failed')
  }

  function hasAccountOperationInProgress(): boolean {
    return (
      hasAccountSaveInProgress() ||
      deletingAccountIndex !== null ||
      copyingAccountIndex !== null ||
      isBulkCopying ||
      isBulkDeleting
    )
  }

  async function handleDeleteAccount(account: Account, index: number) {
    if (!editingProduct || hasAccountOperationInProgress() || selectedAccountIndexes.size > 0) return
    const confirmed = window.confirm(`ยืนยันการลบ Account #${index + 1} ออกจาก Stock ของสินค้านี้หรือไม่?`)
    if (!confirmed) return

    setDeletingAccountIndex(index)
    try {
      const res = await fetch('/api/admin/stock/accounts', {
        method: 'DELETE',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: editingProduct.id,
          typeId: editingProduct.typeId,
          accountIndex: index,
          expectedAccount: {
            email: account.email || '',
            password: account.password || '',
            details: account.details || '',
          },
        }),
      })
      const data = (await res.json()) as { message?: string; remainingStock?: number }
      if (!res.ok) {
        toast.error(data.message || 'ไม่สามารถลบ Account ได้')
        return
      }

      toast.success(`ลบ Account #${index + 1} แล้ว${data.remainingStock === undefined ? '' : `; Stock เหลือ ${data.remainingStock}`}`)
      await loadProductAccounts(editingProduct)
      await fetchProducts()
    } catch {
      toast.error('ไม่สามารถลบ Account ได้ กรุณาลองใหม่')
    } finally {
      setDeletingAccountIndex(null)
    }
  }

  async function handleCopyAccount(account: Account, index: number) {
    if (hasAccountOperationInProgress() || selectedAccountIndexes.size > 0) return

    const accountText = [
      account.email ? `Email / Username: ${account.email}` : '',
      account.password ? `Password: ${account.password}` : '',
      account.details?.trim() ? `รายละเอียดการส่งมอบ:\n${account.details.trim()}` : '',
    ].filter(Boolean).join('\n')

    if (!accountText) {
      toast.error('Account นี้ไม่มีข้อมูลให้คัดลอก')
      return
    }

    setCopyingAccountIndex(index)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(accountText)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = accountText
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error('Clipboard copy failed')
      }
      toast.success(`คัดลอกข้อมูล Account #${index + 1} แล้ว`)
    } catch {
      toast.error('ไม่สามารถคัดลอกข้อมูล Account ได้ กรุณาอนุญาตการเข้าถึง Clipboard แล้วลองใหม่')
    } finally {
      setCopyingAccountIndex(null)
    }
  }

  async function handleCopySelectedAccounts() {
    const accounts = editingProduct?.accountData
    const selectedIndexes = Array.from(selectedAccountIndexes)
      .filter((index) => Boolean(accounts?.[index]))
      .sort((left, right) => left - right)
    if (!accounts || selectedIndexes.length === 0 || hasAccountOperationInProgress()) return

    const accountText = selectedIndexes
      .map((index) => `#${index + 1}\n${accountClipboardText(accounts[index])}`)
      .join('\n\n')
    if (!accountText) {
      toast.error('ไม่พบข้อมูล Account ที่เลือกให้คัดลอก')
      return
    }

    setIsBulkCopying(true)
    try {
      await writeClipboard(accountText)
      toast.success(`คัดลอก Account ที่เลือก ${selectedIndexes.length} รายการแล้ว`)
    } catch {
      toast.error('ไม่สามารถคัดลอกข้อมูล Account ได้ กรุณาอนุญาตการเข้าถึง Clipboard แล้วลองใหม่')
    } finally {
      setIsBulkCopying(false)
    }
  }

  async function handleDeleteSelectedAccounts() {
    const accounts = editingProduct?.accountData
    const selectedIndexes = Array.from(selectedAccountIndexes)
      .filter((index) => Boolean(accounts?.[index]))
      .sort((left, right) => left - right)
    if (!editingProduct || !accounts || selectedIndexes.length === 0 || hasAccountOperationInProgress()) return

    const confirmed = window.confirm(`ยืนยันการลบ Account ที่เลือก ${selectedIndexes.length} รายการออกจาก Stock ของสินค้านี้หรือไม่?`)
    if (!confirmed) return

    setIsBulkDeleting(true)
    try {
      const res = await fetch('/api/admin/stock/accounts', {
        method: 'DELETE',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: editingProduct.id,
          typeId: editingProduct.typeId,
          accounts: selectedIndexes.map((index) => ({
            accountIndex: index,
            expectedAccount: {
              email: accounts[index].email || '',
              password: accounts[index].password || '',
              details: accounts[index].details || '',
            },
          })),
        }),
      })
      const data = (await res.json()) as { message?: string; deletedCount?: number; remainingStock?: number }
      if (!res.ok) {
        toast.error(data.message || 'ไม่สามารถลบ Account ที่เลือกได้ รายการอาจมีการเปลี่ยนแปลง')
        return
      }

      toast.success(`ลบ Account ที่เลือก ${data.deletedCount ?? selectedIndexes.length} รายการแล้ว${data.remainingStock === undefined ? '' : `; Stock เหลือ ${data.remainingStock}`}`)
      setSelectedAccountIndexes(new Set())
      await loadProductAccounts(editingProduct)
      await fetchProducts()
    } catch {
      toast.error('ไม่สามารถลบ Account ที่เลือกได้ กรุณาลองใหม่')
    } finally {
      setIsBulkDeleting(false)
    }
  }

  function handleToggleAllAccounts(checked: boolean | 'indeterminate') {
    if (checked === true && editingProduct?.accountData) {
      setSelectedAccountIndexes(new Set(editingProduct.accountData.map((_, index) => index)))
      return
    }
    setSelectedAccountIndexes(new Set())
  }

  function handleToggleAccount(index: number, checked: boolean | 'indeterminate') {
    setSelectedAccountIndexes((current) => {
      const next = new Set(current)
      if (checked === true) next.add(index)
      else next.delete(index)
      return next
    })
  }

  function resetAddDialog() {
    setRawInput('')
    setDataFormat('long')
    setStockDeliveryType(DEFAULT_STOCK_DELIVERY_TYPE)
    setSeparator(',')
  }

  function handleCloseAll() {
    if (isPending || clearingProductId || hasAccountOperationInProgress()) return
    setIsEditDialogOpen(false)
    setIsAddDialogOpen(false)
    setEditingProduct(null)
    setAccountSaveStatus({})
    setSelectedAccountIndexes(new Set())
    resetAddDialog()
  }

  function handleOpenAddDialog() {
    if (!editingProduct) return
    if (editingProduct.sourceMode === 'provider' || editingProduct.sourceMode === 'static') {
      toast.error('สินค้านี้ใช้ Stock แบบ Provider หรือ Static จึงไม่สามารถเพิ่ม Account Pool ได้')
      return
    }
    resetAddDialog()
    setStockDeliveryType(editingProduct.stockDeliveryType ?? DEFAULT_STOCK_DELIVERY_TYPE)
    setIsEditDialogOpen(false)
    setIsAddDialogOpen(true)
  }

  function handleCancelAdd() {
    if (isPending) return
    setIsAddDialogOpen(false)
    setIsEditDialogOpen(true)
  }

  function handleAppendAccounts() {
    if (!editingProduct || !canAppend) {
      toast.error('กรุณาตรวจสอบข้อมูล Account ให้ครบก่อนเพิ่ม')
      return
    }

    const product = editingProduct
    const operationKey = createOperationKey()
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/stock/accounts', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': operationKey,
          },
          body: JSON.stringify({
              productId: product.id,
              typeId: product.typeId,
              rawInput,
              dataFormat,
              separator,
              stockDeliveryType,
          }),
        })
        const data = (await res.json()) as AppendResponse
        if (!res.ok) {
          const reason = Array.isArray(data.errors) && data.errors.length > 0
            ? `: ${data.errors.join(', ')}`
            : ''
          toast.error((data.message || 'ไม่สามารถเพิ่ม Account ได้') + reason)
          return
        }

        const skippedCount = (data.duplicateCount || 0) + (data.rejectedCount || 0)
        toast.success(`เพิ่ม Account สำเร็จ ${data.addedCount || 0} รายการ${skippedCount > 0 ? `; ข้าม ${skippedCount} รายการ` : ''}`)
        setIsAddDialogOpen(false)
        setIsEditDialogOpen(true)
        resetAddDialog()
        await loadProductAccounts(product)
        await fetchProducts()
      } catch {
        toast.error('เกิดข้อผิดพลาดในการเพิ่ม Account')
      }
    })
  }

  function getAvailableStock(product: Product): number {
    return product.availableStock ?? product.stock ?? 0
  }

  function getAccountCount(product: Product): number {
    return product.accountCount ?? product.accountData?.length ?? 0
  }

  const accountList = editingProduct?.accountData ?? []
  const selectedAccountCount = Array.from(selectedAccountIndexes)
    .filter((index) => Boolean(accountList[index]))
    .length
  const allAccountsSelected = accountList.length > 0 && selectedAccountCount === accountList.length

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9a5832]" />
        <Input
          type="text"
          placeholder="ค้นหาสินค้า (ชื่อ หรือ Type ID)..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="pl-10 border-[var(--theme-color)]/40 focus:border-[var(--theme-color)] focus:ring-[var(--theme-color)]/20"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow className="bg-[#F9FAFB]">
              <TableHead className="w-[200px] text-xs font-semibold text-[#6B7280]">Type ID</TableHead>
              <TableHead className="text-xs font-semibold text-[#6B7280]">ชื่อสินค้า</TableHead>
              <TableHead className="w-[170px] text-xs font-semibold text-[#6B7280]">Stock พร้อมขาย</TableHead>
              <TableHead className="w-[150px] text-xs font-semibold text-[#6B7280]">จำนวน Account</TableHead>
              <TableHead className="w-[240px] text-xs font-semibold text-[#6B7280] text-center">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingProducts ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-[#6B7280]">
                  <Loader2 className="mx-auto mb-2 size-5 animate-spin text-[var(--theme-color)]" />
                  กำลังโหลดรายการสินค้า...
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-[#6B7280]">
                  {searchQuery ? 'ไม่พบสินค้าที่สอดคล้องกับการค้นหา' : 'ยังไม่มีสินค้า'}
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id} className="hover:bg-[#F9FAFB]">
                  <TableCell className="font-mono text-xs text-[#0B0B0B]">{product.typeId}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" className="size-10 rounded object-cover" />
                      ) : null}
                      <span className="text-sm font-medium text-[#0B0B0B]">{product.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[#0B0B0B]">{getAvailableStock(product)} ชิ้น</TableCell>
                  <TableCell className="text-sm text-[#0B0B0B]">{getAccountCount(product)} บัญชี</TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleClearStock(product)}
                        disabled={clearingProductId !== null}
                        className="h-8 border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        {clearingProductId === product.id ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Trash2 className="mr-1 size-3" />}
                        Clear Stock
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditClick(product)}
                        disabled={clearingProductId !== null}
                        className="h-8 border-[var(--theme-color)]/40 text-xs text-[var(--theme-color)] hover:bg-[var(--theme-color)] hover:text-white hover:border-[var(--theme-color)]"
                      >
                        <Edit className="mr-1 size-3" />
                        แก้ไข
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredProducts.length > 0 && (
        <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm text-[#6B7280]">
          แสดงสินค้า {filteredProducts.length} รายการ
          {searchQuery && products.length !== filteredProducts.length && (
            <span> จากทั้งหมด {products.length} รายการ</span>
          )}
        </div>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => !open && handleCloseAll()}>
        <DialogContent className="w-[92vw] max-w-[92vw] sm:w-full sm:max-w-[1000px] max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#0B0B0B] break-words">
              จัดการข้อมูลบัญชี - {editingProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#9a5832] break-words">
              รายการเดิมจะไม่ถูกเขียนทับ การเพิ่ม Account จะต่อท้ายรายการเดิมแบบปลอดภัย
            </DialogDescription>
          </DialogHeader>

          {isLoadingAccounts || !editingProduct ? (
            <div className="py-12 text-center text-sm text-[#6B7280]">
              <Loader2 className="mx-auto mb-2 size-6 animate-spin text-[var(--theme-color)]" />
              กำลังโหลดรายการ Account...
            </div>
          ) : (
            <div className="space-y-4 py-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <div className="text-xs text-[#6B7280]">Stock พร้อมขาย</div>
                  <div className="mt-1 text-lg font-semibold text-[#0B0B0B]">
                    {editingProduct.availableStock ?? editingProduct.accountData?.length ?? 0} ชิ้น
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <div className="text-xs text-[#6B7280]">Account ในรายการ</div>
                  <div className="mt-1 text-lg font-semibold text-[#0B0B0B]">
                    {editingProduct.accountData?.length || 0} บัญชี
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <div className="text-xs text-[#6B7280]">แหล่ง Stock</div>
                  <div className="mt-1 text-sm font-semibold text-[#0B0B0B]">
                    {editingProduct.sourceMode === 'provider'
                      ? 'Provider'
                      : editingProduct.sourceMode === 'static'
                        ? 'Static Account'
                         : getStockDeliveryTypeLabel(editingProduct.stockDeliveryType)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--theme-color)]/30 bg-[#fff8f4] p-3">
                <div className="flex items-start gap-2 text-sm text-[#6B7280]">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--theme-color)]" />
                  <span>รายการจะแสดงเฉพาะรายละเอียดส่งมอบเพื่อให้ตรวจสอบได้ทันที โดยไม่แสดงช่อง Email/Username และ Password ใน Popup แก้ไข</span>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleClearStock(editingProduct)}
                    disabled={clearingProductId !== null || hasAccountOperationInProgress()}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    {clearingProductId === editingProduct.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                    Clear Stock
                  </Button>
                  <Button
                    type="button"
                    onClick={handleOpenAddDialog}
                    disabled={editingProduct.sourceMode === 'provider' || editingProduct.sourceMode === 'static'}
                    className="bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]"
                  >
                    <PackagePlus className="mr-2 size-4" />
                    เพิ่ม Account สินค้า
                  </Button>
                </div>
              </div>

              {(editingProduct.sourceMode === 'provider' || editingProduct.sourceMode === 'static') && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  สินค้านี้ไม่ได้ใช้ Account Pool จึงไม่เปิดการเพิ่ม Account แบบต่อท้าย
                </div>
              )}

              <div className="rounded-lg border border-[#E5E7EB] bg-white">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0B0B0B]">
                    <KeyRound className="size-4 text-[var(--theme-color)]" />
                    รายการ Account เดิม
                  </div>
                  <span className="text-xs text-[#6B7280]">{editingProduct.accountData?.length || 0} รายการ</span>
                </div>
                <div className="flex flex-col gap-2 border-b border-[#E5E7EB] bg-[#FCFCFC] px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                    <Checkbox
                      checked={allAccountsSelected}
                      onCheckedChange={handleToggleAllAccounts}
                      disabled={accountList.length === 0 || hasAccountOperationInProgress()}
                      aria-label="เลือก Account ทั้งหมด"
                      className="border-[#CBD5E1] bg-white data-[state=checked]:border-[var(--theme-color)] data-[state=checked]:bg-[var(--theme-color)] data-[state=checked]:text-white"
                    />
                    เลือกทั้งหมด
                    {selectedAccountCount > 0 ? ` (${selectedAccountCount} รายการ)` : ''}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopySelectedAccounts()}
                      disabled={selectedAccountCount === 0 || hasAccountOperationInProgress()}
                      className="h-8 text-xs text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
                    >
                      {isBulkCopying ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Copy className="mr-1 size-3" />}
                      Copy ALL
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDeleteSelectedAccounts()}
                      disabled={selectedAccountCount === 0 || hasAccountOperationInProgress()}
                      className="h-8 border-red-200 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                      {isBulkDeleting ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Trash2 className="mr-1 size-3" />}
                      Delete ALL
                    </Button>
                  </div>
                </div>
                <div className="min-h-[260px] max-h-[60vh] overflow-y-auto">
                  {editingProduct.accountData && editingProduct.accountData.length > 0 ? (
                    editingProduct.accountData.map((account, index) => {
                      const isSelected = selectedAccountIndexes.has(index)

                      return (
                      <div
                        key={`account-${index}`}
                        className={`flex items-start gap-3 border-b px-4 py-4 last:border-b-0 ${isSelected
                          ? 'border-l-4 border-l-[var(--theme-color)] border-b-[var(--theme-color)]/20 bg-[var(--theme-color)]/10 shadow-[inset_0_0_0_1px_var(--theme-color)]'
                          : 'border-[#F1F1F1]'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleToggleAccount(index, checked)}
                          disabled={hasAccountOperationInProgress()}
                          aria-label={`เลือก Account #${index + 1}`}
                          className="mt-1 border-[#CBD5E1] bg-white data-[state=checked]:border-[var(--theme-color)] data-[state=checked]:bg-[var(--theme-color)] data-[state=checked]:text-white"
                        />
                        <div className="w-20 shrink-0 pt-1">
                          <span className={`text-xs font-semibold ${isSelected ? 'text-[var(--theme-color)]' : 'text-[#9a5832]'}`}>
                            #{index + 1}
                          </span>
                          {isSelected && (
                            <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[var(--theme-color)]">
                              <CheckCircle2 className="size-3" aria-hidden="true" />
                              เลือกแล้ว
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[#0B0B0B]">{maskEmail(account.email)}</div>
                          <div className="mt-2 rounded-md border border-[var(--theme-color)]/20 bg-[#fffaf8] px-3 py-2">
                            <div className="mb-1 text-xs font-semibold text-[#9a5832]">รายละเอียดส่งมอบ</div>
                            <Textarea
                              value={account.details || ''}
                              onChange={(event) => handleAccountDetailsChange(account, index, event.target.value)}
                              aria-label={`รายละเอียดส่งมอบ Account #${index + 1}`}
                              autoComplete="off"
                              rows={4}
                              className="min-h-[96px] resize-y border-[var(--theme-color)]/20 bg-white font-mono text-xs leading-5 focus:border-[var(--theme-color)] focus:ring-[var(--theme-color)]/20"
                            />
                            <div className="mt-1 flex min-h-5 items-center gap-1 text-[11px] text-[#9CA3AF]">
                              {accountSaveStatus[index] === 'saving' ? (
                                <><Loader2 className="size-3 animate-spin" />กำลังบันทึกอัตโนมัติ...</>
                              ) : accountSaveStatus[index] === 'saved' ? (
                                <><Check className="size-3 text-emerald-600" />บันทึกแล้ว</>
                              ) : accountSaveStatus[index] === 'error' ? (
                                <span className="text-red-500">บันทึกไม่สำเร็จ ลองแก้ไขอีกครั้ง</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title="Copy Account data"
                            aria-label={`Copy Account #${index + 1}`}
                            onClick={() => void handleCopyAccount(account, index)}
                             disabled={hasAccountOperationInProgress() || selectedAccountCount > 0}
                            className="text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
                          >
                            {copyingAccountIndex === index ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title="Delete Account"
                            aria-label={`Delete Account #${index + 1}`}
                            onClick={() => void handleDeleteAccount(account, index)}
                             disabled={hasAccountOperationInProgress() || selectedAccountCount > 0}
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          >
                            {deletingAccountIndex === index ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </Button>
                        </div>
                      </div>
                      )
                    })
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-[#6B7280]">ยังไม่มี Account ในสินค้านี้</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAll} disabled={isPending || clearingProductId !== null || hasAccountSaveInProgress()} className="border-[var(--theme-color)]/40 text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10">
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddDialogOpen} onOpenChange={(open) => !open && handleCancelAdd()}>
        <DialogContent className="w-[92vw] max-w-[92vw] sm:w-full sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#0B0B0B]">เพิ่ม Account สินค้า</DialogTitle>
            <DialogDescription className="text-sm text-[#9a5832] break-words">
              {editingProduct?.name} · ระบบจะต่อท้ายข้อมูลเดิมให้อัตโนมัติ
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="append-stock-delivery-type" className="text-sm font-semibold text-[#0B0B0B]">ประเภท Stock / รูปแบบการส่งมอบ</Label>
              <select
                id="append-stock-delivery-type"
                value={stockDeliveryType}
                onChange={(event) => setStockDeliveryType(event.target.value as StockDeliveryType)}
                className="h-10 w-full rounded-md border border-[var(--theme-color)]/40 bg-white px-3 text-sm text-[#0B0B0B] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
              >
                {STOCK_DELIVERY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs text-[#6B7280]">
                {STOCK_DELIVERY_TYPE_OPTIONS.find((option) => option.value === stockDeliveryType)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#0B0B0B]">รูปแบบข้อมูล</Label>
              <RadioGroup value={dataFormat} onValueChange={(value) => setDataFormat(value as StockAppendFormat)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="short" id="append-format-short" />
                  <Label htmlFor="append-format-short" className="cursor-pointer text-sm text-[#6B7280]">รูปแบบสั้น (user:pass)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="long" id="append-format-long" />
                  <Label htmlFor="append-format-long" className="cursor-pointer text-sm text-[#6B7280]">รูปแบบยาว (ข้อมูลละเอียด)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="append-account-input" className="text-sm font-semibold text-[#0B0B0B]">ข้อมูล Account</Label>
              <Textarea
                id="append-account-input"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder={dataFormat === 'long'
                  ? `Email : acc1@gmail.com\nPass: 123\nรายละเอียดสินค้า\n,\nEmail : acc2@gmail.com\nPass: 456\nรายละเอียดสินค้า`
                  : 'user1:pass1\nuser2:pass:with-colon'}
                className="min-h-[220px] font-mono text-sm border-[var(--theme-color)]/40 focus:border-[var(--theme-color)] focus:ring-[var(--theme-color)]/20"
              />
              <p className="text-xs text-[#6B7280]">
                ใช้ Comma เป็นตัวคั่นระหว่างชุด Account เช่น <code>,</code> ที่บรรทัดแยกชุด ระบบจะไม่นับ Comma ที่อยู่ในรายละเอียด
              </p>
            </div>

            <div className="rounded-lg border border-[var(--theme-color)]/40 bg-[#fff8f4] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--theme-color)]">
                <ListChecks className="size-4" />
                Recheck ก่อนเพิ่ม
                {isPreviewing && <Loader2 className="size-4 animate-spin" aria-label="กำลังตรวจสอบ" />}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-[#6B7280]">ตรวจพบ</div>
                  <div className="text-lg font-semibold text-[#0B0B0B]">{appendPreview.detectedCount} รายการ</div>
                </div>
                <div>
                  <div className="text-xs text-[#6B7280]">พร้อมเพิ่ม</div>
                  <div className="text-lg font-semibold text-emerald-600">{estimatedAddCount} รายการ</div>
                </div>
                <div>
                  <div className="text-xs text-[#6B7280]">Stock หลังเพิ่ม</div>
                  <div className="text-lg font-semibold text-[#0B0B0B]">{estimatedFinalStock} ชิ้น</div>
                </div>
              </div>
              {hasDeliveryTypeConflict && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  สินค้านี้มีรายการเดิมอยู่แล้ว จึงต้องเลือกประเภท Stock เดิมก่อนเพิ่มข้อมูลต่อ
                </p>
              )}
              {appendEstimate.duplicateCount > 0 && (
                <p className="mt-3 text-xs text-amber-700">
                  พบรายการ Account ซ้ำ {appendEstimate.duplicateCount} รายการ ระบบจะข้ามอัตโนมัติ
                </p>
              )}
              {identityIssues.length > 0 && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <div className="font-semibold">ต้องระบุข้อมูลจอหรือโปรไฟล์ให้ครบก่อนเพิ่ม</div>
                  {identityIssues.map((issue) => <div key={issue}>{issue}</div>)}
                </div>
              )}
              {appendPreview.invalidCount > 0 && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <div className="font-semibold">ต้องแก้ไขข้อมูลก่อนเพิ่ม</div>
                  {appendPreview.invalidReasons.map((reason) => <div key={reason}>{reason}</div>)}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelAdd} disabled={isPending} className="border-[var(--theme-color)]/40 text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10">
              ย้อนกลับ
            </Button>
            <Button onClick={handleAppendAccounts} disabled={isPending || !canAppend} className="bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]">
              {isPending ? <><Loader2 className="mr-2 size-4 animate-spin" />กำลังเพิ่ม...</> : `ยืนยันเพิ่ม ${estimatedAddCount} Account`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
