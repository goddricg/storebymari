'use client'

import Image from 'next/image'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { X, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'

type ProductImageLightboxProps = {
  src: string
  alt: string
  sizes: string
  unoptimized?: boolean
  className?: string
  onError?: () => void
}

export function ProductImageLightbox({
  src,
  alt,
  sizes,
  unoptimized = false,
  className,
  onError,
}: ProductImageLightboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    const previousActiveElement = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousActiveElement?.focus()
    }
  }, [isOpen])

  const closeLightbox = () => setIsOpen(false)

  return (
    <>
      <button
        type="button"
        className={cn(
          'group relative block size-full cursor-zoom-in overflow-hidden rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
          className
        )}
        aria-label={`ดูรูปภาพสินค้า ${alt} แบบเต็มจอ`}
        onClick={() => setIsOpen(true)}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized={unoptimized}
          className="dreamy-image-preserve object-cover p-0 transition-transform duration-300 group-hover:scale-[1.02]"
          onError={onError}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:text-xs"
        >
          <ZoomIn className="size-3.5" />
          ดูภาพเต็ม
        </span>
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeLightbox()
              }}
            >
              <div
                className="relative h-[70vh] w-[70vw] max-w-[96vw] rounded-2xl border border-pink-300/70 bg-[#09030d]/95 p-1.5 shadow-[0_0_45px_rgba(255,66,169,0.42)] sm:rounded-3xl sm:p-2 lg:h-[80vh] lg:w-[80vw]"
                role="dialog"
                aria-modal="true"
                aria-label={`รูปภาพสินค้า ${alt}`}
              >
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="absolute right-2 top-2 z-10 inline-flex size-9 items-center justify-center rounded-full border border-white/40 bg-black/75 text-white shadow-lg transition hover:scale-105 hover:bg-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
                  aria-label="ปิดรูปภาพ"
                  onClick={closeLightbox}
                >
                  <X className="size-5" />
                </button>
                <div className="relative size-full overflow-hidden rounded-xl bg-black/45 sm:rounded-2xl">
                  <Image
                    src={src}
                    alt={alt}
                    fill
                    sizes="80vw"
                    unoptimized={unoptimized}
                    className="object-contain"
                    onError={onError}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
