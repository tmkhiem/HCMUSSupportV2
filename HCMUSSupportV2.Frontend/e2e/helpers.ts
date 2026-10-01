import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d02/', import.meta.url))

export const shotPath = (name: string) => `${SHOT_DIR}${name}.png`

/** Wait for web fonts, then screenshot (finite animations fast-forwarded) into docs/screenshots/d02. */
export async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: shotPath(name), animations: 'disabled' })
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

export const DESKTOP = { width: 1440, height: 900 }
export const MOBILE = { width: 375, height: 812 }

/** Synthetic `/api/auth/me` payloads for the non-mock server. */
export const ME = {
  admin: {
    code: 'T0001',
    fullName: 'Nguyễn Thử Nghiệm',
    unit: 'Khoa Công nghệ thông tin',
    photoUrl: null,
    emails: ['t0001@example.test'],
    roles: ['editor', 'admin'],
    actingAs: null,
  },
  employee: {
    code: 'T0003',
    fullName: 'Lê Nhân Viên',
    unit: 'Khoa Vật lý',
    photoUrl: null,
    emails: ['t0003@example.test'],
    roles: [],
    actingAs: null,
  },
}
