export function hoursAgo(createdUtcSeconds: number): number {
  const now = Date.now() / 1000
  const diffSeconds = Math.max(0, Math.floor(now - createdUtcSeconds))
  return Math.floor(diffSeconds / 3600)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
