// Render WestPlay CN Vision's own screenshots for its README.
//
// The cabin page runs without the host in the browser (`installDemo` on `?demo`, or the plain
// page), so each screen can be photographed here instead of in the game. The look (dark or light)
// is the `.shell`'s own class, which is set here before each picture.
//
// With the preview server up:
//     cd ui && npx vite preview --port 4173
//     node shot.mjs [out-dir]

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:4173'
const SIZE = { width: 1280, height: 720 }
const OUT = process.argv[2] ?? 'docs/images-cn'
const LOOKS = ['dark', 'light']

/** The app tiles on Home, by the id `Home.tsx` puts on them. */
const APP_TILE = (id) => `.app[data-app="${id}"]`

/** Puts the screen in `look` (the `.shell`'s own class). */
async function setLook(page, look) {
  await page.evaluate((appearance) => {
    const shell = document.querySelector('.shell')
    if (!shell) return
    shell.classList.remove('appearance-dark', 'appearance-light')
    shell.classList.add(`appearance-${appearance}`)
  }, look)
  await page.waitForTimeout(600)
}

async function openCabin(page) {
  await page.goto(`${BASE}/cabin.html`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
}

async function toHome(page) {
  await openCabin(page)
  await page.click('[aria-label="Home"]').catch(() => {})
  await page.waitForTimeout(1500)
}

async function firstPage(page) {
  await toHome(page)
  const dots = page.locator('.home-dot')
  if ((await dots.count()) > 0) {
    await dots.first().click().catch(() => {})
    await page.waitForTimeout(1200)
  }
}

async function secondPage(page) {
  await toHome(page)
  const dots = page.locator('.home-dot')
  if ((await dots.count()) > 1) {
    await dots.nth(1).click().catch(() => {})
    await page.waitForTimeout(1400)
  }
}

const SHOTS = [
  {
    // Home, first page: the apps WestPlay CN Vision draws with the player's own icon set.
    name: 'home',
    go: async (page, look) => {
      await firstPage(page)
      await setLook(page, look)
    },
  },
  {
    // Home, second page: Calendar with the day, Vehicle, Weather, Douyin, Kugou, Settings.
    name: 'home-apps',
    go: async (page, look) => {
      await secondPage(page)
      await setLook(page, look)
    },
  },
  {
    // The dashboard: the map beside what plays.
    name: 'dashboard',
    go: async (page, look) => {
      await openCabin(page)
      await setLook(page, look)
    },
  },
  {
    // Maps, at street level.
    name: 'maps',
    go: async (page, look) => {
      await firstPage(page)
      const tile = page.locator(APP_TILE('maps'))
      if ((await tile.count()) > 0) await tile.first().click().catch(() => {})
      await page.waitForTimeout(5000)
      await setLook(page, look)
    },
  },
  {
    // QQ Music's own shell: its tabs, in Chinese, over the local middle layer.
    name: 'qq-music',
    go: async (page, look) => {
      await firstPage(page)
      const tile = page.locator(APP_TILE('youtubeMusic'))
      if ((await tile.count()) > 0) await tile.first().click().catch(() => {})
      await page.waitForTimeout(3500)
      await setLook(page, look)
    },
  },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    locale: 'zh-CN',
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`    [pageerror] ${e.message.slice(0, 90)}`))

  for (const shot of SHOTS) {
    for (const look of LOOKS) {
      await shot.go(page, look)
      const file = join(OUT, `${shot.name}-${look}.png`)
      await page.screenshot({ path: file })
      console.log(`  OK ${file}`)
    }
  }
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
