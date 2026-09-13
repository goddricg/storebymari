export const DISPLAY_NAME_MIN_LENGTH = 4;
export const DISPLAY_NAME_MAX_LENGTH = 60;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;

export function normalizeDisplayName(value: string): string {
  return value.trim();
}

export function getDisplayNameError(value: string): string | null {
  const normalized = normalizeDisplayName(value);
  const characterCount = Array.from(normalized).length;

  if (characterCount < DISPLAY_NAME_MIN_LENGTH) {
    return `ชื่อแสดงต้องมีอย่างน้อย ${DISPLAY_NAME_MIN_LENGTH} ตัวอักษร`;
  }

  if (characterCount > DISPLAY_NAME_MAX_LENGTH) {
    return `ชื่อแสดงต้องมีไม่เกิน ${DISPLAY_NAME_MAX_LENGTH} ตัวอักษร`;
  }

  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    return "ชื่อแสดงไม่สามารถมีอักขระควบคุมหรือขึ้นบรรทัดใหม่ได้";
  }

  return null;
}

export function countDisplayNameCharacters(value: string): number {
  return Array.from(normalizeDisplayName(value)).length;
}
