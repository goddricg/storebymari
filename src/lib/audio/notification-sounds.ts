"use client";

/**
 * AppbyMari Notification Sound System
 * 
 * 3 Distinct Sound Presets:
 * 1. admin_support: Chime alert when user submits a new support case (for Admins)
 * 2. case_resolved: Sparkle fanfare when case is resolved/replied (for Customers/Users)
 * 3. general_announcement: Bubbly chime for broadcasts, promos, and completed orders
 */

export type NotificationSoundType = "admin_support" | "case_resolved" | "general_announcement";

export interface SoundPresetMeta {
  type: NotificationSoundType;
  label: string;
  description: string;
  file: string;
}

export const NOTIFICATION_SOUNDS: Record<NotificationSoundType, SoundPresetMeta> = {
  admin_support: {
    type: "admin_support",
    label: "เสียงเคสใหม่เข้ามา (แอดมิน)",
    description: "กระดิ่งคู่โทนใสชัดเจน สำหรับเตือนแอดมินเมื่อมีเคสใหม่",
    file: "/sounds/admin-support-case.wav",
  },
  case_resolved: {
    type: "case_resolved",
    label: "เสียงเคสแก้ไขเสร็จ / ตอบกลับ (ลูกค้า)",
    description: "เสียงสปาร์คเคิลใส 4 โน้ต ฟีลลิ่งแก้ไขสำเร็จและน่ารัก",
    file: "/sounds/case-resolved.wav",
  },
  general_announcement: {
    type: "general_announcement",
    label: "เสียงประกาศทั่วไป / ออเดอร์ (ทั่วไป)",
    description: "เสียงกระดิ่งขี้เล่น 3 โน้ต สำหรับโปรโมชั่นและคำสั่งซื้อ",
    file: "/sounds/general-announcement.wav",
  },
};

const SOUND_STORAGE_KEY = "appbymari_notification_sound_muted";

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, muted ? "true" : "false");
  } catch {
    // ignore
  }
}

/**
 * Plays the requested notification sound.
 * Ignores errors caused by browser autoplay policies before initial user interaction.
 */
export async function playNotificationSound(
  type: NotificationSoundType,
  force = false,
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (!force && isSoundMuted()) {
    return false;
  }

  const preset = NOTIFICATION_SOUNDS[type];
  if (!preset) return false;

  try {
    const audio = new Audio(preset.file);
    audio.volume = 0.85;
    await audio.play();
    return true;
  } catch (error: any) {
    // If blocked by browser autoplay policy (NotAllowedError) or audio file issue,
    // fallback to Web Audio API synthesizer
    return synthesizeFallbackTone(type);
  }
}

/**
 * Preview sound with force = true (triggered directly by user click)
 */
export async function previewNotificationSound(type: NotificationSoundType): Promise<boolean> {
  return playNotificationSound(type, true);
}

/**
 * Mathematical Web Audio API fallback in case audio file loading fails
 */
function synthesizeFallbackTone(type: NotificationSoundType): boolean {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return false;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (type === "admin_support") {
      // Two-tone bell E5 -> B5
      playSynthNote(ctx, gain, 659.25, now, 0.3);
      playSynthNote(ctx, gain, 987.77, now + 0.15, 0.35);
    } else if (type === "case_resolved") {
      // 4-note ascending sparkle
      playSynthNote(ctx, gain, 523.25, now, 0.2);
      playSynthNote(ctx, gain, 783.99, now + 0.12, 0.25);
      playSynthNote(ctx, gain, 1046.50, now + 0.24, 0.3);
      playSynthNote(ctx, gain, 1318.51, now + 0.36, 0.4);
    } else {
      // 3-note playful bounce
      playSynthNote(ctx, gain, 440.00, now, 0.18);
      playSynthNote(ctx, gain, 554.37, now + 0.11, 0.2);
      playSynthNote(ctx, gain, 880.00, now + 0.22, 0.35);
    }

    return true;
  } catch {
    return false;
  }
}

function playSynthNote(
  ctx: AudioContext,
  destinationGain: GainNode,
  freq: number,
  startTime: number,
  duration: number,
) {
  const osc = ctx.createOscillator();
  const noteGain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);

  noteGain.gain.setValueAtTime(0.001, startTime);
  noteGain.gain.exponentialRampToValueAtTime(0.5, startTime + 0.01);
  noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(noteGain);
  noteGain.connect(destinationGain);

  osc.start(startTime);
  osc.stop(startTime + duration);
}
