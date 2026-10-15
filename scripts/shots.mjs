import { chromium } from 'playwright'
const base = process.env.URL || 'http://localhost:4340/'
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined })
const errors = []
for (const [name, opts] of [['desktop', { viewport: { width: 1600, height: 1000 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  await p.goto(base + '?s=SOLUSDT')
  await p.waitForTimeout(+(process.env.WAIT || 22000))
  // paper trade a couple of times so the simulator panel has content
  await p.keyboard.press('b'); await p.waitForTimeout(800); await p.keyboard.press('b'); await p.waitForTimeout(1500)
  await p.screenshot({ path: `screenshots/${name}.png`, fullPage: name === 'mobile' })
  if (name === 'desktop') {
    await p.keyboard.press('?'); await p.waitForTimeout(400); await p.screenshot({ path: 'screenshots/desktop-hotkeys.png' }); await p.keyboard.press('Escape')
    await p.locator('.panel[aria-label="Solana trending memes"]').screenshot({ path: 'screenshots/memes.png' })
    await p.locator('.panel[aria-label="Chart"]').screenshot({ path: 'screenshots/chart.png' })
  }
  await ctx.close()
}
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
