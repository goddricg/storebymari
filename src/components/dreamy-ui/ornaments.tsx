import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DreamyOrnamentKind =
  | "bow"
  | "flower"
  | "star"
  | "heart"
  | "cloud"
  | "rainbow"
  | "sparkle"
  | "pearls"
  | "teddy";

type DreamyOrnamentProps = {
  kind: DreamyOrnamentKind;
  className?: string;
};

const commonSvgProps = {
  viewBox: "0 0 48 48",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
  focusable: false,
  shapeRendering: "geometricPrecision" as const,
};

export function DreamyOrnament({ kind, className }: DreamyOrnamentProps) {
  const svgClass = cn(
    "appbymari-dreamy-art dreamy-default-ornament block size-8 overflow-visible drop-shadow-[0_3px_5px_rgba(229,92,137,0.18)]",
    className
  );

  switch (kind) {
    case "bow":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path
            d="M22 21c-5-7-14-10-17-5-3 5 4 13 16 10"
            fill="#ffc2d5"
            stroke="#e95d8c"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M26 21c5-7 14-10 17-5 3 5-4 13-16 10"
            fill="#ffd2df"
            stroke="#e95d8c"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x="20"
            y="19"
            width="8"
            height="9"
            rx="3"
            fill="#ff8db2"
            stroke="#e95d8c"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="m21 27-5 12 8-5 8 5-5-12"
            fill="#ffc2d5"
            stroke="#e95d8c"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M9 18c3 0 7 2 10 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "flower":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          {[
            "M24 20C15 6 8 14 17 24",
            "M28 24C42 15 34 8 24 17",
            "M24 28C33 42 40 34 31 24",
            "M20 24C6 33 14 40 24 31",
          ].map((d) => (
            <path
              key={d}
              d={d}
              fill="#ffd1df"
              stroke="#ed77a0"
              strokeWidth="1.8"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <circle cx="24" cy="24" r="6" fill="#ffe589" stroke="#eebf4a" strokeWidth="1.8" />
          <circle cx="22" cy="21" r="1.4" fill="#fff9d9" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path
            d="m24 5 5.2 11.4L42 18l-9.5 8.6L35 39l-11-6.4L13 39l2.5-12.4L6 18l12.8-1.6L24 5Z"
            fill="#ffe58d"
            stroke="#f2b94b"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path d="m17 18 7-6 2.2 5" stroke="#fff9d9" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      );
    case "heart":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path
            d="M24 40S7 30 7 17c0-8 10-11 17-3 7-8 17-5 17 3 0 13-17 23-17 23Z"
            fill="#ffb6ce"
            stroke="#e75f91"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M13 18c1-4 5-5 8-2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path
            d="M11 36h27c5 0 8-3 8-7s-3-7-8-7h-1C36 14 30 9 23 11c-5 1-8 5-9 10-6-1-11 2-11 8 0 4 3 7 8 7Z"
            fill="#fff"
            stroke="#dba8c4"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M12 31h25" stroke="#ffd4e3" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "rainbow":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path d="M6 34a18 18 0 0 1 36 0" stroke="#f38fb0" strokeWidth="6" strokeLinecap="round" />
          <path d="M11 34a13 13 0 0 1 26 0" stroke="#ffd47c" strokeWidth="6" strokeLinecap="round" />
          <path d="M16 34a8 8 0 0 1 16 0" stroke="#9bd7df" strokeWidth="6" strokeLinecap="round" />
          <path d="M21 34a3 3 0 0 1 6 0" stroke="#c7ace8" strokeWidth="6" strokeLinecap="round" />
          <circle cx="7" cy="35" r="6" fill="#fff" stroke="#e1b2cb" strokeWidth="1.5" />
          <circle cx="41" cy="35" r="6" fill="#fff" stroke="#e1b2cb" strokeWidth="1.5" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path
            d="M24 3c1 13 7 19 20 21-13 2-19 8-20 21-2-13-8-19-21-21C16 22 22 16 24 3Z"
            fill="#fff"
            stroke="#f2a8c4"
            strokeWidth="1.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx="38" cy="10" r="3" fill="#ffe58d" />
          <circle cx="9" cy="38" r="2.5" fill="#b7e5df" />
        </svg>
      );
    case "pearls":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <path d="M6 28c10-14 26-14 36 0" stroke="#f2a7c2" strokeWidth="2" strokeLinecap="round" />
          {[8, 14, 21, 28, 35, 41].map((cx, index) => (
            <circle
              key={cx}
              cx={cx}
              cy={index < 3 ? 25 - index * 3 : 19 + (index - 2) * 3}
              r="3.5"
              fill={index % 2 === 0 ? "#fff" : "#ffd3e2"}
              stroke="#e9a5bf"
              strokeWidth="1.2"
            />
          ))}
        </svg>
      );
    case "teddy":
      return (
        <svg {...commonSvgProps} className={svgClass}>
          <circle cx="12" cy="14" r="7" fill="#dcae88" stroke="#9b6d53" strokeWidth="1.8" />
          <circle cx="36" cy="14" r="7" fill="#dcae88" stroke="#9b6d53" strokeWidth="1.8" />
          <circle cx="24" cy="25" r="17" fill="#e8bf9a" stroke="#9b6d53" strokeWidth="2" />
          <ellipse cx="24" cy="30" rx="8" ry="6" fill="#f7dfc7" />
          <circle cx="18" cy="23" r="2" fill="#5b3b31" />
          <circle cx="30" cy="23" r="2" fill="#5b3b31" />
          <path d="M22 28h4l-2 2-2-2Z" fill="#5b3b31" />
          <path d="M20 33c2 2 6 2 8 0" stroke="#5b3b31" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 10c2-2 4-2 6 0" stroke="#f7dfc7" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

const cardVariants: Array<
  Array<{ kind: DreamyOrnamentKind; className: string }>
> = [
  [
    { kind: "bow", className: "-right-3 -top-4 size-10 rotate-6 text-pink-400" },
    { kind: "star", className: "-bottom-2 left-3 size-6 -rotate-12" },
    { kind: "sparkle", className: leftAccent("top-20") },
  ],
  [
    { kind: "flower", className: "-left-3 -top-3 size-9 -rotate-6" },
    { kind: "heart", className: "-bottom-2 right-4 size-6 rotate-12" },
    { kind: "flower", className: rightAccent("top-1/2") },
  ],
  [
    { kind: "rainbow", className: "-left-4 -top-4 size-12" },
    { kind: "cloud", className: "-bottom-3 right-2 size-10" },
    { kind: "star", className: rightAccent("top-16") },
  ],
  [
    { kind: "pearls", className: "-right-1 -top-4 size-12 rotate-6" },
    { kind: "flower", className: "-bottom-3 left-5 size-8" },
    { kind: "sparkle", className: leftAccent("top-1/2") },
  ],
  [
    { kind: "bow", className: "-left-3 -top-4 size-10 -rotate-6" },
    { kind: "bow", className: "-bottom-4 right-1 size-9 rotate-[165deg]" },
    { kind: "heart", className: rightAccent("top-24") },
  ],
  [
    { kind: "star", className: "-right-2 -top-3 size-9 rotate-12" },
    { kind: "sparkle", className: "-bottom-2 left-4 size-8" },
    { kind: "star", className: leftAccent("top-24") },
  ],
  [
    { kind: "teddy", className: "-left-3 -top-4 size-10 -rotate-6" },
    { kind: "flower", className: "-bottom-3 right-4 size-8" },
    { kind: "sparkle", className: rightAccent("top-1/2") },
  ],
  [
    { kind: "heart", className: "-right-2 -top-3 size-8 rotate-6" },
    { kind: "cloud", className: "-bottom-3 left-3 size-10" },
    { kind: "heart", className: leftAccent("top-20") },
  ],
];

function leftAccent(position: string) {
  return cn("-left-2 hidden size-5 sm:block", position);
}

function rightAccent(position: string) {
  return cn("-right-2 hidden size-5 sm:block", position);
}

export function KawaiiCardOrnaments({
  variant,
  className,
}: {
  variant: number;
  className?: string;
}) {
  const ornaments = cardVariants[Math.abs(variant) % cardVariants.length];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "appbymari-dreamy-art pointer-events-none absolute inset-0 z-20 overflow-visible",
        className
      )}
    >
      {ornaments.map((ornament, index) => (
        <DreamyOrnament
          key={`${ornament.kind}-${index}`}
          kind={ornament.kind}
          className={ornament.className}
        />
      ))}
    </span>
  );
}

