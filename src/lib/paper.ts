export interface Trade { id: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number; fee: number; time: number; pnl?: number }
export interface Paper { cash: number; positions: Record<string, { qty: number; avg: number }>; trades: Trade[]; realized: number }
export const START = 10000, FEE = 0.001
export const freshPaper = (): Paper => ({ cash: START, positions: {}, trades: [], realized: 0 })
export function execute(s: Paper, symbol: string, side: 'buy' | 'sell', qty: number, price: number): Paper | string {
  if (!(qty > 0) || !(price > 0)) return 'Enter a size'
  const pos = s.positions[symbol] ?? { qty: 0, avg: 0 }, notional = qty * price, fee = notional * FEE
  if (side === 'buy') {
    if (notional + fee > s.cash + 1e-9) return 'Insufficient USDT'
    const nq = pos.qty + qty
    return { ...s, cash: s.cash - notional - fee, positions: { ...s.positions, [symbol]: { qty: nq, avg: (pos.qty * pos.avg + notional) / nq } }, trades: [{ id: crypto.randomUUID(), symbol, side, qty, price, fee, time: Date.now() }, ...s.trades].slice(0, 200) }
  }
  if (qty > pos.qty + 1e-12) return `Only ${pos.qty.toPrecision(6)} ${symbol.replace('USDT', '')} to sell`
  const pnl = (price - pos.avg) * qty - fee, left = pos.qty - qty
  const positions = { ...s.positions }; if (left < 1e-12) delete positions[symbol]; else positions[symbol] = { ...pos, qty: left }
  return { ...s, cash: s.cash + notional - fee, positions, realized: s.realized + pnl, trades: [{ id: crypto.randomUUID(), symbol, side, qty, price, fee, time: Date.now(), pnl }, ...s.trades].slice(0, 200) }
}
