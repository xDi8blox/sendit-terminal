import type { Kline } from './binance'
export const ema = (k: Kline[], n: number) => { const a = 2 / (n + 1); let e = k[0]?.close ?? 0; return k.map((x, i) => ({ time: x.time, value: (e = i ? x.close * a + e * (1 - a) : x.close) })) }
export function rsi(k: Kline[], n = 14) {
  let g = 0, l = 0; const out: { time: number; value: number }[] = []
  for (let i = 1; i < k.length; i++) {
    const d = k[i].close - k[i - 1].close, up = Math.max(0, d), dn = Math.max(0, -d)
    if (i <= n) { g += up / n; l += dn / n } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n }
    if (i >= n) out.push({ time: k[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) })
  }
  return out
}
/** Session VWAP, resetting at 00:00 UTC. */
export function vwap(k: Kline[]) {
  let pv = 0, v = 0, day = -1
  return k.map((x) => { const d = Math.floor(x.time / 86400); if (d !== day) { day = d; pv = 0; v = 0 } const tp = (x.high + x.low + x.close) / 3; pv += tp * x.volume; v += x.volume; return { time: x.time, value: v ? pv / v : x.close } })
}