const cornerCardVariants: Array<
  Array<{ kind: DreamyOrnamentKind; className: string }>
> = [
  [
    { kind: "bow", className: "absolute -right-2 -top-3 size-9 rotate-6" },
    { kind: "sparkle", className: "absolute right-7 top-5 size-4" },
  ],
  [
    { kind: "flower", className: "absolute -right-2 -top-2 size-8 -rotate-6" },
    { kind: "heart", className: "absolute right-7 top-5 size-4 rotate-12" },
  ],
  [
    { kind: "rainbow", className: "absolute -right-3 -top-3 size-11" },
  ],
  [
    { kind: "pearls", className: "absolute -right-1 -top-3 size-10 rotate-6" },
    { kind: "star", className: "absolute right-8 top-5 size-4 -rotate-12" },
  ],
  [
    { kind: "sparkle", className: "absolute -right-1 -top-2 size-8 rotate-6" },
    { kind: "flower", className: "absolute right-6 top-4 size-5 -rotate-12" },
  ],
  [
    { kind: "bow", className: "absolute -right-3 -top-3 size-9 -rotate-6" },
  ],
  [
    { kind: "cloud", className: "absolute -right-3 -top-2 size-10" },
    { kind: "star", className: "absolute right-7 top-5 size-4 rotate-12" },
  ],
  [
    { kind: "heart", className: "absolute -right-1 -top-2 size-8 rotate-6" },
    { kind: "sparkle", className: "absolute right-6 top-5 size-4" },
  ],
];

