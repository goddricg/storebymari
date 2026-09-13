'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, normalizeNewlines } from '@/lib/utils'
import { PurchaseProductButton } from '@/components/orders/purchase-product-button'
import { AddToCartButton } from '@/components/cart/add-to-cart-button'
import { ProductPriceDisplay } from '@/components/products/product-price-display'
import { VipBadge } from '@/components/products/vip-badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { subscribeProductStockRealtime } from '@/lib/products/realtime-hub'
import { useLiveProductStock } from '@/components/products/product-stock-realtime-provider'
import { DreamyOrnament } from '@/components/dreamy-ui/ornaments'

type ProductCard = {
  id: string
  typeId: string
  name: string
  imageUrl: string | null
  typeImageUrl: string | null
  details: string | null
  price: number | null
  priceVip: number | null
  priceWalkin: number | null
  stock: number | null
  typeMenu: string | null
  badge: 'hot_sale' | 'recommended' | null
}

type CategoryInfo = {
  category: string
  imageUrl: string | null
  count: number
}

const HOME_PRODUCT_LIMIT = 20

function CategoryThumbnail({
  imageUrl,
  category,
  size,
}: {
  imageUrl: string | null
  category: string
  size: 32 | 40
}) {
  const [hasError, setHasError] = useState(false)

  if (!imageUrl || hasError) {
    return (
      <span className="text-sm font-semibold text-[var(--theme-color-text-accent)]">
        {category.slice(0, 1)}
      </span>
    )
  }

  return (
    <Image
      src={imageUrl}
      alt={category}
      fill
      sizes={`${size}px`}
      className="object-contain"
      unoptimized
      onError={() => setHasError(true)}
    />
  )
}

type ProductsGridClientProps = {
  initialProducts?: ProductCard[]
  initialTotal?: number
  initialTotalPages?: number
  initialCategories?: CategoryInfo[]
  showFilters?: boolean
  showOutOfStockBadge?: boolean
  layout?: 'catalog' | 'home'
  pageSize?: number
  showPagination?: boolean
}

