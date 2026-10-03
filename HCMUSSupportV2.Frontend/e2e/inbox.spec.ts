import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D08 Tin tức inbox against the synthetic mock inbox (`inboxMock.ts`, VITE_MOCK_AUTH=1, port 5483).
 * The mock holds 26 posts (page size 20): #1 has attachments + series with 2 earlier posts, #4 two vars
 * rows, #5 updated after delivery. Newest delivery is always first; there is no read or pin state. `window.__inboxMock.publish(title)` delivers a new post (no live stream).
 * Screenshots go to docs/screenshots/d08/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d08/', import.meta.url))
const SALARY_2026 = 'Thông báo nâng lương thường xuyên năm 2026'
const SALARY_2025 = 'Thông báo nâng lương thường xuyên năm 2025'
const SALARY_ID = '0198a000-0000-7000-8000-000000000001'
const TRAINING = 'Mở lớp bồi dưỡng nghiệp vụ sư phạm đợt 3'

declare global {
  interface Window {
    /** Mock-mode hook from inboxMock.ts: delivers a new post to the synthetic inbox. */
    __inboxMock?: { publish: (title: string) => string }
  }
}

test.describe.configure({ timeout: 60_000 })

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(450) // fly-in and dialog transitions
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled' })
}

const rows = (page: Page) => page.getByTestId('inbox-row')
const row = (page: Page, title: string) => rows(page).filter({ hasText: title })
const dialog = (page: Page) => page.getByRole('dialog')
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' })

/** Open `/news` and wait for the first page of rows. */
async function openInbox(page: Page, path = '/news', waitForRows = true) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'Tin tức', includeHidden: true })).toBeAttached()
  if (waitForRows) await expect(rows(page).first()).toBeAttached()
}

async function scrollListToEnd(page: Page) {
  await page.locator('#main-content').evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
}

