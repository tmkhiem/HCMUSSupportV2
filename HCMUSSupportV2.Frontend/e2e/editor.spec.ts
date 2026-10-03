import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { installFake } from './editorFake.ts'
import type { FakeApi } from './editorFake.ts'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'
import { makeXlsx } from './xlsx.ts'

/**
 * D09 Quản lý thông báo against a stateful fake of `/api/manage/*` (e2e/editorFake.ts), mock auth, port 5683.
 * Seed: 6 notifications (published salary 2025 with an applied sheet, published all-staff, scheduled, draft 2026,
 * archived, published to one employee), 4 tags, 2 series, 2 groups, 5 employees (T0005 inactive).
 * Screenshots go to docs/screenshots/d09/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d09/', import.meta.url))
const SALARY_2025 = 'Thông báo nâng lương thường xuyên năm 2025'
const DRAFT_2026 = 'Nâng lương thường xuyên năm 2026 (nháp)'
const SEED_ID = (n: number) => `0198b000-0000-7000-8000-${String(n).padStart(12, '0')}`

test.describe.configure({ timeout: 90_000 })

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500) // fly-in and dialog transitions
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled' })
}

const rows = (page: Page) => page.getByTestId('manage-row')
const row = (page: Page, title: string) => rows(page).filter({ hasText: title })
const toast = (page: Page, text: string) => expect(page.getByRole('status').filter({ hasText: text })).toBeVisible()

async function openList(page: Page, query = ''): Promise<FakeApi> {
  const fake = await installFake(page)
  await page.goto(`/quan-ly/thong-bao${query}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Quản lý thông báo', includeHidden: true })).toBeAttached()
  await expect(rows(page).first()).toBeAttached()
  return fake
}

async function openEditor(page: Page, id: string): Promise<FakeApi> {
  const fake = await installFake(page)
  await page.goto(`/quan-ly/thong-bao/${id}`)
  await expect(page.getByTestId('title-input')).toBeVisible()
  await expect(page.getByTestId('notification-editor')).toBeVisible()
  return fake
}

async function pickEmployee(page: Page, code: string) {
  const picker = page.getByRole('combobox', { name: 'Xem trước với tư cách…' })
  await picker.fill(code)
  await page.getByRole('option', { name: new RegExp(code) }).click()
}

test.describe('desktop 1440', () => {
  test.use({ viewport: DESKTOP })

  test('the list shows status chips, series, tags, recipient counts and fits the page', async ({ page }) => {
    await openList(page)
    await expect(page).toHaveTitle(/Quản lý thông báo/)
    await expect(rows(page)).toHaveCount(6)
    const salary = row(page, SALARY_2025)
    await expect(salary.getByTestId('status-chip')).toHaveText('Đã đăng')
    await expect(salary).toContainText('Nâng lương thường xuyên')
    await expect(salary).toContainText('Lương')
    await expect(salary).toContainText('Cần xác nhận')
    await expect(salary).toContainText('284 người nhận')
    await expect(row(page, 'Khảo sát mức độ hài lòng quý II')).toContainText('Đăng lúc')
    await expect(row(page, DRAFT_2026).getByTestId('status-chip')).toHaveText('Bản nháp')
    await expect(row(page, DRAFT_2026)).toContainText('Chưa gửi cho ai')
    await expectNoHorizontalScroll(page)
    await shot(page, 'list-1440')
  })

  test('filters (status, tag, series, search) live in the URL and narrow the list', async ({ page }) => {
    await openList(page)
    await page.getByRole('button', { name: 'Đã đăng', exact: true }).click()
    await expect(page).toHaveURL(/status=published/)
    await expect(rows(page)).toHaveCount(3)
    await page.getByRole('button', { name: 'Đã đăng', exact: true }).click() // toggles off
    await expect(rows(page)).toHaveCount(6)

    await page.getByLabel('Thẻ', { exact: true }).click()
    await page.getByRole('option', { name: 'Lương' }).click()
    await expect(page).toHaveURL(/tag=1/)
    await expect(rows(page)).toHaveCount(2)
    await page.getByLabel('Chuỗi', { exact: true }).click()
    await page.getByRole('option', { name: 'Khảo sát hằng quý' }).click()
    await expect(rows(page)).toHaveCount(0)
    await expect(page.getByText('Không có thông báo nào phù hợp bộ lọc.')).toBeVisible()
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
    await expect(rows(page)).toHaveCount(6)

    await page.getByLabel('Tìm thông báo').fill('nghỉ hè')
    await expect(page).toHaveURL(/q=ngh%E1%BB%89\+h%C3%A8|q=nghỉ/)
    await expect(rows(page)).toHaveCount(1)
    await page.reload() // the view survives a reload
    await expect(page.getByLabel('Tìm thông báo')).toHaveValue('nghỉ hè')
    await expect(rows(page)).toHaveCount(1)
  })

  test('row actions: copy opens the new draft, archive and delete ask first', async ({ page }) => {
    const fake = await openList(page)
    await row(page, SALARY_2025).getByRole('button', { name: /^Thao tác với/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Xóa bản nháp' })).toHaveCount(0) // only drafts can be deleted
    await page.getByRole('menuitem', { name: 'Sao chép thành bản nháp' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/thong-bao\/0198b000-/)
    await expect(page.getByTestId('title-input')).toHaveValue(SALARY_2025)
    await expect(page.getByTestId('status-chip')).toHaveText('Bản nháp')
    expect(fake.calls).toContain(`POST notifications/${SEED_ID(1)}/clone`)

    await page.goto('/quan-ly/thong-bao')
    await expect(rows(page)).toHaveCount(7)
    await row(page, 'Mở lớp bồi dưỡng').getByRole('button', { name: /^Thao tác với/ }).click()
    await page.getByRole('menuitem', { name: 'Lưu trữ' }).click()
    const archive = page.getByRole('dialog', { name: 'Lưu trữ thông báo?' })
    await expect(archive).toContainText('biến mất khỏi hộp thư')
    await archive.getByRole('button', { name: 'Lưu trữ' }).click()
    await expect(row(page, 'Mở lớp bồi dưỡng').getByTestId('status-chip')).toHaveText('Đã lưu trữ')

    await row(page, DRAFT_2026).getByRole('button', { name: /^Thao tác với/ }).click()
    await page.getByRole('menuitem', { name: 'Xóa bản nháp' }).click()
    await page.getByRole('dialog', { name: 'Xóa bản nháp?' }).getByRole('button', { name: 'Xóa' }).click()
    await expect(row(page, DRAFT_2026)).toHaveCount(0)
  })

  test('tags and series dialog: add, rename, duplicate refused, delete', async ({ page }) => {
    await openList(page)
    await page.getByRole('button', { name: 'Thẻ và chuỗi' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thẻ và chuỗi thông báo' })
    await expect(dialog.getByRole('list', { name: 'Danh sách thẻ' }).getByRole('listitem')).toHaveCount(4)

    await dialog.getByRole('button', { name: 'Thêm thẻ' }).click()
    await dialog.getByLabel('Tên thẻ mới').fill('Tuyển dụng')
    await dialog.getByRole('radio', { name: 'Màu #0288D1' }).click()
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Danh sách thẻ' })).toContainText('Tuyển dụng')

    await dialog.getByRole('button', { name: 'Thêm thẻ' }).click()
    await dialog.getByLabel('Tên thẻ mới').fill('Lương')
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('đã tồn tại')
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()

    await dialog.getByRole('button', { name: 'Sửa thẻ Tuyển dụng' }).click()
    await dialog.getByLabel('Tên thẻ').fill('Tuyển sinh')
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Danh sách thẻ' })).toContainText('Tuyển sinh')
    await dialog.getByRole('button', { name: 'Xóa thẻ Tuyển sinh' }).click()
    await dialog.getByRole('button', { name: 'Xóa', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Danh sách thẻ' })).not.toContainText('Tuyển sinh')
    await shot(page, 'tags-dialog-1440')

    await dialog.getByRole('tab', { name: 'Chuỗi' }).click()
    await expect(dialog.getByRole('list', { name: 'Danh sách chuỗi' })).toContainText('Nâng lương thường xuyên')
    await dialog.getByRole('button', { name: 'Thêm chuỗi' }).click()
    await dialog.getByLabel('Tên chuỗi mới').fill('Họp giao ban')
    await dialog.getByLabel('Mô tả (không bắt buộc)').fill('Hằng tháng')
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Danh sách chuỗi' })).toContainText('Họp giao ban')
    await dialog.getByRole('button', { name: 'Xóa chuỗi Họp giao ban' }).click()
    await dialog.getByRole('button', { name: 'Xóa', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Danh sách chuỗi' })).not.toContainText('Họp giao ban')
  })

  test('a new notification: server validation shows line and column, the first save creates the draft', async ({ page }) => {
    await installFake(page)
    await page.goto('/quan-ly/thong-bao/moi')
    await expect(page.getByTestId('start-from')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Soạn thông báo mới' })).toBeVisible()
    await expect(page.getByTestId('status-chip')).toHaveText('Bản nháp')
    await expect(page.getByRole('button', { name: 'Lưu' })).toBeEnabled()

    // Empty title: refused with the field message.
    await page.getByRole('button', { name: 'Lưu' }).click()
    await expect(page.getByText('Tiêu đề không được để trống.')).toBeVisible()

    await page.getByTestId('title-input').fill('Thông báo lịch họp')
    await page.getByRole('button', { name: 'Thêm biến' }).click()
    await expect(page.getByLabel('Khóa biến 1')).toHaveValue('Bien')
    await page.getByLabel('Khóa biến 1').fill('Ten_Day_Du')
    await page.getByLabel('Nhãn biến 1').fill('Họ và tên')

    // The body uses a variable that is not declared: the server's message lists it.
    const editor = page.getByRole('textbox', { name: 'nội dung thông báo' })
    await editor.click()
    await page.keyboard.type('Kính gửi ')
    await page.getByRole('button', { name: 'Chèn biến' }).click()
    await page.getByRole('menuitem', { name: /Họ và tên/ }).click()
    await expect(editor.getByText('Ten_Day_Du')).toBeVisible()
    await page.getByLabel('Khóa biến 1').fill('Khac')
    await page.getByRole('button', { name: 'Lưu' }).click()
    await expect(page.getByTestId('body-errors')).toContainText('chưa được khai báo')
    await page.getByLabel('Khóa biến 1').fill('Ten_Day_Du')

    await page.getByRole('button', { name: 'Lưu' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/thong-bao\/0198b000-/)
    await toast(page, 'Đã tạo bản nháp.')
    await expect(page.getByTestId('body-errors')).toHaveCount(0)
    await expect(page.getByTestId('dirty-flag')).toHaveCount(0)
    await expect(page.getByTestId('title-input')).toHaveValue('Thông báo lịch họp') // the form survived the URL change
    await expect(page.getByTestId('start-from')).toHaveCount(0)
  })

  test('the salary draft: targeting count, import report and apply, preview as a recipient (screenshots)', async ({ page }) => {
    await openEditor(page, SEED_ID(4))
    await expect(page.getByTestId('status-chip')).toHaveText('Bản nháp')
    await expect(page.getByTestId('markdown-preview')).toContainText('Nâng lương thường xuyên năm 2026')

    // Targeting: the live estimate follows the unsaved choices.
    const count = page.getByTestId('recipient-count')
    await expect(count).toContainText('0')
    await page.getByRole('switch', { name: 'Tất cả nhân sự (đã có email)' }).check()
    await expect(count).toContainText('380')
    await page.getByRole('switch', { name: 'Tất cả nhân sự (đã có email)' }).uncheck()
    await page.getByRole('combobox', { name: 'Nhóm' }).fill('CNTT')
    await page.getByRole('option', { name: /Giảng viên Khoa CNTT/ }).click()
    await expect(count).toContainText('42')
    const people = page.getByRole('combobox', { name: 'Nhân sự cụ thể' })
    await people.fill('dao tao') // accents ignored
    await page.getByRole('option', { name: /T0004/ }).click()
    await expect(count).toContainText('43')
    await expect(page.getByTestId('dirty-flag')).toBeVisible()

    // Import: report first, nothing applied until the editor says so.
    await page.getByRole('button', { name: 'Tải danh sách' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tải danh sách người nhận' })
    await expect(dialog.getByRole('button', { name: 'Áp dụng danh sách' })).toBeDisabled()
    await dialog.getByTestId('import-file').setInputFiles({
      name: 'nang-luong-2026.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: makeXlsx([['MSCB', 'Hệ số lương', 'Ngày hiệu lực', 'Ghi chú'], ['T0003', '4,06', '01/07/2026', 'x']]),
    })
    const report = dialog.getByTestId('import-report')
    await expect(report).toContainText('4 dòng')
    await expect(report).toContainText('3 người nhận')
    await expect(report).toContainText('ZZ9999')
    await expect(report).toContainText('đang không hoạt động')
    await expect(report).toContainText('thiếu cột')
    await expect(report).toContainText('MucLuong')
    await expect(report.getByRole('table', { name: 'Các cột của tệp' })).toContainText('HeSoLuong')
    await shot(page, 'import-report-1440')
    await dialog.getByRole('button', { name: 'Áp dụng danh sách' }).click()
    await expect(dialog).toHaveCount(0)
    await toast(page, 'Đã áp dụng danh sách người nhận.')
    await expect(page.getByTestId('import-summary')).toContainText('Đang dùng danh sách')
    await expect(page.getByLabel('Khóa biến 5')).toHaveValue('GhiChu') // the new column became a variable

    // Preview as a recipient.
    await pickEmployee(page, 'T0003')
    const preview = page.getByTestId('markdown-preview')
    await expect(preview).toContainText('4,06')
    await expect(preview).toContainText('Nâng lương thường xuyên năm 2026')
    await expect(page.getByTestId('preview-status')).toContainText('Thuộc đối tượng nhận')
    await pickEmployee(page, 'T0005')
    await expect(page.getByTestId('preview-status')).toContainText('Chưa thuộc đối tượng nhận')
    await pickEmployee(page, 'T0003')
    await expect(page.getByTestId('attachments-panel')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.locator('#main-content').evaluate((el) => el.scrollTo(0, 0))
    await shot(page, 'editor-1440')
    await page.locator('#main-content').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await shot(page, 'editor-lower-1440')
  })

  test('schedule, publish, then archive; a published notification shows recipient stats', async ({ page }) => {
    await openEditor(page, SEED_ID(4))
    // No audience: the server refuses and the dialog shows why.
    await page.getByRole('button', { name: 'Đăng ngay' }).click()
    const publish = page.getByRole('dialog', { name: 'Đăng thông báo ngay?' })
    await publish.getByRole('button', { name: 'Đăng ngay' }).click()
    await expect(publish.getByRole('alert')).toContainText('chưa sẵn sàng')
    await expect(page.getByText('Chưa chọn người nhận.')).toBeVisible()
    await publish.getByRole('button', { name: 'Hủy' }).click()

    await page.getByRole('switch', { name: 'Tất cả nhân sự (đã có email)' }).check()
    await page.getByRole('button', { name: 'Lên lịch' }).click()
    const schedule = page.getByRole('dialog', { name: 'Lên lịch đăng' })
    await expect(schedule.getByRole('button', { name: 'Lên lịch', exact: true })).toBeDisabled()
    await schedule.getByRole('spinbutton').first().click()
    await page.keyboard.type('010120300830')
    await schedule.getByRole('button', { name: /^Lên lịch 01\/01\/2030 08:30/ }).click()
    await expect(page.getByTestId('status-chip')).toHaveText('Đã lên lịch')
    await expect(page.getByText('Sẽ tự động đăng lúc 01/01/2030 08:30.')).toBeVisible()

    await page.getByRole('button', { name: 'Đăng ngay' }).click()
    await page.getByRole('dialog', { name: 'Đăng thông báo ngay?' }).getByRole('button', { name: 'Đăng ngay' }).click()
    await expect(page.getByTestId('status-chip')).toHaveText('Đã đăng')
    await toast(page, 'Đã đăng thông báo.')
    await expect(page.getByTestId('stats-panel')).toContainText('người nhận')
    await expect(page.getByRole('button', { name: 'Đăng ngay' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Thêm thao tác' }).click()
    await page.getByRole('menuitem', { name: 'Lưu trữ' }).click()
    await page.getByRole('dialog', { name: 'Lưu trữ thông báo?' }).getByRole('button', { name: 'Lưu trữ' }).click()
    await expect(page.getByTestId('status-chip')).toHaveText('Đã lưu trữ')
    await expect(page.getByText('Thông báo đã lưu trữ và không còn hiện trong hộp thư người nhận.')).toBeVisible()
  })

  test('a published notification: revisions can be reloaded into the form, saving shows the update notice', async ({ page }) => {
    await openEditor(page, SEED_ID(1))
    await expect(page.getByTestId('stats-panel')).toContainText('284 người nhận')
    await expect(page.getByTestId('status-chip')).toHaveText('Đã đăng')
    await expect(page.getByTestId('import-summary')).toContainText('Đang dùng danh sách')

    await pickEmployee(page, 'T0004')
    await expect(page.getByTestId('markdown-preview')).toContainText('4,06')
    await expect(page.getByTestId('markdown-preview')).toContainText('9.800.000 đ')

    await page.getByRole('button', { name: 'Thêm thao tác' }).click()
    await page.getByRole('menuitem', { name: 'Lịch sử chỉnh sửa' }).click()
    const dialog = page.getByRole('dialog', { name: 'Lịch sử chỉnh sửa' })
    await expect(dialog.getByTestId('revision-list').getByRole('button')).toHaveCount(3)
    await expect(dialog).toContainText('Phiên bản 3 (hiện tại)')
    await dialog.getByRole('button', { name: /Phiên bản 1/ }).click()
    await expect(dialog).toContainText('Nội dung khi đăng.')
    await shot(page, 'revisions-1440')
    await dialog.getByRole('button', { name: 'Dùng lại nội dung này' }).click()
    await toast(page, 'Đã nạp nội dung phiên bản 1')
    await expect(page.getByTestId('dirty-flag')).toBeVisible()
    await expect(page.getByTestId('markdown-preview')).toContainText('Bản đầu')
    await page.getByRole('button', { name: 'Lưu', exact: true }).click()
    await toast(page, 'Người nhận thấy nhãn “Đã cập nhật”')
    await expect(page.getByText(/Phiên bản 4/)).toBeVisible()
  })

  test('a version conflict offers to overwrite; leaving with unsaved changes asks first', async ({ page }) => {
    const fake = await openEditor(page, SEED_ID(4))
    fake.state.notifications.find((n) => n.id === SEED_ID(4))!.version = 7 // someone else saved
    await page.getByTestId('title-input').fill('Tiêu đề sửa')
    await page.getByRole('button', { name: 'Lưu', exact: true }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'người khác cập nhật' })
    await expect(alert).toBeVisible()
    await alert.getByRole('button', { name: 'Lưu đè' }).click()
    await toast(page, 'Đã lưu.')
    await expect(page.getByText(/Phiên bản 8/)).toBeVisible()

    await page.getByTestId('title-input').fill('Sửa tiếp')
    await page.getByRole('link', { name: 'Quản lý thông báo', exact: true }).first().click()
    const leave = page.getByRole('dialog', { name: 'Rời khỏi trang?' })
    await expect(leave).toBeVisible()
    await leave.getByRole('button', { name: 'Hủy' }).click()
    await expect(page).toHaveURL(/thong-bao\/0198b000/)
    await page.getByRole('link', { name: 'Quản lý thông báo', exact: true }).first().click()
    await page.getByRole('dialog', { name: 'Rời khỏi trang?' }).getByRole('button', { name: 'Rời đi, bỏ thay đổi' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/thong-bao$/)
  })

  test('attachments: add and remove (a draft is saved first)', async ({ page }) => {
    await installFake(page)
    await page.goto('/quan-ly/thong-bao/moi')
    await page.getByTestId('title-input').fill('Thông báo có tệp')
    await page.getByTestId('attachment-file').setInputFiles({ name: 'quyet-dinh.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') })
    await expect(page.getByTestId('attachments-panel')).toContainText('quyet-dinh-nang-luong.pdf')
    await expect(page).toHaveURL(/\/quan-ly\/thong-bao\/0198b000-/)
    await page.getByRole('button', { name: 'Xóa tệp quyet-dinh-nang-luong.pdf' }).click()
    await expect(page.getByTestId('attachments-panel')).toContainText('Chưa có tệp đính kèm')
  })

  test('an unknown notification shows a message and a way back', async ({ page }) => {
    await installFake(page)
    await page.goto('/quan-ly/thong-bao/0198b000-0000-7000-8000-00000000ffff')
    await expect(page.getByText('Không tìm thấy thông báo này.')).toBeVisible()
    await page.getByRole('button', { name: 'Về danh sách' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/thong-bao$/)
  })
})

test.describe('mobile 375', () => {
  test.use({ viewport: MOBILE })

  test('the list fits the screen and the row menu works', async ({ page }) => {
    await openList(page)
    await expect(rows(page)).toHaveCount(6)
    await expectNoHorizontalScroll(page)
    await shot(page, 'list-375')
    await row(page, SALARY_2025).getByRole('button', { name: /^Thao tác với/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Sao chép thành bản nháp' })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('the editor stacks, the preview is a tab, dialogs are full screen', async ({ page }) => {
    await openEditor(page, SEED_ID(4))
    await expectNoHorizontalScroll(page)
    await shot(page, 'editor-375')
    await page.getByTestId('pane-preview').click()
    await expect(page.getByTestId('markdown-preview')).toBeVisible()
    await expect(page.getByTestId('editor-pane')).toBeHidden()
    await pickEmployee(page, 'T0001')
    await expectNoHorizontalScroll(page)
    await shot(page, 'preview-375')

    await page.getByRole('button', { name: 'Tải danh sách' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tải danh sách người nhận' })
    await dialog.getByTestId('import-file').setInputFiles({
      name: 'ds.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: makeXlsx([['MSCB', 'Hệ số lương'], ['T0003', '4,06']]),
    })
    await expect(dialog.getByTestId('import-report')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shot(page, 'import-375')
  })
})
