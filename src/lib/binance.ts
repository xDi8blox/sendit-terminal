// Binance public market data (keyless). Falls back to the binance.vision mirror, then to a local simulator.
const REST = ['https://api.binance.com', 'https://data-api.binance.vision']
const WS = ['wss://stream.binance.com:9443/stream', 'wss://data-stream.binance.vision/stream']
export type Kline = { time: number; open: number; high: number; low: number; close: number; volume: number }
export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
export type Interval = (typeof INTERVALS)[number]
const SEC: Record<Interval, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }

let restIdx = 0
export async function rest<T>(path: string): Promise<T> {
  for (let i = 0; i < REST.length; i++) {
    const base = REST[(restIdx + i) % REST.length]
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000)
      const r = await fetch(base + path, { signal: c.signal }); clearTimeout(t)
      if (r.ok) { restIdx = (restIdx + i) % REST.length; return (await r.json()) as T }
    } catch { /* try next */ }
  }
  throw new Error('Binance REST unreachable')
}
export const parseK = (k: (string | number)[]): Kline => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })

export async function klines(symbol: string, interval: Interval, limit = 500): Promise<{ data: Kline[]; sim: boolean }> {
  try { return { data: (await rest<(string | number)[][]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)).map(parseK), sim: false } }
  catch { return { data: simKlines(symbol, interval, limit), sim: true } }
}
export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRUMPUSDT', 'FETUSDT', 'SHIBUSDT', 'ADAUSDT', 'TONUSDT', 'JUPUSDT', 'PENGUUSDT', 'FLOKIUSDT', 'ENAUSDT', 'TAOUSDT', 'NEARUSDT', 'APTUSDT']
const SEED: Record<string, number> = { BTCUSDT: 82000, ETHUSDT: 2430, SOLUSDT: 165, BNBUSDT: 720, XRPUSDT: 2.3, DOGEUSDT: 0.18, PEPEUSDT: 0.0000098, WIFUSDT: 1.9 }

// ---------- simulator (used only when Binance is unreachable / geoblocked) ----------
function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }
function simKlines(symbol: string, interval: Interval, n: number): Kline[] {
  const r = rng([...symbol].reduce((a, c) => a + c.charCodeAt(0), 7)), s = SEC[interval], now = Math.floor(Date.now() / 1000 / s) * s
  let p = SEED[symbol] ?? 10
  const out: Kline[] = []
  for (let i = n - 1; i >= 0; i--) {
    const o = p, vol = 0.004 * Math.sqrt(s / 60); const c = o * (1 + (r() - 0.5) * vol * 2 + Math.sin(i / 37) * vol * 0.2)
    out.push({ time: now - i * s, open: o, close: c, high: Math.max(o, c) * (1 + r() * vol), low: Math.min(o, c) * (1 - r() * vol), volume: 50 + r() * 400 }); p = c
  }
  return out
}

// ---------- multiplexed websocket ----------
type Handler = (data: unknown) => void
class Stream {
  private ws?: WebSocket; private host = 0; private handlers = new Map<string, Set<Handler>>(); private id = 1; private backoff = 500; private open = false
  status: 'connecting' | 'live' | 'sim' = 'connecting'; onStatus?: (s: Stream['status']) => void
  private fails = 0
  private connect() {
    const ws = new WebSocket(WS[this.host]); this.ws = ws
    ws.onopen = () => { this.open = true; this.backoff = 500; this.fails = 0; this.set('live'); if (this.handlers.size) this.send('SUBSCRIBE', [...this.handlers.keys()]) }
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.stream) this.handlers.get(m.stream)?.forEach((h) => h(m.data)) }
    ws.onclose = () => {
      this.open = false; this.fails++
      if (this.fails >= 4 && this.status !== 'live') this.set('sim')
      this.host = (this.host + 1) % WS.length
      setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(15000, this.backoff * 2)
    }
    ws.onerror = () => ws.close()
  }
  private simT = 0
  private set(s: Stream['status']) {
    this.status = s; this.onStatus?.(s)
    if (s === 'sim' && !this.simT) this.simT = window.setInterval(() => this.simTick(), 500)
    if (s === 'live' && this.simT) { clearInterval(this.simT); this.simT = 0 }
  }
  /** Emit Binance-shaped synthetic messages for every subscribed stream. */
  private simP = new Map<string, number>()
  seed(sym: string, p: number) { if (!this.simP.has(sym)) this.simP.set(sym, p) }
  private simTick() {
    const now = Date.now()
    for (const [key, hs] of this.handlers) {
      const [sl, kind] = key.split('@'), sym = sl.toUpperCase()
      let p = this.simP.get(sym) ?? SEED[sym] ?? 10
      p *= 1 + (Math.random() - 0.5) * 0.0015; this.simP.set(sym, p)
      let d: unknown
      if (kind.startsWith('kline')) { const iv = kind.split('_')[1] as Interval, s = SEC[iv] * 1000, t = Math.floor(now / s) * s; d = { k: { t, o: p, h: p * 1.0005, l: p * 0.9995, c: p, v: Math.random() * 5, x: false } } }
      else if (kind === 'miniTicker') d = { s: sym, c: p, o: p * 0.98, h: p * 1.03, l: p * 0.97, v: 1e6 }
      else if (kind === 'aggTrade') d = { p, q: Math.random() * 2, T: now, m: Math.random() > 0.5 }
      else if (kind.startsWith('depth')) d = { bids: Array.from({ length: 20 }, (_, i) => [p * (1 - (i + 1) * 0.0002), Math.random() * 4 + i * 0.2]), asks: Array.from({ length: 20 }, (_, i) => [p * (1 + (i + 1) * 0.0002), Math.random() * 4 + i * 0.2]) }
      hs.forEach((h) => h(d))
    }
  }
  private send(method: string, params: string[]) { if (this.open && params.length) this.ws?.send(JSON.stringify({ method, params, id: this.id++ })) }
  sub(stream: string, h: Handler) {
    if (!this.ws) this.connect()
    let set = this.handlers.get(stream)
    if (!set) { set = new Set(); this.handlers.set(stream, set); this.send('SUBSCRIBE', [stream]) }
    set.add(h)
    return () => { set!.delete(h); if (!set!.size) { this.handlers.delete(stream); this.send('UNSUBSCRIBE', [stream]) } }
  }
}
export const stream = new Stream()

export const intervalSec = (i: Interval) => SEC[i]
