import { useEffect, useState, useSyncExternalStore } from 'react'
export function useLocal<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem('sendit:' + key); return s ? (JSON.parse(s) as T) : init } catch { return init } })
  useEffect(() => { localStorage.setItem('sendit:' + key, JSON.stringify(v)) }, [key, v])
  return [v, setV]
}
/** Global last-price store (fed by tickers/trades), read with per-symbol subscriptions. */
const prices = new Map<string, { p: number; chg?: number }>(), subs = new Set<() => void>()
let ver = 0, queued = false
export const setPrice = (s: string, p: number, chg?: number) => {
  prices.set(s, { p, chg: chg ?? prices.get(s)?.chg })
  if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; ver++; subs.forEach((f) => f()) }) }
}
export const getPrice = (s: string) => prices.get(s)
export const usePrices = () => { useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => ver); return prices }
export const fmt = (p?: number) => p == null || !isFinite(p) ? '—' : p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : p >= 1 ? p.toFixed(p >= 100 ? 2 : 4) : p >= 0.0001 ? p.toPrecision(4) : p.toExponential(3)
export const compact = (v?: number) => v == null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v)
export const usd = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
