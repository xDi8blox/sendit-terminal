// DexScreener (keyless): latest + boosted Solana token profiles enriched with pair stats and simple risk flags.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
export interface MemePair { address: string; pair: string; symbol: string; name: string; icon?: string; url: string; price: number; liq: number; vol24: number; vol1h: number; chg5m: number; chg1h: number; chg24: number; fdv: number; ageMin: number; buys1h: number; sells1h: number; boosted: boolean; socials: number; flags: { label: string; level: 'warn' | 'bad' | 'ok' }[] }
const get = async <T,>(u: string): Promise<T> => { const r = await fetch(u); if (!r.ok) throw new Error(`DexScreener ${r.status}`); return r.json() }

export async function trending(): Promise<MemePair[]> {
  const [latest, boosts] = await Promise.all([get<Any[]>('https://api.dexscreener.com/token-profiles/latest/v1').catch(() => []), get<Any[]>('https://api.dexscreener.com/token-boosts/top/v1').catch(() => [])])
  const boosted = new Set(boosts.filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))
  const addrs = [...new Set([...boosts, ...latest].filter((x) => x.chainId === 'solana').map((x) => x.tokenAddress as string))].slice(0, 60)
  if (!addrs.length) throw new Error('No Solana tokens returned')
  const pairs: Any[] = (await Promise.all([addrs.slice(0, 30), addrs.slice(30)].filter((a) => a.length).map((a) => get<Any[]>(`https://api.dexscreener.com/tokens/v1/solana/${a.join(',')}`).catch(() => [])))).flat()
  const best = new Map<string, Any>()
  for (const p of pairs) { const k = p.baseToken.address; if (!best.has(k) || (p.liquidity?.usd ?? 0) > (best.get(k).liquidity?.usd ?? 0)) best.set(k, p) }
  return [...best.values()].map((p): MemePair => {
    const liq = p.liquidity?.usd ?? 0, fdv = p.fdv ?? p.marketCap ?? 0, ageMin = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 6e4 : 1e9
    const b = p.txns?.h1?.buys ?? 0, s = p.txns?.h1?.sells ?? 0, socials = (p.info?.socials?.length ?? 0) + (p.info?.websites?.length ?? 0)
    const flags: MemePair['flags'] = []
    if (liq < 10000) flags.push({ label: 'Low liq', level: 'bad' }); else if (liq < 50000) flags.push({ label: 'Thin liq', level: 'warn' })
    if (ageMin < 60) flags.push({ label: 'Fresh <1h', level: 'warn' })
    if (fdv && liq && fdv / liq > 40) flags.push({ label: 'FDV/liq ' + Math.round(fdv / liq) + 'x', level: 'warn' })
    if ((p.priceChange?.h1 ?? 0) > 200) flags.push({ label: 'Parabolic', level: 'warn' })
    if (b + s > 20 && s > b * 2) flags.push({ label: 'Heavy sells', level: 'bad' })
    if (!socials) flags.push({ label: 'No socials', level: 'warn' })
    if (!flags.length) flags.push({ label: 'Clean-ish', level: 'ok' })
    return { address: p.baseToken.address, pair: p.pairAddress, symbol: p.baseToken.symbol, name: p.baseToken.name, icon: p.info?.imageUrl, url: p.url, price: Number(p.priceUsd ?? 0), liq, vol24: p.volume?.h24 ?? 0, vol1h: p.volume?.h1 ?? 0, chg5m: p.priceChange?.m5 ?? 0, chg1h: p.priceChange?.h1 ?? 0, chg24: p.priceChange?.h24 ?? 0, fdv, ageMin, buys1h: b, sells1h: s, boosted: boosted.has(p.baseToken.address), socials, flags }
  })
}
