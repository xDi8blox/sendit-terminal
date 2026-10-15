import { useEffect, useState } from 'react'
import { trending } from '../lib/dex'
import type { MemePair } from '../lib/dex'
import { compact } from '../lib/store'

const age = (m: number) => (m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 1e8 ? `${Math.round(m / 1440)}d` : '—')
const px = (p: number) => (p >= 1 ? p.toFixed(3) : p >= 0.0001 ? p.toPrecision(3) : p.toExponential(2))
const pc = (v: number) => <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : ''}{Math.abs(v) >= 1000 ? compact(v) : v.toFixed(1)}%</span>
export function Trending() {
  const [rows, setRows] = useState<MemePair[] | null>(null)
  const [err, setErr] = useState('')
  const [sort, setSort] = useState<'vol1h' | 'liq' | 'chg1h' | 'ageMin'>('vol1h')
  const [copied, setCopied] = useState('')
  useEffect(() => {
    let live = true
    const go = () => trending().then((r) => { if (live) { setRows(r); setErr('') } }).catch((e) => live && setErr(e.message))
    go(); const t = setInterval(go, 30000); return () => { live = false; clearInterval(t) }
  }, [])
  const list = [...(rows ?? [])].sort((a, b) => (sort === 'ageMin' ? a.ageMin - b.ageMin : b[sort] - a[sort]))
  return (
    <div className="trend">
      <div className="trend-tools">
        <div className="seg">{([['vol1h', 'Hot'], ['chg1h', 'Gainers'], ['ageMin', 'New'], ['liq', 'Liquidity']] as const).map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>
        <span className="dim small">DexScreener · Solana · 30s</span>
      </div>
      {err && <p className="dim small pad">⚠ {err}. Retrying…</p>}
      {!rows && !err && <div className="sk-rows">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>}
      <div className="trows">
        {list.map((r) => (
          <div key={r.address} className="tr2">
            <a href={r.url} target="_blank" rel="noreferrer" className="tok2">
              {r.icon ? <img src={`https://wsrv.nl/?url=${encodeURIComponent(r.icon)}&w=48&h=48&output=webp`} alt="" loading="lazy" /> : <span className="ph">{r.symbol.slice(0, 2)}</span>}
              <span><b>{r.symbol}{r.boosted && <em title="Boosted on DexScreener">⚡</em>}</b><small>{r.name}</small></span>
            </a>
            <span className="mono">${px(r.price)}</span>
            <span className="mono">{pc(r.chg5m)}<br />{pc(r.chg1h)}</span>
            <span className="mono">${compact(r.vol1h)}<small className="dim"> /1h</small><br /><span className="dim">liq ${compact(r.liq)}</span></span>
            <span className="mono">{age(r.ageMin)}<br /><span className="dim">{r.buys1h}/{r.sells1h}</span></span>
            <span className="flags">{r.flags.slice(0, 3).map((f) => <i key={f.label} className={f.level}>{f.label}</i>)}</span>
            <span className="links">
              <button className="mini" title="Copy CA" onClick={() => { navigator.clipboard?.writeText(r.address).catch(() => {}); setCopied(r.address); setTimeout(() => setCopied(''), 1000) }}>{copied === r.address ? '✓' : 'CA'}</button>
              <a className="mini" href={`https://gmgn.ai/sol/token/${r.address}`} target="_blank" rel="noreferrer">gmgn</a>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
