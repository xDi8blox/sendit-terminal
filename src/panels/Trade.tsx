import { useEffect, useRef, useState } from 'react'
import { START, execute, freshPaper } from '../lib/paper'
import type { Paper as P } from '../lib/paper'
import { fmt, getPrice, usd, usePrices } from '../lib/store'

export function Paper({ symbol, paper, setPaper, toast, ticketRef }: { symbol: string; paper: P; setPaper: (p: P) => void; toast: (m: string, kind?: string) => void; ticketRef: React.MutableRefObject<{ buy: () => void; sell: () => void } | null> }) {
  const prices = usePrices()
  const [amt, setAmt] = useState('500')
  const [tab, setTab] = useState<'pos' | 'hist'>('pos')
  const last = prices.get(symbol)?.p
  const base = symbol.replace('USDT', '')
  const pos = paper.positions[symbol]
  const go = (side: 'buy' | 'sell') => {
    const p = getPrice(symbol)?.p; if (!p) return toast('No price yet', 'bad')
    let qty = Number(amt) / p
    if (side === 'sell' && pos && qty > pos.qty) qty = pos.qty
    const r = execute(paper, symbol, side, qty, p)
    if (typeof r === 'string') return toast(r, 'bad')
    setPaper(r); toast(`${side === 'buy' ? 'Bought' : 'Sold'} ${qty.toPrecision(5)} ${base} @ ${fmt(p)}`, side === 'buy' ? 'up' : 'down')
  }
  ticketRef.current = { buy: () => go('buy'), sell: () => go('sell') }
  const unreal = Object.entries(paper.positions).reduce((s, [k, v]) => s + ((prices.get(k)?.p ?? v.avg) - v.avg) * v.qty, 0)
  const equity = paper.cash + Object.entries(paper.positions).reduce((s, [k, v]) => s + (prices.get(k)?.p ?? v.avg) * v.qty, 0)
  return (
    <div className="paper">
      <div className="eq">
        <div><small>Equity</small><b className="mono">{usd(equity)}</b></div>
        <div><small>Total PnL</small><b className={`mono ${equity >= START ? 'up' : 'down'}`}>{usd(equity - START)} <small>({(((equity - START) / START) * 100).toFixed(2)}%)</small></b></div>
        <div><small>Unrealized</small><b className={`mono ${unreal >= 0 ? 'up' : 'down'}`}>{usd(unreal)}</b></div>
        <div><small>Cash</small><b className="mono">{usd(paper.cash)}</b></div>
      </div>
      <div className="ticket">
        <label className="amt"><span>Size (USDT)</span><input className="mono" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" /></label>
        <div className="quick">{[100, 500, 1000, 2500].map((v) => <button key={v} onClick={() => setAmt(String(v))}>{v}</button>)}<button onClick={() => setAmt(String(Math.floor(paper.cash * 0.99)))}>MAX</button></div>
        <div className="bs"><button className="buy" onClick={() => go('buy')}>Buy {base} <kbd>B</kbd></button><button className="sell" onClick={() => go('sell')} disabled={!pos}>Sell <kbd>S</kbd></button></div>
        <small className="dim mono">Market @ {fmt(last)} · fee 0.1% · {pos ? `holding ${pos.qty.toPrecision(5)} @ ${fmt(pos.avg)}` : 'no position'}</small>
      </div>
      <div className="seg sm"><button className={tab === 'pos' ? 'on' : ''} onClick={() => setTab('pos')}>Positions ({Object.keys(paper.positions).length})</button><button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>History ({paper.trades.length})</button>
        <button className="reset" onClick={() => { if (confirm('Reset paper account to $10,000?')) setPaper(freshPaper()) }}>Reset</button></div>
      <div className="plist mono">
        {tab === 'pos' ? Object.entries(paper.positions).map(([k, v]) => { const p = prices.get(k)?.p ?? v.avg, pl = (p - v.avg) * v.qty; return (
          <div key={k} className="prow"><b>{k.replace('USDT', '')}</b><span>{v.qty.toPrecision(5)} @ {fmt(v.avg)}</span><span className={pl >= 0 ? 'up' : 'down'}>{usd(pl)} ({(((p - v.avg) / v.avg) * 100).toFixed(2)}%)</span></div>) })
          : paper.trades.map((t) => <div key={t.id} className="prow"><b className={t.side === 'buy' ? 'up' : 'down'}>{t.side.toUpperCase()} {t.symbol.replace('USDT', '')}</b><span>{t.qty.toPrecision(5)} @ {fmt(t.price)}</span><span className={(t.pnl ?? 0) >= 0 ? 'up' : 'down'}>{t.pnl != null ? usd(t.pnl) : new Date(t.time).toLocaleTimeString()}</span></div>)}
        {tab === 'pos' && !Object.keys(paper.positions).length && <p className="dim small pad">No open positions. Press B to ape in (with fake money).</p>}
      </div>
    </div>
  )
}

