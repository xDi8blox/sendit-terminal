import { useEffect, useMemo, useState } from 'react'
import { rest, stream } from '../lib/binance'
import { compact, fmt, setPrice, usePrices } from '../lib/store'

type Lvl = [number, number]
export function OrderBook({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<{ bids: Lvl[]; asks: Lvl[] }>({ bids: [], asks: [] })
  useEffect(() => {
    setBook({ bids: [], asks: [] })
    let last = 0
    return stream.sub(`${symbol.toLowerCase()}@depth20@100ms`, (m) => {
      const now = performance.now(); if (now - last < 150) return; last = now
      const d = m as { bids: (string | number)[][]; asks: (string | number)[][] }
      setBook({ bids: d.bids.slice(0, 14).map(([p, q]) => [+p, +q]), asks: d.asks.slice(0, 14).map(([p, q]) => [+p, +q]) })
    })
  }, [symbol])
  const cum = (l: Lvl[]) => { let c = 0; return l.map(([p, q]) => [p, q, (c += q)] as const) }
  const bids = cum(book.bids), asks = cum(book.asks), max = Math.max(bids.at(-1)?.[2] ?? 0, asks.at(-1)?.[2] ?? 0) || 1
  const spread = book.asks[0] && book.bids[0] ? book.asks[0][0] - book.bids[0][0] : 0
  const imb = (bids.at(-1)?.[2] ?? 0) / ((bids.at(-1)?.[2] ?? 0) + (asks.at(-1)?.[2] ?? 0) || 1)
  const row = (side: 'a' | 'b') => ([p, q, c]: readonly [number, number, number]) => (
    <div key={p} className={`lvl ${side}`}><i style={{ width: `${(c / max) * 100}%` }} /><span>{fmt(p)}</span><span>{q < 1 ? q.toFixed(4) : compact(q)}</span><span>{compact(c * p)}</span></div>)
  return (
    <div className="book mono">
      <div className="lvl head"><span>Price</span><span>Size</span><span>Total $</span></div>
      <div className="asks">{[...asks].reverse().map(row('a'))}</div>
      <div className="spread"><b>{fmt(book.bids[0]?.[0])}</b><span>spread {fmt(spread)} ({book.bids[0] ? ((spread / book.bids[0][0]) * 1e4).toFixed(1) : '—'} bps)</span><span className="imb"><i style={{ width: `${imb * 100}%` }} /></span></div>
      <div className="bids">{bids.map(row('b'))}</div>
    </div>
  )
}

export function Tape({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<{ p: number; q: number; t: number; sell: boolean; id: number }[]>([])
  useEffect(() => {
    setTrades([]); let n = 0, buf: typeof trades = [], raf = 0
    const off = stream.sub(`${symbol.toLowerCase()}@aggTrade`, (m) => {
      const d = m as { p: string; q: string; T: number; m: boolean }
      buf.push({ p: +d.p, q: +d.q, t: d.T, sell: d.m, id: n++ })
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = buf; buf = []; setTrades((x) => [...b.reverse(), ...x].slice(0, 60)) })
    })
    return () => { off(); cancelAnimationFrame(raf) }
  }, [symbol])
  const big = useMemo(() => { const v = trades.map((t) => t.p * t.q).sort((a, b) => a - b); return v[Math.floor(v.length * 0.9)] ?? Infinity }, [trades])
  return (
    <div className="tape mono">
      <div className="lvl head"><span>Price</span><span>Size $</span><span>Time</span></div>
      {trades.map((t) => <div key={t.id} className={`trow ${t.sell ? 'down' : 'up'} ${t.p * t.q >= big ? 'big' : ''}`}><span>{fmt(t.p)}</span><span>{compact(t.p * t.q)}</span><span className="dim">{new Date(t.t).toLocaleTimeString([], { hour12: false })}</span></div>)}
    </div>
  )
}

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <svg className="spark" />
  const min = Math.min(...data), max = Math.max(...data), s = max - min || 1
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * 80).toFixed(1)},${(22 - ((v - min) / s) * 20).toFixed(1)}`).join('')
  return <svg className="spark" viewBox="0 0 80 24" preserveAspectRatio="none"><path d={d} fill="none" stroke={data.at(-1)! >= data[0] ? '#2bf59b' : '#ff4d6a'} strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg>
}
export function Watchlist({ list, setList, symbol, setSymbol }: { list: string[]; setList: (l: string[]) => void; symbol: string; setSymbol: (s: string) => void }) {
  const prices = usePrices()
  const [sparks, setSparks] = useState<Record<string, number[]>>({})
  const [add, setAdd] = useState('')
  useEffect(() => {
    const offs = list.map((s) => stream.sub(`${s.toLowerCase()}@miniTicker`, (m) => { const d = m as { c: string; o: string }; setPrice(s, +d.c, ((+d.c - +d.o) / +d.o) * 100) }))
    list.filter((s) => !sparks[s]).forEach((s) => rest<(string | number)[][]>(`/api/v3/klines?symbol=${s}&interval=1h&limit=24`).then((k) => {
      setSparks((x) => ({ ...x, [s]: k.map((r) => +r[4]) })); const c = +k[k.length - 1][4], o = +k[0][1]; if (!prices.get(s)) setPrice(s, c, ((c - o) / o) * 100); stream.seed(s, c)
    }).catch(() => {}))
    return () => offs.forEach((f) => f())
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="watch">
      {list.map((s) => { const p = prices.get(s); return (
        <div key={s} className={`wrow ${s === symbol ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => setSymbol(s)} onKeyDown={(e) => e.key === 'Enter' && setSymbol(s)}>
          <b>{s.replace('USDT', '')}<small>/USDT</small></b><Spark data={sparks[s] ?? []} />
          <span className="mono">{fmt(p?.p)}</span><span className={`mono chg ${(p?.chg ?? 0) >= 0 ? 'up' : 'down'}`}>{p?.chg != null ? `${p.chg >= 0 ? '+' : ''}${p.chg.toFixed(2)}%` : '—'}</span>
          <button className="x" aria-label={`Remove ${s}`} onClick={(e) => { e.stopPropagation(); setList(list.filter((x) => x !== s)) }}>×</button>
        </div>) })}
      <form className="wadd" onSubmit={(e) => { e.preventDefault(); const s = add.toUpperCase().replace(/[^A-Z0-9]/g, ''); const sym = s.endsWith('USDT') ? s : s + 'USDT'; if (s && !list.includes(sym)) setList([...list, sym]); setAdd('') }}>
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="+ add ticker (e.g. ARB)" aria-label="Add ticker" />
      </form>
    </div>
  )
}
