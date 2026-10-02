export function getKeyboardInset(layoutHeight: number, visualHeight: number, offsetTop: number): number {
  if (![layoutHeight, visualHeight, offsetTop].every(Number.isFinite) || layoutHeight <= 0 || visualHeight <= 0) return 0;
  return Math.max(0, layoutHeight - visualHeight - Math.max(0, offsetTop));
}