test.describe('desktop 1440', () => {
  test.use({ viewport: DESKTOP })

  test('the list renders newest first with attachment markers and no read or pin state', async ({ page }) => {
    await openInbox(page)
    await expect(page).toHaveTitle(/Tin tức/)
    await expect(rows(page)).toHaveCount(20)

    const first = row(page, SALARY_2026)
    await expect(first).toContainText('Lương')
    await expect(first).toContainText('+1')
    await expect(first).toContainText('28/09/2026')
    await expect(first.getByRole('img', { name: 'Có tệp đính kèm' })).toBeVisible()
    await expect(rows(page).first()).toContainText(SALARY_2026) // newest delivery first
    await expect(row(page, 'Khảo sát mức độ hài lòng')).toContainText('Đã cập nhật')

    await expect(page.getByTestId('unread-dot')).toHaveCount(0)
    await expect(page.locator('[data-unread]')).toHaveCount(0)
    await expect(page.getByText('Ghim')).toHaveCount(0)
    await expect(page.getByText('Chưa đọc')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Đánh dấu tất cả đã đọc/ })).toHaveCount(0)
    await expect(page.getByTestId('avatar-dot')).toHaveCount(0)
    await shot(page, 'inbox-1440')
  })

  test('infinite scroll loads the second page; the filter bar stays sticky', async ({ page }) => {
    await openInbox(page)
    await expect(rows(page)).toHaveCount(20)
    await scrollListToEnd(page)
    await expect(rows(page)).toHaveCount(26)
    await expect(page.getByRole('button', { name: 'Tải thêm' })).toHaveCount(0)

    const bar = page.getByRole('region', { name: 'Bộ lọc thông báo' })
    await expect(bar).toBeInViewport()
    expect((await bar.boundingBox())!.y).toBeLessThan(40)
  })

  test('"Tải thêm" is the fallback when the sentinel is not reached', async ({ page }) => {
    await page.addInitScript(() => {
      // No IntersectionObserver: only the button can load the next page.
      Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true })
    })
    await openInbox(page)
    await expect(rows(page)).toHaveCount(20)
    await page.getByRole('button', { name: 'Tải thêm' }).click()
    await expect(rows(page)).toHaveCount(26)
  })

  test('search is debounced, lands in the URL and survives a reload; Back restores the previous filter', async ({ page }) => {
    await openInbox(page)
    const search = page.getByRole('searchbox', { name: 'Tìm kiếm thông báo' })

    await search.pressSequentially('luong', { delay: 30 })
    await expect(page).toHaveURL(/[?&]q=luong$/)
    await expect(rows(page)).toHaveCount(5) // nâng lương 2026/2025/2024, nâng lương trước thời hạn, "chất lượng" (accent-insensitive)
    await expect(rows(page).filter({ hasText: 'Khảo sát mức độ' })).toHaveCount(0)

    await page.reload()
    await expect(search).toHaveValue('luong')
    await expect(rows(page)).toHaveCount(5)

    await page.getByRole('button', { name: 'Xóa nội dung tìm kiếm' }).click()
    await expect(page).toHaveURL(/\/news$/)
    await expect(rows(page)).toHaveCount(20)
  })

  test('tag chips filter (multi-select) and keep the choice in the URL', async ({ page }) => {
    await openInbox(page)
    const chip = (name: string) => page.getByRole('group', { name: 'Lọc theo nhãn' }).getByRole('button', { name })

    await chip('Khen thưởng').click()
    await expect(chip('Khen thưởng')).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/[?&]tags=3$/)
    await expect(rows(page)).toHaveCount(4) // #6, #13, #18, #22

    await chip('Khảo sát').click()
    await expect(page).toHaveURL(/[?&]tags=3%2C4$/)
    await expect(rows(page)).toHaveCount(8)

    await page.reload()
    await expect(chip('Khen thưởng')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip('Khảo sát')).toHaveAttribute('aria-pressed', 'true')
    await expect(rows(page)).toHaveCount(8)

    await chip('Khảo sát').click()
    await chip('Khen thưởng').click()
    await expect(page).toHaveURL(/\/news$/)
  })

  test('Từ ngày / Đến ngày narrow the list; typed dates reach the URL', async ({ page }) => {
    await openInbox(page)
    const from = page.getByRole('group', { name: 'Từ ngày' })
    const to = page.getByRole('group', { name: 'Đến ngày' })

    await from.getByRole('spinbutton', { name: 'Ngày' }).click()
    await page.keyboard.type('01092026', { delay: 30 })
    await expect(page).toHaveURL(/[?&]from=2026-09-01/)
    await expect(rows(page)).toHaveCount(5) // #1, #4, #5, #6, #7 are from September

    await to.getByRole('spinbutton', { name: 'Ngày' }).click()
    await page.keyboard.type('20092026', { delay: 30 })
    await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-20/)
    await expect(rows(page)).toHaveCount(3) // #5, #6, #7 (on 20/09 09:00 is inside the day)

    await page.reload()
    await expect(rows(page)).toHaveCount(3)
    await expect(from).toContainText('01/09/2026')
    await expect(to).toContainText('20/09/2026')
  })

  test('an empty result explains itself and "Xóa bộ lọc" resets', async ({ page }) => {
    await openInbox(page, '/news?q=zzzz', false)
    await expect(page.getByText('Không tìm thấy thông báo nào phù hợp.')).toBeVisible()
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
    await expect(page).toHaveURL(/\/news$/)
    await expect(rows(page)).toHaveCount(20)
    await expect(page.getByRole('searchbox', { name: 'Tìm kiếm thông báo' })).toHaveValue('')
  })

  test('opening a row shows the detail over the list: body with values, attachments, earlier posts', async ({ page }) => {
    await openInbox(page)
    await row(page, SALARY_2026).click()
    await expect(page).toHaveURL(`/news/${SALARY_ID}`)

    const dlg = dialog(page)
    await expect(dlg.getByRole('heading', { level: 2, name: SALARY_2026 })).toBeVisible()
    const meta = dlg.getByTestId('detail-meta')
    await expect(meta).toContainText('28/09/2026')
    await expect(meta).toContainText('Lương')
    await expect(meta).toContainText('Nâng lương thường xuyên') // series

    const body = dlg.getByTestId('notification-body')
    await expect(body).toContainText('Nguyễn Thử Nghiệm')
    await expect(body).toContainText('4,98')
    await expect(body).toContainText('01/10/2026')
    await expect(body).not.toContainText(':var[')

    const files = dlg.getByTestId('attachment-list').getByRole('link')
    await expect(files).toHaveCount(2)
    await expect(files.first()).toHaveAttribute('href', `/api/notifications/${SALARY_ID}/attachments/0198a000-0000-7000-8000-000000009001`)
    await expect(files.first()).toContainText('Quyet-dinh-nang-luong-2026.pdf')
    await expect(files.first()).toContainText('471,0 KB')

    const previous = dlg.getByTestId('series-previous').getByRole('link')
    await expect(previous).toHaveCount(2)
    await expect(previous.nth(0)).toContainText(SALARY_2025)

    await expect(page.getByRole('heading', { level: 1, name: 'Tin tức', includeHidden: true })).toBeAttached() // list still mounted underneath
    await shot(page, 'detail-1440')
  })

  test('several vars rows render one block per row', async ({ page }) => {
    await openInbox(page)
    await row(page, 'Xét phụ cấp thâm niên').click()
    const body = dialog(page).getByTestId('notification-body')
    await expect(body.getByTestId('notification-body-block')).toHaveCount(2)
    await expect(body).toContainText('10%')
    await expect(body).toContainText('15%')
    await shot(page, 'detail-rows-1440')
  })

  test('"Các kỳ trước" links to the earlier post; Escape closes and keeps the list filters', async ({ page }) => {
    await openInbox(page, '/news?tags=1')
    await row(page, SALARY_2026).click()
    await expect(page).toHaveURL(new RegExp(`/news/${SALARY_ID}\\?tags=1$`))

    await dialog(page).getByTestId('series-previous').getByRole('link', { name: new RegExp(SALARY_2025) }).click()
    await expect(page).toHaveURL(/\/news\/0198a000-0000-7000-8000-000000000002\?tags=1$/)
    await expect(dialog(page).getByRole('heading', { level: 2, name: SALARY_2025 })).toBeVisible()
    await expect(dialog(page).getByTestId('series-previous').getByRole('link')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/news\?tags=1$/)
    await expect(rows(page).first()).toBeVisible()
  })

  test('a detail deep link opens the dialog over the list; closing goes to the list', async ({ page }) => {
    await openInbox(page, `/news/${SALARY_ID}`)
    await expect(dialog(page).getByRole('heading', { level: 2, name: SALARY_2026 })).toBeVisible()
    await expect(rows(page).first()).toBeVisible()

    await dialog(page).getByRole('button', { name: 'Đóng' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/news$/)
  })

  test('browser Back from an opened detail returns to the list', async ({ page }) => {
    await openInbox(page)
    await row(page, TRAINING).click()
    await expect(dialog(page)).toBeVisible()
    await page.goBack()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/news$/)
  })

  test('an unknown post id says so instead of a blank dialog', async ({ page }) => {
    await openInbox(page, '/news/0198a000-0000-7000-8000-00000000ffff')
    await expect(dialog(page)).toContainText('Thông báo này không tồn tại hoặc bạn không có quyền xem.')
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Không tìm thấy thông báo' })).toBeVisible()
  })

  test('there is no live stream: a new delivery shows when the inbox is entered again, at the top', async ({ page }) => {
    const streams: string[] = []
    page.on('request', (r) => r.url().includes('/api/notifications/stream') && streams.push(r.url()))
    await openInbox(page)
    await page.waitForFunction(() => Boolean(window.__inboxMock))

    await page.evaluate(() => window.__inboxMock!.publish('Họp khẩn đột xuất'))
    await nav(page).getByRole('link', { name: 'Hồ sơ cá nhân' }).click()
    await expect(page).toHaveURL(/\/profile$/)

    await nav(page).getByRole('link', { name: /Tin tức/ }).click()
    await expect(rows(page).first()).toContainText('Họp khẩn đột xuất')

    await rows(page).first().click()
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Họp khẩn đột xuất' })).toBeVisible()
    expect(streams).toEqual([])
  })

  test('the nav entry and the landing redirect point at the inbox', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/news$/)
    await expect(nav(page).getByRole('link', { name: /Tin tức/ })).toHaveAttribute('aria-current', 'page')
    await row(page, TRAINING).first().click()
    await expect(nav(page).getByRole('link', { name: /Tin tức/ })).toHaveAttribute('aria-current', 'page')
  })

  test('the list keeps its scroll position when a detail opens over it', async ({ page }) => {
    await openInbox(page)
    await scrollListToEnd(page)
    await expect(rows(page)).toHaveCount(26)
    const before = await page.locator('#main-content').evaluate((el) => el.scrollTop)
    expect(before).toBeGreaterThan(300)
    await rows(page).last().click()
    await expect(dialog(page)).toBeVisible()
    const after = await page.locator('#main-content').evaluate((el) => el.scrollTop)
    expect(after).toBeGreaterThan(before - 5)
  })
})

