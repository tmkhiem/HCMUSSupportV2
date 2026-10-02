import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D08 Tin tức inbox against the synthetic mock inbox (`inboxMock.ts`, VITE_MOCK_AUTH=1, port 5483).
 * The mock holds 26 posts (page size 20): 5 unread (#1 pinned + needs ack + series with 2 earlier posts, #4 two vars
 * rows, #5 updated after delivery, #7, #10). `window.__inboxMock.publish(title)` delivers a new post (no live stream).
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
// CSS locator: while a dialog is open the shell is aria-hidden, which role queries skip.
const navBadge = (page: Page) =>
  page.locator('nav[aria-label="Điều hướng chính"] a[href="/tin-tuc"] .MuiBadge-badge').filter({ visible: true })
const avatarDot = (page: Page) => page.getByTestId('avatar-dot').filter({ visible: true })

/** Open `/tin-tuc` and wait for the first page of rows. */
async function openInbox(page: Page, path = '/tin-tuc', waitForRows = true) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'Tin tức', includeHidden: true })).toBeAttached()
  if (waitForRows) await expect(rows(page).first()).toBeAttached()
}

async function scrollListToEnd(page: Page) {
  await page.locator('#main-content').evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
}

test.describe('desktop 1440', () => {
  test.use({ viewport: DESKTOP })

  test('the list renders with unread, pinned, ack and attachment markers; badge and avatar dot show 5', async ({ page }) => {
    await openInbox(page)
    await expect(page).toHaveTitle(/Tin tức/)
    await expect(rows(page)).toHaveCount(20)

    const pinned = row(page, SALARY_2026)
    await expect(pinned).toHaveAttribute('data-unread', 'true')
    await expect(pinned.getByTestId('unread-dot')).toBeVisible()
    await expect(pinned).toContainText('Ghim')
    await expect(pinned).toContainText('Cần xác nhận')
    await expect(pinned).toContainText('Lương')
    await expect(pinned).toContainText('+1')
    await expect(pinned).toContainText('28/09/2026')
    await expect(pinned.getByRole('img', { name: 'Có tệp đính kèm' })).toBeVisible()
    await expect(rows(page).first()).toContainText(SALARY_2026) // pinned first

    await expect(row(page, 'Khảo sát mức độ hài lòng')).toContainText('Đã cập nhật')
    const read = row(page, 'Danh sách khen thưởng năm học 2025-2026')
    await expect(read).toHaveAttribute('data-unread', 'false')
    await expect(read.getByTestId('unread-dot')).toHaveCount(0)
    await expect(read).not.toContainText('Ghim')

    await expect(rows(page).and(page.locator('[data-unread="true"]'))).toHaveCount(5)
    await expect(navBadge(page)).toHaveText('5')
    await expect(avatarDot(page)).toBeVisible()
    await expect(page.getByText('5 thông báo chưa đọc')).toBeVisible()
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
    await expect(page).toHaveURL(/\/tin-tuc$/)
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
    await expect(page).toHaveURL(/\/tin-tuc$/)
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

  test('"Chưa đọc" shows only unread posts', async ({ page }) => {
    await openInbox(page)
    const toggle = page.getByRole('button', { name: 'Chỉ hiện thông báo chưa đọc' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/[?&]unread=1$/)
    await expect(rows(page)).toHaveCount(5)
    await expect(rows(page).and(page.locator('[data-unread="false"]'))).toHaveCount(0)
  })

  test('an empty result explains itself and "Xóa bộ lọc" resets', async ({ page }) => {
    await openInbox(page, '/tin-tuc?q=zzzz&unread=1', false)
    await expect(page.getByText('Không tìm thấy thông báo nào phù hợp.')).toBeVisible()
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
    await expect(page).toHaveURL(/\/tin-tuc$/)
    await expect(rows(page)).toHaveCount(20)
    await expect(page.getByRole('searchbox', { name: 'Tìm kiếm thông báo' })).toHaveValue('')
  })

  test('opening a row shows the detail over the list: body with values, attachments, earlier posts', async ({ page }) => {
    await openInbox(page)
    await row(page, SALARY_2026).click()
    await expect(page).toHaveURL(`/tin-tuc/${SALARY_ID}`)

    const dlg = dialog(page)
    await expect(dlg.getByRole('heading', { level: 2, name: SALARY_2026 })).toBeVisible()
    const meta = dlg.getByTestId('detail-meta')
    await expect(meta).toContainText('28/09/2026')
    await expect(meta).toContainText('Lương')
    await expect(meta).toContainText('Nâng lương thường xuyên') // series
    await expect(meta).toContainText('Ghim')

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
    await openInbox(page, '/tin-tuc?tags=1')
    await row(page, SALARY_2026).click()
    await expect(page).toHaveURL(new RegExp(`/tin-tuc/${SALARY_ID}\\?tags=1$`))

    await dialog(page).getByTestId('series-previous').getByRole('link', { name: new RegExp(SALARY_2025) }).click()
    await expect(page).toHaveURL(/\/tin-tuc\/0198a000-0000-7000-8000-000000000002\?tags=1$/)
    await expect(dialog(page).getByRole('heading', { level: 2, name: SALARY_2025 })).toBeVisible()
    await expect(dialog(page)).toContainText('Đã xác nhận lúc')
    await expect(dialog(page).getByTestId('series-previous').getByRole('link')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/tin-tuc\?tags=1$/)
    await expect(rows(page).first()).toBeVisible()
  })

  test('a detail deep link opens the dialog over the list; closing goes to the list', async ({ page }) => {
    await openInbox(page, `/tin-tuc/${SALARY_ID}`)
    await expect(dialog(page).getByRole('heading', { level: 2, name: SALARY_2026 })).toBeVisible()
    await expect(rows(page).first()).toBeVisible()

    await dialog(page).getByRole('button', { name: 'Đóng' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/tin-tuc$/)
  })

  test('browser Back from an opened detail returns to the list', async ({ page }) => {
    await openInbox(page)
    await row(page, TRAINING).click()
    await expect(dialog(page)).toBeVisible()
    await page.goBack()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/tin-tuc$/)
  })

  test('an unknown post id says so instead of a blank dialog', async ({ page }) => {
    await openInbox(page, '/tin-tuc/0198a000-0000-7000-8000-00000000ffff')
    await expect(dialog(page)).toContainText('Thông báo này không tồn tại hoặc bạn không có quyền xem.')
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Không tìm thấy thông báo' })).toBeVisible()
  })

  test('opening an unread post marks it read: the dot, the nav badge and the count drop', async ({ page }) => {
    await openInbox(page)
    await expect(navBadge(page)).toHaveText('5')
    await expect(row(page, TRAINING)).toHaveAttribute('data-unread', 'true')

    await row(page, TRAINING).click()
    await expect(dialog(page).getByRole('heading', { level: 2, name: TRAINING })).toBeVisible()
    await expect(navBadge(page)).toHaveText('4')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(row(page, TRAINING)).toHaveAttribute('data-unread', 'false')
    await expect(row(page, TRAINING).getByTestId('unread-dot')).toHaveCount(0)
    await expect(page.getByText('4 thông báo chưa đọc')).toBeVisible()

    // Opening it again changes nothing.
    await row(page, TRAINING).click()
    await expect(dialog(page)).toBeVisible()
    await expect(navBadge(page)).toHaveText('4')
  })

  test('acknowledge: the button asks once, the chip replaces it, the row loses "Cần xác nhận"', async ({ page }) => {
    await openInbox(page)
    await row(page, SALARY_2026).click()
    const ack = dialog(page).getByRole('button', { name: 'Xác nhận đã đọc' })
    await expect(ack).toBeEnabled()
    await ack.click()
    await expect(dialog(page).getByText(/Đã xác nhận lúc \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)).toBeVisible()
    await expect(ack).toHaveCount(0)

    // The button that had focus is gone, so focus sits on <body> and a page-level Escape never reaches the dialog.
    await dialog(page).press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(row(page, SALARY_2026)).not.toContainText('Cần xác nhận')
    await expect(row(page, SALARY_2026)).toHaveAttribute('data-unread', 'false')
    await expect(navBadge(page)).toHaveText('4')

    // Persisted for the session: reopening shows the acknowledged state, no button.
    await row(page, SALARY_2026).click()
    await expect(dialog(page)).toContainText('Đã xác nhận lúc')
    await expect(dialog(page).getByRole('button', { name: 'Xác nhận đã đọc' })).toHaveCount(0)
  })

  test('"Đánh dấu tất cả đã đọc" clears every dot and the badge', async ({ page }) => {
    await openInbox(page)
    await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click()
    await expect(navBadge(page)).toBeHidden()
    await expect(avatarDot(page)).toHaveCount(0)
    await expect(rows(page).and(page.locator('[data-unread="true"]'))).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeDisabled()
    await expect(page.getByText('Bạn đã đọc hết thông báo')).toBeVisible()
  })

  test('there is no live stream: a new delivery shows on the next route change (badge) and when the inbox is entered again (list)', async ({ page }) => {
    const streams: string[] = []
    page.on('request', (r) => r.url().includes('/api/notifications/stream') && streams.push(r.url()))
    await openInbox(page)
    await page.waitForFunction(() => Boolean(window.__inboxMock))
    await expect(navBadge(page)).toHaveText('5')

    await page.evaluate(() => window.__inboxMock!.publish('Họp khẩn đột xuất'))
    await page.waitForTimeout(300)
    await expect(navBadge(page)).toHaveText('5') // nothing pushes it

    await nav(page).getByRole('link', { name: 'Hồ sơ cá nhân' }).click()
    await expect(page).toHaveURL(/\/ho-so$/)
    await expect(navBadge(page)).toHaveText('6')
    await expect(avatarDot(page)).toBeVisible()

    await nav(page).getByRole('link', { name: /Tin tức/ }).click()
    // Pinned posts stay on top; the new one leads the rest.
    await expect(rows(page).nth(1)).toContainText('Họp khẩn đột xuất')
    await expect(rows(page).nth(1)).toHaveAttribute('data-unread', 'true')

    await rows(page).nth(1).click()
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Họp khẩn đột xuất' })).toBeVisible()
    await expect(navBadge(page)).toHaveText('5')
    expect(streams).toEqual([])
  })

  test('while viewing as someone else nothing is written: read, ack and read-all are disabled', async ({ page }) => {
    await openInbox(page, '/tin-tuc?mock-view-as=1')
    await expect(page.getByText('Đang xem với tư cách')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeDisabled()

    await row(page, SALARY_2026).click()
    const ack = dialog(page).getByRole('button', { name: 'Xác nhận đã đọc' })
    await expect(ack).toBeDisabled()
    await expect(navBadge(page)).toHaveText('5') // no POST read was sent
    await page.keyboard.press('Escape')
    await expect(row(page, SALARY_2026)).toHaveAttribute('data-unread', 'true')
  })

  test('the nav entry and the landing redirect point at the inbox', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/tin-tuc$/)
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
    await expect(avatarDot(page)).toBeVisible()
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

  test('the nav badge shows in the drawer', async ({ page }) => {
    await openInbox(page)
    await page.getByRole('button', { name: 'Mở menu' }).click()
    await expect(navBadge(page)).toHaveText('5')
  })

  test('the detail is full screen, readable without horizontal scroll, and can be acknowledged', async ({ page }) => {
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

    await dlg.getByRole('button', { name: 'Xác nhận đã đọc' }).click()
    await expect(dlg.getByText(/Đã xác nhận lúc/)).toBeVisible()
    await dlg.getByRole('button', { name: 'Đóng' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/tin-tuc$/)
    await expectNoHorizontalScroll(page)
  })
})
