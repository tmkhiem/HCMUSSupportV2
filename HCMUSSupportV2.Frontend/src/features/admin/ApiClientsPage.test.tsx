import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientCreatedDto, ApiClientDto, ApiScopeDto } from '../../api/generated-client'
import { renderWithTheme } from '../../test/render'

const api = vi.hoisted(() => ({ list: vi.fn(), scopes: vi.fn(), create: vi.fn(), revoke: vi.fn() }))
vi.mock('./clients', () => ({ apiClientsClient: api }))

import { Component as ApiClientsPage } from './ApiClientsPage'

const SECRET = 'tok_SYNTHETIC-0123456789abcdef-not-real'
const active = new ApiClientDto({ id: 2, name: 'sync-hrm', scopes: ['hrm.ingest'], createdAt: new Date('2026-09-20T02:00:00Z') })
const revoked = new ApiClientDto({ id: 1, name: 'old-client', scopes: ['legacy.import'], createdAt: new Date('2026-09-10T02:00:00Z'), revokedAt: new Date('2026-09-11T02:00:00Z') })

beforeEach(() => {
  vi.resetAllMocks()
  api.list.mockResolvedValue([active, revoked])
  api.scopes.mockResolvedValue([
    new ApiScopeDto({ scope: 'hrm.ingest', description: 'Đẩy dữ liệu HRM' }),
    new ApiScopeDto({ scope: 'legacy.import', description: 'Nhập từ hệ thống cũ' }),
  ])
})

describe('ApiClientsPage', () => {
  it('lists clients with their scopes and status, revoke only for active ones', async () => {
    renderWithTheme(<ApiClientsPage />)
    expect(await screen.findByText('sync-hrm')).toBeInTheDocument()
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
    expect(screen.getByText(/^Đã thu hồi/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Thu hồi / })).toHaveLength(1)
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument()
  })

  it('needs a name and a scope, shows the token once, and forgets it when closed', async () => {
    api.create.mockResolvedValue(new ApiClientCreatedDto({ client: active, token: SECRET }))
    renderWithTheme(<ApiClientsPage />)
    await screen.findByText('sync-hrm')

    fireEvent.click(screen.getByRole('button', { name: 'Tạo API client' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tạo API client' })
    const submit = within(dialog).getByRole('button', { name: 'Tạo' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/^Tên/), { target: { value: '  sync-hrm  ' } })
    expect(submit).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /hrm\.ingest/ }))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    const tokenDialog = await screen.findByRole('dialog', { name: /Token của/ })
    expect(api.create.mock.calls[0][0]).toMatchObject({ name: 'sync-hrm', scopes: ['hrm.ingest'] })
    expect(within(tokenDialog).getByTestId('api-token')).toHaveValue(SECRET)
    expect(within(tokenDialog).getByText(/chỉ hiển thị một lần/)).toBeInTheDocument()
    expect(within(tokenDialog).getByRole('button', { name: 'Sao chép token' })).toBeInTheDocument()

    fireEvent.click(within(tokenDialog).getByRole('button', { name: 'Tôi đã lưu token' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.innerHTML).not.toContain(SECRET)
  })

  it('revokes after confirmation', async () => {
    api.revoke.mockResolvedValue(revoked)
    renderWithTheme(<ApiClientsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi sync-hrm' }))
    const dialog = await screen.findByRole('dialog', { name: /Thu hồi/ })
    expect(api.revoke).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thu hồi' }))
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith(2))
  })
})