export interface Alert { id: string; symbol: string; dir: 'above' | 'below'; price: number; fired?: number }
export function Alerts({ symbol, alerts, setAlerts, toast }: { symbol: string; alerts: Alert[]; setAlerts: (a: Alert[] | ((a: Alert[]) => Alert[])) => void; toast: (m: string, k?: string) => void }) {
  const prices = usePrices()
  const [price, setP] = useState('')
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  const audio = useRef<AudioContext | null>(null)
  useEffect(() => {
    const hit = alerts.filter((a) => !a.fired && prices.get(a.symbol) && (a.dir === 'above' ? prices.get(a.symbol)!.p >= a.price : prices.get(a.symbol)!.p <= a.price))
    if (!hit.length) return
    setAlerts((all) => all.map((a) => (hit.some((h) => h.id === a.id) ? { ...a, fired: Date.now() } : a)))
    for (const a of hit) {
      const msg = `${a.symbol.replace('USDT', '')} ${a.dir === 'above' ? '≥' : '≤'} ${fmt(a.price)} (now ${fmt(prices.get(a.symbol)?.p)})`
      toast('🔔 ' + msg, a.dir === 'above' ? 'up' : 'down')
      if (perm === 'granted') new Notification('Sendit alert', { body: msg })
      try { const c = (audio.current ??= new AudioContext()), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.4) } catch { /* no audio */ }
    }
  })
  const cur = prices.get(symbol)?.p
  return (
    <div className="alerts">
      <form className="aform" onSubmit={(e) => { e.preventDefault(); const p = Number(price); if (!(p > 0) || !cur) return; setAlerts([{ id: crypto.randomUUID(), symbol, dir: p >= cur ? 'above' : 'below', price: p }, ...alerts]); setP('') }}>
        <input className="mono" value={price} onChange={(e) => setP(e.target.value)} placeholder={`${symbol.replace('USDT', '')} price… now ${fmt(cur)}`} inputMode="decimal" aria-label="Alert price" />
        <button>Add</button>
      </form>
      {perm !== 'granted' && typeof Notification !== 'undefined' && <button className="link small" onClick={() => Notification.requestPermission().then(setPerm)}>Enable browser notifications</button>}
      <div className="alist mono">
        {alerts.map((a) => <div key={a.id} className={`arow ${a.fired ? 'fired' : ''}`}><b>{a.symbol.replace('USDT', '')}</b><span>{a.dir === 'above' ? '▲ ≥' : '▼ ≤'} {fmt(a.price)}</span><span className="dim">{a.fired ? 'fired ' + new Date(a.fired).toLocaleTimeString() : 'armed'}</span><button className="x" onClick={() => setAlerts(alerts.filter((x) => x.id !== a.id))} aria-label="Delete alert">×</button></div>)}
        {!alerts.length && <p className="dim small pad">No alerts. Set a price and you'll get a ping when it crosses.</p>}
      </div>
    </div>
  )
}