export default function ProductsGridClient({
  initialProducts,
  initialTotal = 0,
  initialTotalPages = 1,
  initialCategories = [],
  showFilters = true,
  showOutOfStockBadge = true,
  layout = 'catalog',
  pageSize = 12,
  showPagination = true,
}: ProductsGridClientProps) {
  const hasInitialData = initialProducts != null
  const [products, setProducts] = useState<ProductCard[]>(initialProducts ?? [])
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(
    hasInitialData ? initialTotalPages : 1
  )
  const [total, setTotal] = useState(hasInitialData ? initialTotal : 0)
  const [allCategories, setAllCategories] = useState<CategoryInfo[]>(initialCategories)
  const [isLoading, setIsLoading] = useState(!hasInitialData)
  const [realtimeRefreshVersion, setRealtimeRefreshVersion] = useState(0)
  const skipNextFetchRef = useRef(hasInitialData)
  const hasLoadedRef = useRef(hasInitialData)
  const refreshTimerRef = useRef<number | null>(null)
  const itemsPerPage = pageSize

  useEffect(() => {
    if (!showFilters) return

    const params = new URLSearchParams(window.location.search)
    const initialCategory = params.get('category')?.trim()
    const initialSearch = params.get('search')?.trim()

    if (initialCategory) setSelectedCategory(initialCategory)
    if (initialSearch) setSearchTerm(initialSearch)
  }, [showFilters])

  useEffect(() => {
    if (!showFilters) return

    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
      setCurrentPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchTerm, showFilters])

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category)
    setCurrentPage(1)
  }

  useEffect(() => {
    return subscribeProductStockRealtime((patch) => {
      setProducts((prev) => {
        const index = prev.findIndex((item) => item.id === patch.id)
        if (index === -1) {
          return prev
        }
        if (!patch.isPublished) {
          return prev.filter((item) => item.id !== patch.id)
        }
        const next = [...prev]
        next[index] = {
          ...next[index],
          stock: patch.stock,
          badge: patch.badge,
          price: patch.price !== undefined ? patch.price : next[index].price,
          priceVip: patch.priceVip !== undefined ? patch.priceVip : next[index].priceVip,
          priceWalkin: patch.priceWalkin !== undefined ? patch.priceWalkin : next[index].priceWalkin,
        }
        return next
      })

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
      refreshTimerRef.current = window.setTimeout(() => {
        setRealtimeRefreshVersion((version) => version + 1)
      }, 100)
    })
  }, [])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        setRealtimeRefreshVersion((version) => version + 1)
      }
    }
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const isDefaultQuery =
      currentPage === 1 &&
      selectedCategory === 'ทั้งหมด' &&
      debouncedSearch.length === 0

    if (
      skipNextFetchRef.current &&
      isDefaultQuery &&
      realtimeRefreshVersion === 0
    ) {
      skipNextFetchRef.current = false
      return
    }

    const load = async () => {
      const showLoadingState = !hasLoadedRef.current
      if (showLoadingState) {
        setIsLoading(true)
      }

      const params = new URLSearchParams({
        pagination: 'true',
        page: String(currentPage),
        limit: String(itemsPerPage),
        live: '1',
      })

      if (selectedCategory && selectedCategory !== 'ทั้งหมด') {
        params.append('category', selectedCategory)
      }

      if (debouncedSearch.length > 0) {
        params.append('search', debouncedSearch)
      }

      try {
        const res = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })

        if (!res.ok) {
          throw new Error('failed')
        }

        const data = (await res.json()) as {
          products: ProductCard[]
          total: number
          page: number
          totalPages: number
          categories?: CategoryInfo[]
        }

        if (cancelled) {
          return
        }

        setProducts(data.products)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        hasLoadedRef.current = true

        if (data.categories) {
          setAllCategories(data.categories)
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }
        if (!cancelled && !hasLoadedRef.current) {
          toast.error('โหลดรายการสินค้าไม่สำเร็จ')
        }
      } finally {
        if (!cancelled && showLoadingState) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [currentPage, selectedCategory, debouncedSearch, realtimeRefreshVersion, itemsPerPage])

  const sortedCategories = useMemo(
    () => [...allCategories].sort((a, b) => a.category.localeCompare(b.category, 'th')),
    [allCategories]
  )

  const categoryMetaMap = useMemo(() => {
    const map = new Map<string, { imageUrl: string | null; count: number }>()
    sortedCategories.forEach((item) => {
      map.set(item.category, { imageUrl: item.imageUrl, count: item.count })
    })
    return map
  }, [sortedCategories])

  const totalCategoryCount = useMemo(
    () => sortedCategories.reduce((sum, item) => sum + item.count, 0),
    [sortedCategories]
  )

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxPages = 7
    
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)
      
      if (currentPage > 3) {
        pages.push('...')
      }
      
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...')
      }
      
      pages.push(totalPages)
    }
    
    return pages
  }

  // Products ถูก sort แล้วใน repository (มีสต็อกมาก่อน, badge, name)
  const prioritizedProducts = products
  const isHomeLayout = layout === 'home'
  const visibleProducts = isHomeLayout
    ? prioritizedProducts.slice(0, HOME_PRODUCT_LIMIT)
    : prioritizedProducts

  return (
    <div className={showFilters ? 'lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 xl:grid-cols-[280px_1fr]' : 'w-full'}>
      {showFilters ? (
        <aside className="hidden lg:block">
        <Card className="dreamy-glass-panel dreamy-category-panel sticky top-24 relative overflow-visible rounded-xl">
          <span
            aria-hidden="true"
            className="appbymari-dreamy-art pointer-events-none absolute inset-0 z-[22] overflow-visible"
          >
            <DreamyOrnament kind="flower" className="absolute -left-3 top-[31%] size-7 -rotate-6" />
            <DreamyOrnament kind="star" className="absolute -right-2 top-[45%] size-6 rotate-12" />
            <DreamyOrnament kind="flower" className="absolute -right-3 top-[64%] size-7 rotate-6" />
            <DreamyOrnament kind="star" className="absolute -left-2 top-[80%] size-5 -rotate-12" />
          </span>
          <CardHeader className="relative z-10 pb-3 pr-16 pt-11">
            <CardTitle className="text-lg font-semibold text-[var(--dreamy-text)]">หมวดหมู่สินค้า</CardTitle>
            <p className="text-xs text-[var(--dreamy-text-muted)]">เลือกดูสินค้าตามหมวดหมู่</p>
          </CardHeader>
          <CardContent className="relative z-10 space-y-1.5 overflow-hidden rounded-b-lg pb-8">
            {[{ category: 'ทั้งหมด', imageUrl: null, count: totalCategoryCount }, ...sortedCategories].map((item) => {
              const isActive = selectedCategory === item.category
              const meta = categoryMetaMap.get(item.category)
              const imageUrl = item.category === 'ทั้งหมด' ? null : meta?.imageUrl ?? item.imageUrl ?? null
              const count = item.category === 'ทั้งหมด' ? totalCategoryCount : meta?.count ?? item.count ?? 0

              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => handleCategoryChange(item.category)}
                  className={cn(
                    'relative z-10 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all',
                    isActive
                      ? 'border-[var(--theme-color)] theme-bg-12 text-[var(--theme-color)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8),0_6px_16px_rgba(211,78,126,0.12)]'
                      : 'border-transparent text-[var(--dreamy-text)] hover:border-[var(--dreamy-border)] hover:bg-white/75'
                  )}
                >
                  <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#F4F4F5]">
                    {item.category === 'ทั้งหมด' ? (
                      <span className="text-xs font-semibold text-[var(--theme-color-text-accent)]">ALL</span>
                    ) : (
                      <CategoryThumbnail imageUrl={imageUrl} category={item.category} size={40} />
                    )}
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold leading-tight">{item.category}</span>
                    <span className="text-xs text-[#6B7280]">{count.toLocaleString()} สินค้า</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'rounded-full border border-transparent bg-[#FFE9ED] text-[11px] font-medium text-[var(--theme-color-text-accent)]',
                      isActive && 'border-[var(--theme-color-text-accent)] bg-[var(--theme-color-text-accent)] text-white'
                    )}
                  >
                    {count.toLocaleString()}
                  </Badge>
                  <ChevronRight className="size-4 text-[#D1D5DB]" />
                </button>
              )
            })}
          </CardContent>
        </Card>
        </aside>
      ) : null}

      <div className="space-y-6 sm:space-y-8">
        {showFilters ? (
          <div className="space-y-3">
          <div className="dreamy-glass-panel relative flex w-full flex-col gap-3 overflow-visible rounded-xl p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex size-10 items-center justify-center rounded-md theme-bg-10 text-[var(--theme-color)]">
                <Search className="size-5" />
              </span>
              <span className="text-sm font-semibold text-[#0B0B0B]">ค้นหา</span>
            </div>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="พิมพ์ชื่อสินค้า เช่น Netflix"
              className="h-11 w-full rounded-lg border border-[var(--dreamy-border)] bg-white/85 text-sm text-[var(--dreamy-text)] shadow-inner focus-visible:ring-[var(--theme-color)]"
              suppressHydrationWarning
            />
            <Button
              type="button"
              size="sm"
              className="h-11 bg-[var(--theme-color)] px-5 text-white shadow-[0_8px_18px_rgba(211,78,126,0.18)] hover:bg-[var(--theme-color)] hover:text-white sm:size-auto"
              onClick={() => setSearchTerm('')}
            >
              <span className="hidden sm:inline">ล้างคำค้น</span>
              <span className="sm:hidden">ล้าง</span>
            </Button>
          </div>

          <div className="w-full lg:hidden" suppressHydrationWarning>
            <div 
              className="flex w-full gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory [-webkit-overflow-scrolling:touch]"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {/* Webkit scrollbar hiding style */}
              <style dangerouslySetInnerHTML={{__html: `
                .scrollbar-none::-webkit-scrollbar {
                  display: none !important;
                }
              `}} />

              {[{ category: 'ทั้งหมด', imageUrl: null, count: totalCategoryCount }, ...sortedCategories].map((item) => {
                const isActive = selectedCategory === item.category
                const meta = categoryMetaMap.get(item.category)
                const imageUrl = item.category === 'ทั้งหมด' ? null : meta?.imageUrl ?? item.imageUrl ?? null
                const count = item.category === 'ทั้งหมด' ? totalCategoryCount : meta?.count ?? item.count ?? 0

                return (
                  <button
                    key={item.category}
                    type="button"
                    onClick={() => handleCategoryChange(item.category)}
                    className={cn(
                      'flex flex-shrink-0 items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left transition-all snap-start',
                      isActive
                        ? 'border-[var(--theme-color)] theme-bg-12 text-[var(--theme-color)] shadow-[0_6px_16px_rgba(211,78,126,0.12)]'
                        : 'border-[var(--dreamy-border)] bg-white/85 text-[var(--dreamy-text)] hover:bg-white'
                    )}
                  >
                    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F4F4F5]">
                      {item.category === 'ทั้งหมด' ? (
                        <span className="text-[10px] font-bold text-[var(--theme-color)]">ALL</span>
                      ) : (
                        <CategoryThumbnail imageUrl={imageUrl} category={item.category} size={32} />
                      )}
                    </span>
                    <div className="flex flex-col min-w-[50px]">
                      <span className="text-xs font-bold leading-tight">{item.category}</span>
                      <span className="text-[10px] text-[#6B7280]">{count} สินค้า</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          </div>
        ) : null}

      {isLoading ? (
        <>
          {/* Compact responsive skeleton: two product cards per row below desktop */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="dreamy-compact-product-card py-0 border-transparent bg-white/95 shadow-sm">
                <CardContent className="flex h-full flex-col gap-2 p-2.5 sm:p-3">
                  <div className="dreamy-compact-product-media rounded-xl theme-bg-10 animate-pulse" />
                  <div className="h-8 w-full rounded theme-bg-15 animate-pulse" />
                  <div className="mt-auto h-8 w-full rounded theme-bg-20 animate-pulse" />
                  <div className="h-9 w-full rounded-lg theme-bg-20 animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Desktop skeleton follows the same horizontal-media card layout. */}
          <div className="hidden xl:grid xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="dreamy-card dreamy-product-card dreamy-compact-product-card border-transparent bg-white shadow-sm">
                <CardContent className="relative z-10 flex h-full min-h-0 flex-col gap-2.5 p-2.5 sm:gap-3 sm:p-4">
                  <div className="dreamy-compact-product-media rounded-xl theme-bg-10 animate-pulse" />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                    <div className="h-8 w-4/5 rounded theme-bg-15 animate-pulse" />
                    <div className="h-5 w-20 rounded theme-bg-10 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded theme-bg-10 animate-pulse" />
                      <div className="h-3 w-full rounded theme-bg-10 animate-pulse" />
                      <div className="h-3 w-3/4 rounded theme-bg-10 animate-pulse" />
                    </div>
                    <div className="mt-auto h-12 w-full rounded theme-bg-15 animate-pulse" />
                    <div className="h-4 w-full rounded theme-bg-10 animate-pulse" />
                    <div className="h-10 w-full rounded-full theme-bg-20 animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          {isHomeLayout ? (
            <div
              data-testid="homepage-product-grid"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
            >
              {visibleProducts.map((product) => (
                <ProductCardItem
                  key={product.id}
                  product={product}
                  showOutOfStockBadge={showOutOfStockBadge}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Mobile and tablet: two compact product cards per row */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:hidden">
                {visibleProducts.map((product) => (
                  <ProductCardItem
                    key={product.id}
                    product={product}
                    showOutOfStockBadge={showOutOfStockBadge}
                  />
                ))}
              </div>

              <div className="hidden xl:grid xl:grid-cols-3 gap-6">
                {visibleProducts.map((product) => (
                  <ProductCardItem
                    key={product.id}
                    product={product}
                    showOutOfStockBadge={showOutOfStockBadge}
                  />
                ))}
              </div>
            </>
          )}

          {visibleProducts.length === 0 && !isLoading ? (
            <div className="rounded-lg bg-[#F4F4F5] p-10 text-center text-sm text-[#6B7280]">
              {isHomeLayout ? 'ขณะนี้ยังไม่มีสินค้าในหน้าร้าน' : 'ไม่พบสินค้าที่ตรงกับการค้นหา'}
            </div>
          ) : null}

          {/* Pagination */}
          {showPagination && totalPages > 1 && (
            <div className="dreamy-glass-panel mt-6 flex items-center justify-between rounded-xl px-4 py-5 sm:px-6">
              <div className="flex w-full items-center justify-between gap-2 sm:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentPage > 1) {
                      setCurrentPage(currentPage - 1)
                    }
                  }}
                  disabled={currentPage === 1 || isLoading}
                  className="theme-border-40 text-[var(--theme-color)] theme-hover-bg-10 hover:border-[var(--theme-color)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ก่อนหน้า
                </Button>
                <select
                  aria-label="เลือกหน้า"
                  value={currentPage}
                  onChange={(event) => setCurrentPage(Number(event.currentTarget.value))}
                  disabled={isLoading}
                  className="h-9 w-[5.25rem] shrink-0 rounded-md border border-[var(--dreamy-border)] bg-white px-2 text-center text-xs font-medium text-[var(--theme-color)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30 disabled:opacity-50"
                >
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNum) => (
                    <option key={pageNum} value={pageNum}>หน้า {pageNum}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentPage < totalPages) {
                      setCurrentPage(currentPage + 1)
                    }
                  }}
                  disabled={currentPage === totalPages || isLoading}
                  className="shrink-0 theme-border-40 text-[var(--theme-color)] theme-hover-bg-10 hover:border-[var(--theme-color)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isHomeLayout ? 'NEXT' : 'ถัดไป'}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-[#9a5832]">
                    แสดง <span className="font-medium text-[#0B0B0B]">{((currentPage - 1) * itemsPerPage) + 1}</span> ถึง{' '}
                    <span className="font-medium text-[#0B0B0B]">
                      {Math.min(currentPage * itemsPerPage, total)}
                    </span>{' '}
                    จาก <span className="font-medium text-[#0B0B0B]">{total.toLocaleString()}</span> รายการ
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentPage > 1) {
                        setCurrentPage(currentPage - 1)
                      }
                    }}
                    disabled={currentPage === 1 || isLoading}
                    className="theme-border-40 text-[var(--theme-color)] theme-hover-bg-10 hover:border-[var(--theme-color)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="size-4" />
                    ก่อนหน้า
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, index) => {
                      if (page === '...') {
                        return (
                          <span key={`ellipsis-${index}`} className="px-2 text-sm text-[#9a5832]">
                            ...
                          </span>
                        )
                      }
                      
                      const pageNum = page as number
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          disabled={isLoading}
                          className={
                            currentPage === pageNum
                              ? 'bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)] border-[var(--theme-color)]'
                              : 'theme-border-40 text-[var(--theme-color)] theme-hover-bg-10 hover:border-[var(--theme-color)]'
                          }
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentPage < totalPages) {
                        setCurrentPage(currentPage + 1)
                      }
                    }}
                    disabled={currentPage === totalPages || isLoading}
                    className="theme-border-40 text-[var(--theme-color)] theme-hover-bg-10 hover:border-[var(--theme-color)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isHomeLayout ? 'NEXT' : 'ถัดไป'}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  </div>
)
}

