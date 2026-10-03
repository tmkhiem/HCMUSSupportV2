import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { stubAdminApi } from './adminFixtures.ts'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D14b admin and group pages. Runs against `vite` with VITE_MOCK_AUTH=1 (port 5393); `/api/**` is stubbed per test
 * (adminFixtures.ts). Screenshots go to docs/screenshots/d14b/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d14b/', import.meta.url))
async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(450) // fly-in transitions
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled' })
}

const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })
const groupList = (page: Page) => page.getByRole('list', { name: 'Danh sách nhóm' })
const unsavedBar = (page: Page) => page.getByRole('region', { name: 'Thay đổi chưa lưu' })
const condition = (page: Page, n: number) => page.getByRole('group', { name: `Điều kiện ${n}` })

test.describe('admin pages (desktop)', () => {
  test.use({ viewport: DESKTOP })

  test('Quản trị: tiles, quick actions and recent activity', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-tri')
    await expect(h1(page, 'Quản trị')).toBeVisible()
    await expect(page.getByText('Cán bộ đang hoạt động')).toBeVisible()
    await expect(page.getByText('1.284')).toBeVisible()
    await expect(page.getByText('Hoạt động gần đây')).toBeVisible()
    await shoot(page, 'quan-tri-1440')
    await page.getByRole('link', { name: 'Phân quyền' }).first().click()
    await expect(page).toHaveURL(/\/quan-tri\/phan-quyen$/)
  })

  test('Phân quyền: search, role filter, paging, open drawer, toggle editor, save', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/phan-quyen')
    await expect(h1(page, 'Phân quyền')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mở Lê Nhân Viên' })).toBeVisible()
    await page.getByRole('button', { name: 'Tải thêm' }).click()
    await expect(page.getByText('Phạm Giảng Viên')).toBeVisible()

    const filtered = page.waitForRequest((r) => r.url().includes('/api/admin/roles?') && r.url().includes('role=editor'))
    await page.getByRole('combobox', { name: 'Quyền' }).click()
    await page.getByRole('option', { name: 'Biên tập viên' }).click()
    await filtered
    await page.getByRole('combobox', { name: 'Quyền' }).click()
    await page.getByRole('option', { name: 'Tất cả' }).click()

    await page.getByLabel('Tìm cán bộ').fill('Lê Nhân')
    await expect(page.getByRole('button', { name: 'Mở Lê Nhân Viên' })).toBeVisible()
    await expect(page.getByText('Phạm Giảng Viên')).toHaveCount(0)

    await page.getByRole('button', { name: 'Mở Lê Nhân Viên' }).click()
    const drawer = page.getByRole('presentation').filter({ hasText: 'Chi tiết phân quyền' })
    await expect(drawer.getByText('Lê Nhân Viên')).toBeVisible()
    const save = drawer.getByRole('button', { name: 'Lưu' })
    await expect(save).toBeDisabled()
    await drawer.getByRole('switch', { name: /Biên tập viên/ }).check()
    await expect(save).toBeEnabled()
    await shoot(page, 'phan-quyen-drawer-1440')
    await save.click()
    await expect(drawer.getByText('Đã lưu phân quyền')).toBeVisible()
    expect(calls.rolePuts).toEqual([{ code: 'T0003', body: { roles: ['editor'] } }])
  })

  test('Phân quyền: the 409 last-admin message is shown', async ({ page }) => {
    await stubAdminApi(page, { lastAdmin: true })
    await page.goto('/quan-tri/phan-quyen')
    await page.getByRole('button', { name: 'Mở Nguyễn Thử Nghiệm' }).click()
    const drawer = page.getByRole('presentation').filter({ hasText: 'Chi tiết phân quyền' })
    await drawer.getByRole('switch', { name: /Quản trị viên/ }).uncheck()
    await drawer.getByRole('button', { name: 'Lưu' }).click()
    await expect(drawer.getByRole('alert')).toContainText('quản trị viên cuối cùng')
  })

  test('Xem thử: typeahead then start goes to Tin tức', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/xem-thu')
    await expect(h1(page, 'Xem thử')).toBeVisible()
    await page.getByLabel('Cán bộ cần xem').fill('Trần')
    await page.getByRole('option', { name: /Trần Mẫu Thử/ }).click()
    await shoot(page, 'xem-thu-1440')
    await page.getByRole('button', { name: 'Bắt đầu xem thử' }).click()
    await expect(page).toHaveURL(/\/tin-tuc$/)
    expect(calls.viewAs).toEqual([{ employeeCode: 'T0002' }])
  })

  test('view-as bar shows and exits (mock auth; the real DELETE is covered by e2e-real)', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/tin-tuc?mock-view-as=1')
    await expect(page.getByText('Đang xem với tư cách Trần Mẫu Thử')).toBeVisible()
    await page.getByRole('button', { name: 'Thoát' }).click()
    await expect(page.getByText('Đang xem với tư cách')).toHaveCount(0)
  })

  test('Nhật ký: filter by action and date, page', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/nhat-ky')
    await expect(h1(page, 'Nhật ký')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Nhật ký thao tác' }).getByText('Cấp quyền').first()).toBeVisible()
    await page.getByRole('button', { name: 'Tải thêm' }).click()
    await expect(page.getByText('Bắt đầu xem thử').first()).toBeVisible()
    await shoot(page, 'nhat-ky-1440')
    await page.getByLabel('Từ ngày').fill('2026-10-01')
    await expect.poll(() => calls.auditQueries.some((q) => q.includes('from='))).toBe(true)
    await page.getByLabel('Hành động').click()
    await page.getByRole('option', { name: /Đăng nhập/ }).click()
    await expect(page.getByRole('table', { name: 'Nhật ký thao tác' }).getByRole('row')).toHaveCount(2)
  })

  test('Đồng bộ: runs, resolving an issue, showing resolved ones', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/dong-bo')
    await expect(h1(page, 'Đồng bộ')).toBeVisible()
    await expect(page.getByText('Số dòng giảm quá ngưỡng cho phép.')).toBeVisible()
    await shoot(page, 'dong-bo-1440')
    await page.getByRole('button', { name: 'Đánh dấu đã xử lý T0099' }).click()
    await expect.poll(() => calls.resolved).toEqual(['11'])
    expect(calls.syncIssueQueries[0]).toContain('resolved=false')
    await page.getByRole('switch', { name: 'Hiện cả vấn đề đã xử lý' }).check()
    await expect.poll(() => calls.syncIssueQueries.some((q) => !q.includes('resolved='))).toBe(true)
  })

  test('Dữ liệu: template link, upload, validation report, apply', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/du-lieu')
    await expect(h1(page, 'Dữ liệu')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tải tệp mẫu' })).toHaveAttribute('href', '/api/admin/datasets/teaching/template')
    await page.getByRole('tab', { name: 'Bài báo khoa học' }).click()
    await expect(page.getByRole('link', { name: 'Tải tệp mẫu' })).toHaveAttribute('href', '/api/admin/datasets/publications/template')
    await page.getByRole('tab', { name: 'Giảng dạy' }).click()
    await page.getByTestId('dataset-file').setInputFiles({ name: 'giang-day-2025.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') })
    await expect(page.getByText('Hợp lệ, chờ áp dụng')).toBeVisible()
    await expect(page.getByText('X9999', { exact: false })).toBeVisible()
    await expect(page.getByText('Dòng 12 · cột Số tiết')).toBeVisible()
    await shoot(page, 'du-lieu-1440')
    await page.getByRole('button', { name: 'Áp dụng' }).click()
    await expect(page.getByText('Đã áp dụng dữ liệu.')).toBeVisible()
    expect(calls.applied).toHaveLength(1)
  })

  test('API clients: list, create shows the token once, revoke', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/api-clients')
    await expect(h1(page, 'API clients')).toBeVisible()
    const table = page.getByRole('table', { name: 'API clients' })
    await expect(table.getByRole('row', { name: /sync-hrm/ })).toContainText('Đang hoạt động')
    await expect(table.getByRole('row', { name: /legacy-migration/ })).toContainText('Đã thu hồi')
    await shoot(page, 'api-clients-1440')

    await page.getByRole('button', { name: 'Tạo API client' }).click()
    const create = page.getByRole('dialog', { name: 'Tạo API client' })
    await expect(create.getByRole('button', { name: 'Tạo', exact: true })).toBeDisabled()
    await create.getByLabel(/^Tên/).fill('ci-sync')
    await create.getByRole('checkbox', { name: /hrm\.ingest/ }).check()
    await create.getByRole('button', { name: 'Tạo', exact: true }).click()

    const tokenDialog = page.getByRole('dialog', { name: /Token của/ })
    await expect(tokenDialog.getByTestId('api-token')).toHaveValue(/^tok_SYNTHETIC/)
    await expect(tokenDialog).toContainText('chỉ hiển thị một lần')
    await expect(tokenDialog.getByRole('button', { name: 'Sao chép token' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tokenDialog).toBeVisible() // must be dismissed deliberately
    await shoot(page, 'api-clients-token-1440')
    await tokenDialog.getByRole('button', { name: 'Tôi đã lưu token' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('tok_SYNTHETIC')).toHaveCount(0)
    expect(calls.clientCreates).toEqual([{ name: 'ci-sync', scopes: ['hrm.ingest'] }])
    await expect(table.getByRole('row', { name: /ci-sync/ })).toBeVisible()

    await page.getByRole('button', { name: 'Thu hồi ci-sync' }).click()
    await page.getByRole('dialog', { name: /Thu hồi/ }).getByRole('button', { name: 'Thu hồi', exact: true }).click()
    await expect(table.getByRole('row', { name: /ci-sync/ })).toContainText('Đã thu hồi')
    expect(calls.clientRevokes).toHaveLength(1)
  })

  test('Nhóm: list filters (kind chips, search, archived) and restore', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-ly/nhom')
    await expect(h1(page, 'Nhóm')).toBeVisible()
    const list = groupList(page)
    await expect(list.getByText('Ban chủ nhiệm khoa')).toBeVisible()
    await expect(list.getByText('Nhóm cũ 2024')).toHaveCount(0)
    await shoot(page, 'nhom-list-1440')

    await page.getByRole('button', { name: 'Đơn vị', exact: true }).click()
    await expect(list.getByText('Khoa Toán - Tin học')).toBeVisible()
    await expect(list.getByText('Ban chủ nhiệm khoa')).toHaveCount(0)
    await page.getByRole('button', { name: 'Tất cả', exact: true }).click()
    await page.getByLabel('Tìm nhóm').fill('Ban chủ')
    await expect(list.getByRole('button')).toHaveCount(1)
    await page.getByLabel('Tìm nhóm').fill('')

    await page.getByRole('switch', { name: 'Hiện nhóm đã lưu trữ' }).check()
    await list.getByText('Nhóm cũ 2024').click()
    await expect(page).toHaveURL(/\/quan-ly\/nhom\/5$/)
    await expect(page.getByText('Đã lưu trữ').first()).toBeVisible()
    await expect(page.getByLabel('Tên nhóm')).toBeDisabled()
    await page.getByRole('button', { name: 'Khôi phục' }).click()
    await expect.poll(() => calls.restored).toEqual(['5'])
    await expect(page.getByLabel('Tên nhóm')).toBeEnabled()
  })

  test('Nhóm: rule group preview, org-unit condition, unsaved bar and save', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/1')
    await expect(page.getByText('128 cán bộ khớp quy tắc')).toBeVisible()
    await expect(page.getByText('Trần Mẫu Thử · T0002')).toBeVisible()
    await expect(unsavedBar(page)).toHaveCount(0)
    expect(calls.previews[0]).toEqual({ all: [{ field: 'position_title', op: 'contains', value: 'Giảng viên' }, { field: 'has_email', value: true }] })

    // A third condition: Đơn vị picked through the typeahead.
    await page.getByRole('button', { name: 'Thêm điều kiện' }).click()
    await condition(page, 3).getByLabel('Trường').click()
    await page.getByRole('option', { name: 'Đơn vị' }).click()
    await condition(page, 3).getByRole('combobox', { name: 'Đơn vị' }).fill('Toán')
    await page.getByRole('option', { name: 'Khoa Toán - Tin học' }).click()
    await condition(page, 3).getByRole('switch', { name: 'Gồm đơn vị trực thuộc' }).check()
    await expect.poll(() => JSON.stringify(calls.previews.at(-1))).toContain('"field":"org_unit","id":13,"includeDescendants":true')
    await page.getByLabel('Mô tả').fill('Giảng viên có email của khoa Toán')
    const bar = unsavedBar(page)
    await expect(bar).toBeVisible()
    await shoot(page, 'nhom-rule-1440')
    await bar.getByRole('button', { name: 'Lưu' }).click()
    await expect(bar).toHaveCount(0)
    expect(calls.groupPuts).toHaveLength(1)
    expect(calls.groupPuts[0]).toMatchObject({
      description: 'Giảng viên có email của khoa Toán',
      rule: { all: [{ field: 'position_title' }, { field: 'has_email', value: true }, { field: 'org_unit', id: 13, includeDescendants: true }] },
    })
  })

  test('Nhóm: the rule builder offers an editor for every condition kind', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-ly/nhom')
    await page.getByRole('button', { name: 'Tạo nhóm' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Tên nhóm').fill('Giáo sư đang làm việc')
    await dialog.getByRole('radio', { name: /Quy tắc/ }).check()
    // Cycle the first condition through every field type to see its editor.
    const first = dialog.getByRole('group', { name: 'Điều kiện 1' })
    for (const [field, control] of [
      ['Chức danh', 'Chức danh'],
      ['Học hàm', 'Học hàm (một trong)'],
      ['Học vị', 'Học vị (một trong)'],
      ['Trạng thái', 'Trạng thái (một trong)'],
      ['Có email', 'Có email'],
    ] as const) {
      await first.getByLabel('Trường').click()
      await page.getByRole('option', { name: field, exact: true }).click()
      await expect(first.getByLabel(control).or(first.getByRole('button', { name: control })).first()).toBeVisible()
    }
    await expect(dialog.getByRole('button', { name: 'Tạo nhóm' })).toBeEnabled()
  })

  test('Nhóm: create a rule group', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-ly/nhom')
    await page.getByRole('button', { name: 'Tạo nhóm' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Tạo nhóm' })).toBeDisabled()
    await dialog.getByLabel('Tên nhóm').fill('Giảng viên khoa Toán')
    await dialog.getByRole('radio', { name: /Quy tắc/ }).check()
    await dialog.getByRole('combobox', { name: 'Đơn vị' }).fill('Toán')
    await page.getByRole('option', { name: 'Khoa Toán - Tin học' }).click()
    await dialog.getByRole('button', { name: 'Tạo nhóm' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/nhom\/\d+$/)
    expect(calls.groupPosts).toEqual([
      { name: 'Giảng viên khoa Toán', kind: 'rule', rule: { all: [{ field: 'org_unit', id: 13, includeDescendants: false }] } },
    ])
  })

  test('Nhóm: static group, add through the typeahead, remove, import dry run then apply, archive', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/2')
    const members = page.getByRole('table', { name: 'Thành viên' })
    await expect(members.getByText('T0002')).toBeVisible()
    await shoot(page, 'nhom-static-1440')

    await page.getByRole('combobox', { name: 'Thêm thành viên' }).fill('Trần')
    await page.getByRole('option', { name: /Trần Mẫu Thử · T0002/ }).click()
    await page.getByRole('combobox', { name: 'Thêm thành viên' }).fill('X9999')
    await page.getByRole('combobox', { name: 'Thêm thành viên' }).press('Enter')
    await page.getByRole('button', { name: 'Thêm 2 người' }).click()
    await expect.poll(() => calls.memberAdds).toEqual([['T0002', 'X9999']])
    await expect(page.getByText('Đã thêm 1 · Tổng 4 thành viên')).toBeVisible()
    await expect(page.getByText('Không tồn tại (1): X9999')).toBeVisible()

    await members.getByRole('checkbox', { name: 'Chọn Nguyễn Thử Nghiệm' }).check()
    await page.getByRole('button', { name: 'Xóa 1 đã chọn' }).click()
    await expect.poll(() => calls.memberRemoves).toEqual([['T0001']])

    await page.getByTestId('members-file').setInputFiles({ name: 'thanh-vien.csv', mimeType: 'text/csv', buffer: Buffer.from('MSCB\nT0003\nT0004\n') })
    await expect(page.getByText('Kết quả kiểm tra (chưa thay đổi gì)')).toBeVisible()
    await expect(page.getByText('Đã là thành viên (1): T0001')).toBeVisible()
    await page.getByRole('button', { name: 'Áp dụng (2)' }).click()
    await expect(page.getByText(/^Đã nhập/)).toBeVisible()
    expect(calls.memberImports).toEqual([true, false])

    await page.getByRole('button', { name: 'Lưu trữ' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/nhom$/)
    expect(calls.archived).toEqual(['2'])
    await expect(groupList(page).getByText('Ban chủ nhiệm khoa')).toHaveCount(0)
  })

  test('Nhóm: a rule with nested conditions is shown read-only, never flattened', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/6')
    await expect(page.getByText('dùng điều kiện lồng nhau')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm điều kiện' })).toHaveCount(0)
    await expect(page.getByText('Xem trước')).toHaveCount(0)
  })

  test('Nhóm: org-unit group has only the descendants switch; members are read-only', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/3')
    const sw = page.getByRole('switch', { name: /đơn vị trực thuộc/ })
    await expect(sw).toBeChecked()
    await expect(page.getByLabel('Tên nhóm')).toBeDisabled()
    await expect(page.getByRole('combobox', { name: 'Thêm thành viên' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Lưu trữ' })).toHaveCount(0)
    await sw.uncheck()
    await unsavedBar(page).getByRole('button', { name: 'Lưu' }).click()
    await expect(unsavedBar(page)).toHaveCount(0)
    expect(calls.groupPuts).toEqual([{ includeDescendants: false }])
  })

  test('Nhóm: leaving with an unsaved draft asks first', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/2')
    await page.getByLabel('Mô tả').fill('Đã sửa')
    await expect(unsavedBar(page)).toBeVisible()
    await groupList(page).getByText('Giảng viên có email').click()
    const ask = page.getByRole('dialog', { name: 'Bỏ các thay đổi chưa lưu?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Ở lại' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/nhom\/2$/)
    await groupList(page).getByText('Giảng viên có email').click()
    await page.getByRole('button', { name: 'Bỏ thay đổi' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/nhom\/1$/)
  })
})

test.describe('admin pages (mobile 375)', () => {
  test.use({ viewport: MOBILE })

  const pages: [string, string][] = [
    ['/quan-tri', 'quan-tri-375'],
    ['/quan-tri/phan-quyen', 'phan-quyen-375'],
    ['/quan-tri/xem-thu', 'xem-thu-375'],
    ['/quan-tri/nhat-ky', 'nhat-ky-375'],
    ['/quan-tri/dong-bo', 'dong-bo-375'],
    ['/quan-tri/du-lieu', 'du-lieu-375'],
    ['/quan-tri/api-clients', 'api-clients-375'],
    ['/quan-ly/nhom', 'nhom-list-375'],
    ['/quan-ly/nhom/1', 'nhom-rule-375'],
    ['/quan-ly/nhom/2', 'nhom-static-375'],
  ]
  for (const [path, shot] of pages) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await stubAdminApi(page)
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }).or(page.getByRole('heading', { level: 2 })).first()).toBeVisible()
      await expect(page.getByRole('progressbar')).toHaveCount(0)
      await expectNoHorizontalScroll(page)
      await shoot(page, shot)
    })
  }
})
