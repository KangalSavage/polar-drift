// Thin wrapper around Capacitor Haptics. No-ops silently on platforms/browsers
// without haptic support (its web implementation itself no-ops where the
// Vibration API isn't available), so it's always safe to call.
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let enabled = true;

export const Vibe = {
  setEnabled(value) {
    enabled = value;
  },
  light() {
    if (!enabled) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  medium() {
    if (!enabled) return;
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  heavy() {
    if (!enabled) return;
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  },
  success() {
    if (!enabled) return;
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  error() {
    if (!enabled) return;
    Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  },
};
