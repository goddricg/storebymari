/**
 * Lightweight Haptic Feedback Utility
 * Uses navigator.vibrate with platform feature-detection and fallback safety.
 */

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined') return;

  // Feature detection to avoid crashes/warnings on unsupported browsers (e.g. iOS Safari)
  if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
    return;
  }

  try {
    switch (type) {
      case 'light':
        // Subtle tap for tabs, toggles, chips
        navigator.vibrate(12);
        break;
      case 'medium':
        // Standard feedback for drawer toggle, button clicks
        navigator.vibrate(24);
        break;
      case 'heavy':
        // Emphasized feedback for main action triggers
        navigator.vibrate(40);
        break;
      case 'success':
        // Pattern: short vibration, pause, medium vibration
        navigator.vibrate([18, 40, 28]);
        break;
      case 'warning':
      case 'error':
        // Pattern: double strong tap
        navigator.vibrate([35, 50, 35]);
        break;
      default:
        navigator.vibrate(12);
        break;
    }
  } catch {
    // Gracefully ignore environments where vibration is blocked or restricted
  }
}