test.describe('mobile 375', () => {
  test.use({ viewport: MOBILE })

  test('the list fits the screen; the filter button reveals tags and dates', async ({ page }) => {
    await openInbox(page)
    await expectNoHorizontalScroll(page)
    await expect(page.getByRole('group', { name: 'Lọc theo nhãn' })).toHaveCount(0)
    await shot(page, 'inbox-375')

    await page.getByRole('button', { name: 'Bộ lọc' }).click()
    const tags = page.getByRole('group', { name: 'Lọc theo nhãn' })
    await expect(tags).toBeVisible()
    await tags.getByRole('button', { name: 'Đào tạo' }).click()
    await expect(page).toHaveURL(/[?&]tags=5$/)
    await expect(rows(page)).toHaveCount(5)
    await expect(page.getByRole('group', { name: 'Từ ngày' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shot(page, 'inbox-filters-375')
  })

  test('the detail is full screen and readable without horizontal scroll', async ({ page }) => {
    await openInbox(page)
    await row(page, SALARY_2026).click()
    const dlg = dialog(page)
    await expect(dlg.getByRole('heading', { level: 2, name: SALARY_2026 })).toBeVisible()
    const box = (await dlg.boundingBox())!
    expect(Math.round(box.width)).toBe(MOBILE.width)
    expect(Math.round(box.height)).toBe(MOBILE.height)
    await expectNoHorizontalScroll(page)
    await expect(dlg.getByTestId('notification-body')).toContainText('4,98')
    await shot(page, 'detail-375')

    await dlg.getByRole('button', { name: 'Đóng' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/news$/)
    await expectNoHorizontalScroll(page)
  })
})
