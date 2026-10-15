import { useCallback, useEffect, useRef, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import type { Layouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { INTERVALS, SYMBOLS, stream } from './lib/binance'
import type { Interval } from './lib/binance'
import { freshPaper } from './lib/paper'
import type { Paper as PaperT } from './lib/paper'
import { fmt, setPrice, useLocal, usePrices } from './lib/store'
import { Chart } from './panels/Chart'
import type { Ind } from './panels/Chart'
import { OrderBook, Tape, Watchlist } from './panels/Market'
import { Alerts, Paper } from './panels/Trade'
import type { Alert } from './panels/Trade'
import { Trending } from './panels/Trending'

const Grid = WidthProvider(Responsive)
const DEFAULT: Layouts = {
  lg: [{ i: 'chart', x: 0, y: 0, w: 14, h: 17 }, { i: 'book', x: 14, y: 0, w: 5, h: 17 }, { i: 'tape', x: 19, y: 0, w: 5, h: 17 }, { i: 'watch', x: 0, y: 17, w: 6, h: 14 }, { i: 'trend', x: 6, y: 17, w: 12, h: 14 }, { i: 'paper', x: 18, y: 17, w: 6, h: 14 }, { i: 'alerts', x: 0, y: 31, w: 6, h: 8 }],
  md: [{ i: 'chart', x: 0, y: 0, w: 7, h: 16 }, { i: 'book', x: 7, y: 0, w: 3, h: 16 }, { i: 'tape', x: 7, y: 16, w: 3, h: 12 }, { i: 'watch', x: 0, y: 16, w: 3, h: 12 }, { i: 'paper', x: 3, y: 16, w: 4, h: 12 }, { i: 'trend', x: 0, y: 28, w: 7, h: 13 }, { i: 'alerts', x: 7, y: 28, w: 3, h: 13 }],
  sm: [{ i: 'chart', x: 0, y: 0, w: 6, h: 14 }, { i: 'paper', x: 0, y: 14, w: 6, h: 12 }, { i: 'book', x: 0, y: 26, w: 3, h: 14 }, { i: 'tape', x: 3, y: 26, w: 3, h: 14 }, { i: 'watch', x: 0, y: 40, w: 6, h: 11 }, { i: 'trend', x: 0, y: 51, w: 6, h: 14 }, { i: 'alerts', x: 0, y: 65, w: 6, h: 8 }],
  xs: [{ i: 'chart', x: 0, y: 0, w: 1, h: 13 }, { i: 'paper', x: 0, y: 13, w: 1, h: 13 }, { i: 'watch', x: 0, y: 26, w: 1, h: 11 }, { i: 'trend', x: 0, y: 37, w: 1, h: 15 }, { i: 'book', x: 0, y: 52, w: 1, h: 14 }, { i: 'tape', x: 0, y: 66, w: 1, h: 12 }, { i: 'alerts', x: 0, y: 78, w: 1, h: 8 }],
}
const TITLES: Record<string, string> = { chart: 'Chart', book: 'Order book', tape: 'Trades', watch: 'Watchlist', trend: 'Solana trending memes', paper: 'Paper trading', alerts: 'Price alerts' }
const KEYS: [string, string][] = [['/', 'Symbol search'], ['1–6', 'Timeframe'], ['B / S', 'Paper buy / sell'], ['E / V / R', 'Toggle EMA / VWAP / RSI'], ['↑ / ↓', 'Prev / next in watchlist'], ['Shift+L', 'Reset layout'], ['?', 'This help']]

function Logo() { return <img src={`${import.meta.env.BASE_URL}logo.svg`} width={28} height={28} alt="" /> }

export default function App() {
  const [symbol, setSymbolRaw] = useLocal('symbol', new URLSearchParams(location.search).get('s')?.toUpperCase() || 'SOLUSDT')
  const [interval, setInterval_] = useLocal<Interval>('interval', '15m')
  const [ind, setInd] = useLocal<Ind>('ind', { ema: true, rsi: true, vwap: false, vol: true })
  const [list, setList] = useLocal('watch', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'SUIUSDT', 'TRUMPUSDT'])
  const [layouts, setLayouts] = useLocal<Layouts>('layout-v1', DEFAULT)
  const [paper, setPaper] = useLocal<PaperT>('paper', freshPaper())
  const [alerts, setAlerts] = useLocal<Alert[]>('alerts', [])
  const [status, setStatus] = useState(stream.status)
  const [help, setHelp] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; m: string; k?: string }[]>([])
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const ticket = useRef<{ buy: () => void; sell: () => void } | null>(null)
  const prices = usePrices()
  const [stats, setStats] = useState<{ o: number; h: number; l: number; v: number } | null>(null)

  const toast = useCallback((m: string, k?: string) => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, m, k }].slice(-4)); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200) }, [])
  const setSymbol = useCallback((s: string) => { setSymbolRaw(s); const u = new URL(location.href); u.searchParams.set('s', s); history.replaceState(null, '', u) }, [setSymbolRaw])
  useEffect(() => { stream.onStatus = setStatus; return () => { stream.onStatus = undefined } }, [])
  useEffect(() => stream.sub(`${symbol.toLowerCase()}@miniTicker`, (m) => { const d = m as Record<string, string>; setStats({ o: +d.o, h: +d.h, l: +d.l, v: +d.q || +d.v * +d.c }); setPrice(symbol, +d.c, ((+d.c - +d.o) / +d.o) * 100) }), [symbol])
  const last = prices.get(symbol)
  useEffect(() => { document.title = `${fmt(last?.p)} ${symbol.replace('USDT', '')} · Sendit Terminal` }, [last?.p, symbol])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) { if (e.key === 'Escape') t.blur(); return }
      const key = e.key
      if (key === '/') { e.preventDefault(); search.current?.focus() }
      else if (/^[1-6]$/.test(key)) setInterval_(INTERVALS[+key - 1])
      else if (key === 'b' || key === 'B') ticket.current?.buy()
      else if (key === 's' || key === 'S') ticket.current?.sell()
      else if (key === 'e') setInd({ ...ind, ema: !ind.ema })
      else if (key === 'v') setInd({ ...ind, vwap: !ind.vwap })
      else if (key === 'r') setInd({ ...ind, rsi: !ind.rsi })
      else if (key === 'L') { setLayouts(DEFAULT); toast('Layout reset') }
      else if (key === '?') setHelp((h) => !h)
      else if (key === 'Escape') setHelp(false)
      else if (key === 'ArrowDown' || key === 'ArrowUp') { e.preventDefault(); const i = list.indexOf(symbol); setSymbol(list[(i + (key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]) }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [ind, list, symbol, setInd, setInterval_, setLayouts, setSymbol, toast])

  const pick = (v: string) => { const s = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!s) return; setSymbol(s.endsWith('USDT') ? s : s + 'USDT'); setQ(''); search.current?.blur() }
  const chg = last?.chg ?? (stats ? ((last?.p ?? stats.o) - stats.o) / stats.o * 100 : undefined)
  const panel = (id: string, body: React.ReactNode, extra?: React.ReactNode) => (
    <section key={id} className="panel" aria-label={TITLES[id]}><header className="phead"><span className="grip" aria-hidden>⋮⋮</span><h2>{TITLES[id]}</h2>{extra}</header><div className="pbody">{body}</div></section>)
  return (
    <div className="app">
      <header className="top">
        <div className="brand"><Logo /><span>SENDIT<em>terminal</em></span></div>
        <form className="sym" onSubmit={(e) => { e.preventDefault(); pick(q) }}>
          <input ref={search} list="syms" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${symbol.replace('USDT', '')}/USDT  ·  press / to search`} aria-label="Symbol" spellCheck={false} />
          <datalist id="syms">{SYMBOLS.map((s) => <option key={s} value={s.replace('USDT', '')} />)}</datalist>
        </form>
        <div className="quote mono">
          <b className={(chg ?? 0) >= 0 ? 'up' : 'down'}>{fmt(last?.p)}</b>
          <span className={(chg ?? 0) >= 0 ? 'up' : 'down'}>{chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '—'}</span>
          {stats && <><span><small>24h H</small>{fmt(stats.h)}</span><span><small>24h L</small>{fmt(stats.l)}</span><span><small>Vol</small>${Intl.NumberFormat('en', { notation: 'compact' }).format(stats.v)}</span></>}
        </div>
        <div className="right">
          <span className={`status ${status}`} title={status === 'sim' ? 'Binance unreachable: simulated feed' : 'Binance websocket'}><i />{status === 'live' ? 'LIVE' : status === 'sim' ? 'SIM' : 'CONNECTING'}</span>
          <button className="ghost" onClick={() => { setLayouts(DEFAULT); toast('Layout reset') }} title="Reset layout (Shift+L)">⊞</button>
          <button className="ghost" onClick={() => setHelp(true)} title="Hotkeys (?)">?</button>
        </div>
      </header>
      <Grid className="grid" layouts={layouts} breakpoints={{ lg: 1280, md: 996, sm: 700, xs: 0 }} cols={{ lg: 24, md: 10, sm: 6, xs: 1 }} rowHeight={28} margin={[8, 8]} containerPadding={[8, 8]}
        draggableHandle=".phead" onLayoutChange={(_, all) => setLayouts(all)} isDraggable={innerWidth > 700} isResizable={innerWidth > 700}>
        {panel('chart', <Chart symbol={symbol} interval={interval} setInterval={setInterval_} ind={ind} setInd={setInd} trades={paper.trades} />, <span className="phint mono">{symbol}</span>)}
        {panel('book', <OrderBook symbol={symbol} />)}
        {panel('tape', <Tape symbol={symbol} />)}
        {panel('watch', <Watchlist list={list} setList={setList} symbol={symbol} setSymbol={setSymbol} />)}
        {panel('trend', <Trending />)}
        {panel('paper', <Paper symbol={symbol} paper={paper} setPaper={setPaper} toast={toast} ticketRef={ticket} />)}
        {panel('alerts', <Alerts symbol={symbol} alerts={alerts} setAlerts={setAlerts} toast={toast} />)}
      </Grid>
      <footer className="foot">Market data: Binance public API & websockets · Memes: DexScreener · Charts: <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> · Paper trading only, not financial advice.</footer>
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.k ?? ''}`}>{t.m}</div>)}</div>
      {help && <div className="modal" onClick={() => setHelp(false)} role="dialog" aria-modal aria-label="Hotkeys"><div className="mbox" onClick={(e) => e.stopPropagation()}><h3>Hotkeys</h3>{KEYS.map(([k, d]) => <div key={k} className="krow"><kbd>{k}</kbd><span>{d}</span></div>)}<p className="dim small">Drag panels by their header, resize from the corner. The layout is saved locally.</p></div></div>}
    </div>
  )
}