export function CornerCardOrnaments({
  variant,
  className,
}: {
  variant: number;
  className?: string;
}) {
  const ornaments =
    cornerCardVariants[Math.abs(variant) % cornerCardVariants.length];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "appbymari-dreamy-art pointer-events-none absolute inset-0 z-30 overflow-visible",
        className
      )}
    >
      {ornaments.map((ornament, index) => (
        <DreamyOrnament
          key={`${ornament.kind}-${index}`}
          kind={ornament.kind}
          className={ornament.className}
        />
      ))}
    </span>
  );
}

export function DreamyBackdropOrnaments({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "appbymari-dreamy-art halloween-backdrop-ornaments christmas-backdrop-ornaments pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <DreamyOrnament
        kind="cloud"
        className="absolute left-[3%] top-20 size-20 opacity-55 sm:size-28"
      />
      <DreamyOrnament
        kind="rainbow"
        className="absolute -left-5 top-[34%] size-24 opacity-45 sm:size-36"
      />
      <DreamyOrnament
        kind="sparkle"
        className="absolute right-[9%] top-24 size-7 animate-[dreamy-sparkle_3.6s_ease-in-out_infinite]"
      />
      <DreamyOrnament
        kind="heart"
        className="absolute right-[3%] top-[22%] size-10 rotate-12 opacity-40 sm:size-14"
      />
      <DreamyOrnament
        kind="flower"
        className="absolute bottom-[22%] left-[5%] size-8 -rotate-12 opacity-55"
      />
      <DreamyOrnament
        kind="star"
        className="absolute bottom-[12%] right-[7%] size-8 rotate-12 opacity-60"
      />
      <span
        aria-hidden="true"
        className="halloween-mascot halloween-mascot-day"
      />
      <span
        aria-hidden="true"
        className="halloween-mascot halloween-mascot-night"
      />
      <span
        aria-hidden="true"
        className="christmas-mascot christmas-mascot-day"
      />
      <span
        aria-hidden="true"
        className="christmas-mascot christmas-mascot-night"
      />
    </div>
  );
}

export function DreamyGlassPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("dreamy-glass-panel", className)}>
      {children}
    </div>
  );
}
