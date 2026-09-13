"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicSettings } from "@/components/public-settings-provider";
import { DreamyOrnament } from "@/components/dreamy-ui/ornaments";
import { BorderBeam } from "@/components/ui/border-beam";

const DEFAULT_POSTER_IMAGE_URL =
  "https://img5.pic.in.th/file/secure-sv1/696b7d56-5aa2-4f30-a1f4-4a74c4fe44ef.webp";

export default function HomePoster() {
  const pathname = usePathname();
  const settings = usePublicSettings();

  if (pathname !== "/") {
    return null;
  }

  const enabled = settings.home_poster_enabled === "true";
  if (!enabled) {
    return null;
  }

  const imageUrl = settings.home_poster_image_url?.trim() || DEFAULT_POSTER_IMAGE_URL;
  const linkUrl = settings.home_poster_link_url?.trim() || null;
  const posterContent = (
    <div className="dreamy-poster-frame group relative block overflow-hidden rounded-2xl p-1 transition duration-300 hover:-translate-y-0.5 sm:p-1.5">
      <BorderBeam
        size={180}
        duration={8}
        colorFrom="#ff3cac"
        colorTo="#40c9ff"
        borderWidth={3}
        className="dreamy-rainbow-beam opacity-90"
      />
      <div className="relative overflow-hidden rounded-xl bg-white">
        <Image
          src={imageUrl}
          alt="Poster โฆษณาหน้าแรก"
          width={1600}
          height={900}
          priority
          sizes="(max-width: 1024px) 100vw, 1152px"
          className="dreamy-image-preserve h-full w-full object-cover"
        />
      </div>
    </div>
  );

  return (
    <div className="dreamy-poster-band relative border-b border-white/70">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <DreamyOrnament
          kind="cloud"
          className="absolute -left-4 bottom-2 hidden size-20 opacity-60 sm:block"
        />
        <DreamyOrnament
          kind="sparkle"
          className="absolute right-[4%] top-8 hidden size-8 animate-[dreamy-sparkle_3.6s_ease-in-out_infinite] sm:block"
        />
      </div>
      <div className="relative mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-10">
        {linkUrl && settings.home_poster_image_url?.trim() ? (
          <Link
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-pink-50"
          >
            {posterContent}
          </Link>
        ) : (
          posterContent
        )}
      </div>
    </div>
  );
}
