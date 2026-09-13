"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { KawaiiCardOrnaments } from "@/components/dreamy-ui/ornaments";

export default function MovieGallery({ posters }: { posters: string[] }) {
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);

  return (
    <>
      <div className="columns-2 gap-3 sm:gap-4 md:gap-6 space-y-3 sm:space-y-4 md:space-y-6">
        {posters.map((poster, index) => (
          <div
            key={index}
            onClick={() => setSelectedPoster(poster)}
            className="dreamy-glass-panel group relative w-full cursor-pointer break-inside-avoid overflow-visible rounded-xl p-1.5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--dreamy-shadow-hover)]"
          >
            <KawaiiCardOrnaments variant={index + 3} />
            <div className="relative overflow-hidden rounded-lg bg-white">
              <img
                src={poster}
                alt={`Movie Poster ${index + 1}`}
                className="dreamy-image-preserve block h-auto w-full object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selectedPoster} onOpenChange={(open) => !open && setSelectedPoster(null)}>
        <DialogContent className="max-w-[90vw] md:max-w-[600px] p-2 border-none bg-transparent shadow-none flex items-center justify-center focus-visible:outline-none">
          <DialogTitle className="sr-only">รูปภาพหนังใหม่ขนาดเต็ม</DialogTitle>
          <div className="relative w-full max-h-[85vh] flex items-center justify-center overflow-hidden rounded-2xl bg-black/5 shadow-2xl">
            <button
              onClick={() => setSelectedPoster(null)}
              className="absolute top-4 right-4 z-50 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 transition"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
            {selectedPoster && (
              <img
                src={selectedPoster}
                alt="Full Movie Poster"
                className="dreamy-image-preserve max-h-[80vh] w-auto max-w-full rounded-xl object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
