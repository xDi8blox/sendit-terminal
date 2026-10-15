import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, createChart, createSeriesMarkers } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { INTERVALS, klines, stream } from '../lib/binance'
import type { Interval, Kline } from '../lib/binance'
import { ema, rsi, vwap } from '../lib/indicators'
import { setPrice } from '../lib/store'
import type { Trade } from '../lib/paper'

export interface Ind { ema: boolean; rsi: boolean; vwap: boolean; vol: boolean }
const T = (t: number) => t as UTCTimestamp
const C = { up: '#2bf59b', down: '#ff4d6a', grid: '#141a22', text: '#7b8698' }

export function Chart({ symbol, interval, setInterval, ind, setInd, trades }: { symbol: string; interval: Interval; setInterval: (i: Interval) => void; ind: Ind; setInd: (i: Ind) => void; trades: Trade[] }) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<{ chart: IChartApi; candle: ISeriesApi<'Candlestick'>; vol: ISeriesApi<'Histogram'>; e9: ISeriesApi<'Line'>; e21: ISeriesApi<'Line'>; vw: ISeriesApi<'Line'>; rsi?: ISeriesApi<'Line'>; markers: ReturnType<typeof createSeriesMarkers<Time>> } | null>(null)
  const data = useRef<Kline[]>([])
  const [hover, setHover] = useState<Kline | null>(null)
  const [sim, setSim] = useState(false)

  useEffect(() => {
    const chart = createChart(el.current!, {
      autoSize: true, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.text, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, panes: { separatorColor: '#1c2430' } },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } }, crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1c2430' }, timeScale: { borderColor: '#1c2430', timeVisible: true, secondsVisible: false },
    })
    const candle = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down })
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const line = (color: string) => chart.addSeries(LineSeries, { color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false })
    const e9 = line('#ffb547'), e21 = line('#9d7bff'), vw = line('#14c9ff')
    const markers = createSeriesMarkers(candle, [])
    chart.subscribeCrosshairMove((p) => { const d = p.time ? data.current.find((k) => k.time === p.time) : null; setHover(d ?? null) })
    api.current = { chart, candle, vol, e9, e21, vw, markers }
    return () => { chart.remove(); api.current = null }
  }, [])

  const paint = (full: boolean) => {
    const a = api.current, k = data.current; if (!a || !k.length) return
    const last = k[k.length - 1]
    const volOf = (x: Kline) => ({ time: T(x.time), value: x.volume, color: x.close >= x.open ? '#2bf59b44' : '#ff4d6a44' })
    if (full) {
      const prec = last.close >= 100 ? 2 : last.close >= 1 ? 4 : Math.min(10, Math.ceil(-Math.log10(last.close)) + 3)
      a.candle.applyOptions({ priceFormat: { type: 'price', precision: prec, minMove: 1 / 10 ** prec } })
      a.candle.setData(k.map((x) => ({ ...x, time: T(x.time) })))
      a.vol.setData(ind.vol ? k.map(volOf) : [])
    } else { a.candle.update({ ...last, time: T(last.time) }); if (ind.vol) a.vol.update(volOf(last)) }
    const set = (s: ISeriesApi<'Line'>, on: boolean, arr: () => { time: number; value: number }[]) => {
      if (!on) { if (full) s.setData([]); return }
      const v = arr(); if (full) s.setData(v.map((x) => ({ ...x, time: T(x.time) }))); else { const l = v[v.length - 1]; s.update({ ...l, time: T(l.time) }) }
    }
    set(a.e9, ind.ema, () => ema(k, 9)); set(a.e21, ind.ema, () => ema(k, 21)); set(a.vw, ind.vwap, () => vwap(k))
    if (ind.rsi) {
      if (!a.rsi) { a.rsi = a.chart.addSeries(LineSeries, { color: '#ff5cc8', lineWidth: 1, priceLineVisible: false }, 1); a.rsi.createPriceLine({ price: 70, color: '#ff4d6a55', lineStyle: 2, axisLabelVisible: false, lineWidth: 1, title: '' }); a.rsi.createPriceLine({ price: 30, color: '#2bf59b55', lineStyle: 2, axisLabelVisible: false, lineWidth: 1, title: '' }); a.chart.panes()[1]?.setHeight(110); full = true }
      const r = rsi(k); if (full) a.rsi.setData(r.map((x) => ({ ...x, time: T(x.time) }))); else if (r.length) { const l = r[r.length - 1]; a.rsi.update({ ...l, time: T(l.time) }) }
    } else if (a.rsi) { a.chart.removeSeries(a.rsi); a.rsi = undefined }
  }

  useEffect(() => {
    let live = true
    data.current = []
    klines(symbol, interval).then(({ data: k, sim }) => {
      if (!live) return
      data.current = k; setSim(sim); paint(true); api.current?.chart.timeScale().fitContent()
      api.current?.chart.timeScale().setVisibleLogicalRange({ from: k.length - 140, to: k.length + 5 })
      if (k.length) { setPrice(symbol, k[k.length - 1].close); stream.seed(symbol, k[k.length - 1].close) }
    })
    const off = stream.sub(`${symbol.toLowerCase()}@kline_${interval}`, (m) => {
      const x = (m as { k: Record<string, string | number | boolean> }).k
      const bar: Kline = { time: Math.floor(+x.t / 1000), open: +x.o, high: +x.h, low: +x.l, close: +x.c, volume: +x.v }
      const k = data.current; if (!k.length) return
      const last = k[k.length - 1]
      if (bar.time === last.time) { if (stream.status === 'sim') { bar.open = last.open; bar.high = Math.max(last.high, bar.close); bar.low = Math.min(last.low, bar.close); bar.volume = last.volume + bar.volume } k[k.length - 1] = bar }
      else if (bar.time > last.time) { if (stream.status === 'sim') bar.open = last.close; k.push(bar); if (k.length > 1500) k.shift() } else return
      setPrice(symbol, bar.close); paint(false)
    })
    return () => { live = false; off() }
  }, [symbol, interval]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { paint(true) }, [ind]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = trades.filter((t) => t.symbol === symbol).slice(0, 50).map((t) => {
      const s = Math.floor(t.time / 1000); const bucket = data.current.length ? data.current.reduce((b, k) => (k.time <= s ? k.time : b), data.current[0].time) : s
      return { time: T(bucket) as Time, position: t.side === 'buy' ? 'belowBar' : 'aboveBar', color: t.side === 'buy' ? C.up : C.down, shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown', text: t.side === 'buy' ? 'B' : 'S' } as SeriesMarker<Time>
    }).sort((a, b) => (a.time as number) - (b.time as number))
    api.current?.markers.setMarkers(m)
  }, [trades, symbol])

  const h = hover ?? data.current[data.current.length - 1]
  return (
    <div className="chart-wrap">
      <div className="chart-tools">
        <div className="seg">{INTERVALS.map((i, n) => <button key={i} className={i === interval ? 'on' : ''} onClick={() => setInterval(i)} title={`Timeframe ${i} (${n + 1})`}>{i}</button>)}</div>
        <div className="seg">{(['ema', 'vwap', 'rsi', 'vol'] as const).map((k) => <button key={k} className={ind[k] ? 'on' : ''} onClick={() => setInd({ ...ind, [k]: !ind[k] })}>{k === 'ema' ? 'EMA 9/21' : k.toUpperCase()}</button>)}</div>
        {sim && <span className="badge warn">SIM DATA</span>}
        {h && <span className="ohlc mono">O <b>{h.open.toPrecision(6)}</b> H <b>{h.high.toPrecision(6)}</b> L <b>{h.low.toPrecision(6)}</b> C <b className={h.close >= h.open ? 'up' : 'down'}>{h.close.toPrecision(6)}</b></span>}
      </div>
      <div ref={el} className="chart" />
    </div>
  )
}
