/** Device hints supplement coarse-pointer detection for mobile touch controls. */
export type DeviceSignals = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
};
export function isMobileDevice(device: DeviceSignals): boolean {
  const ua = device.userAgent ?? "";
  if (device.userAgentData?.mobile === true) return true;
  if (
    /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Mobile|Tablet|Silk/i.test(
      ua,
    )
  )
    return true;
  // iPadOS Safari can present itself as a Macintosh with touch support.
  return (
    (device.platform === "MacIntel" || /Macintosh/i.test(ua)) &&
    (device.maxTouchPoints ?? 0) > 1
  );
}