function ProductCardItem({
  product,
  showOutOfStockBadge,
}: {
  product: ProductCard
  showOutOfStockBadge: boolean
}) {
  const { stock, badge, isPublished, isOutOfStock, price, priceVip, priceWalkin } = useLiveProductStock(
    product.id,
    product.stock,
    product.badge,
    product.price,
    product.priceVip,
    product.priceWalkin
  );
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const productImageCandidates = Array.from(new Set([
    product.imageUrl,
    product.typeImageUrl,
    "/logos/default.svg",
  ].filter((source): source is string => Boolean(source))));
  const productImageUrl = productImageCandidates.find((source) => !failedImageUrls.includes(source));

  return (
    <Card
      className={cn(
        "storefront-product-card dreamy-card dreamy-product-card dreamy-compact-product-card group relative isolate flex h-full min-h-0 flex-col overflow-hidden border py-0 transition-all",
        isOutOfStock
          ? "border-[#D1D5DB]/60 bg-gray-50/95 grayscale hover:shadow-sm hover:border-[#D1D5DB]"
          : "hover:-translate-y-1 theme-hover-border-55"
      )}
      data-card-layer="background"
      data-stock-state={isOutOfStock ? "out-of-stock" : "available"}
    >
      <CardContent data-card-layer="content" className="storefront-product-card-content relative z-10 flex h-full min-h-0 flex-col gap-2.5 p-2.5 text-left sm:gap-3 sm:p-4">
        <div data-card-layer="image" className="storefront-product-image dreamy-compact-product-media relative z-30 w-full shrink-0 overflow-hidden rounded-xl bg-white">
          {productImageUrl ? (
            <Image
              src={productImageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 1279px) 50vw, 33vw"
              className="dreamy-image-preserve object-contain p-1.5 sm:p-2"
              onError={() => setFailedImageUrls((previous) => (
                previous.includes(productImageUrl)
                  ? previous
                  : [...previous, productImageUrl]
              ))}
            />
          ) : (
            <div role="img" aria-label={product.name} className="flex size-full items-center justify-center text-3xl font-bold text-pink-500">
              {product.name.trim().slice(0, 1) || "?"}
            </div>
          )}
        </div>
        <div className="storefront-product-card-details flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
          <CardTitle data-card-layer="title" className={cn(
            "dreamy-compact-product-title relative z-40 min-h-[2.45rem] text-pretty whitespace-pre-line break-words [overflow-wrap:anywhere] text-[13px] font-semibold leading-[1.22] sm:text-base",
            isOutOfStock ? "text-gray-500" : "text-[#0B0B0B]"
          )}>
            {normalizeNewlines(product.name)}
          </CardTitle>
          {(product.typeMenu || (showOutOfStockBadge && isOutOfStock) || (!isOutOfStock && badge) || priceVip != null) && (
            <div className="storefront-product-card-badges relative z-40 flex min-w-0 flex-wrap items-center gap-1">
              {product.typeMenu ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "w-fit max-w-full truncate text-[10px] sm:text-xs",
                    isOutOfStock
                      ? "bg-gray-200 text-gray-500"
                      : "theme-bg-10 text-[var(--theme-color)]"
                  )}
                >
                  {product.typeMenu.toUpperCase()}
                </Badge>
              ) : null}
              {priceVip != null && <VipBadge />}
              {showOutOfStockBadge && isOutOfStock ? (
                <Badge className="bg-gray-700 text-white text-[10px] font-semibold shadow-sm sm:text-xs">
                  สินค้าหมด
                </Badge>
              ) : badge === 'hot_sale' ? (
                <Badge className="bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  HOT SALE
                </Badge>
              ) : badge === 'recommended' ? (
                <Badge className="bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  แนะนำ
                </Badge>
              ) : null}
            </div>
          )}
          <div data-card-layer="price" className="dreamy-price-capsule storefront-price-tag relative z-10 mt-auto">
            <ProductPriceDisplay
              price={price}
              priceVip={priceVip}
              priceWalkin={priceWalkin}
              isOutOfStock={isOutOfStock}
              className="text-sm font-semibold sm:text-base"
            />
          </div>
          <div className="dreamy-product-meta flex w-full items-center justify-between gap-2 text-xs leading-snug text-[#6B7280] sm:text-sm">
            <span className="dreamy-product-stock min-w-0 truncate font-medium">
              {isPublished ? (
                <>สต็อก: <span className="font-semibold text-[#0B0B0B]">{stock != null ? stock.toLocaleString() : 0}</span> ชิ้น</>
              ) : (
                <span className="font-semibold text-gray-500">สินค้าปิดการขาย</span>
              )}
            </span>
            <span className="dreamy-product-code min-w-0 truncate text-right text-[#9CA3AF]">รหัส: {product.typeId}</span>
          </div>
          <div data-card-layer="actions" className="storefront-product-actions relative z-20 grid grid-cols-2 gap-1">
            <PurchaseProductButton
              typeId={product.typeId}
              productName={product.name}
              productDescription={product.details}
              price={price}
              priceVip={priceVip}
              priceWalkin={priceWalkin}
              stock={stock}
              className="dreamy-buy-button storefront-buy-button w-full rounded-lg px-2 py-1.5 text-xs sm:rounded-xl sm:py-2 sm:text-sm"
              disabled={isOutOfStock}
            >
              ซื้อทันที
            </PurchaseProductButton>
            <AddToCartButton
              typeId={product.typeId}
              productName={product.name}
              imageUrl={productImageUrl ?? "/logos/default.svg"}
              price={price}
              priceVip={priceVip}
              priceWalkin={priceWalkin}
              stock={stock}
              disabled={isOutOfStock}
              className="dreamy-cart-button w-full rounded-lg px-2 py-1.5 text-xs sm:rounded-xl sm:py-2 sm:text-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

