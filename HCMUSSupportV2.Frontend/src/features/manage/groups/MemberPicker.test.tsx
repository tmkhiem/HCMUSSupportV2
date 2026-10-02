import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../../auth/authContext'
import type { AuthContextValue } from '../../../auth/authContext'
import type { Me, RoleName } from '../../../auth/types'
import { renderWithTheme } from '../../../test/render'
import MemberPicker from './MemberPicker'

const list = vi.fn()
vi.mock('../../admin/clients', () => ({ rolesClient: { list: (...a: unknown[]) => list(...a) } }))

function auth(roles: RoleName[]): AuthContextValue {
  const me: Me = { code: 'T0001', fullName: 'Thử', unit: null, photoUrl: null, emails: [], roles, actingAs: null }
  return { status: 'authenticated', me, error: null, hasRole: () => true, refetch: () => {}, logout: async () => {}, exitViewAs: async () => {} }
}

function setup(roles: RoleName[]) {
  const onAdd = vi.fn()
  renderWithTheme(
    <AuthContext value={auth(roles)}>
      <MemberPicker onAdd={onAdd} pending={false} />
    </AuthContext>,
  )
  return onAdd
}

describe('MemberPicker', () => {
  beforeEach(() => list.mockReset())

  it('editors type or paste MSCBs; no employee search is attempted', async () => {
    const onAdd = setup(['employee', 'editor'])
    const input = screen.getByRole('combobox', { name: 'Thêm thành viên' })
    await userEvent.type(input, 'T0002, T0003{Enter}')
    await userEvent.type(input, 'T0003 T0004')
    await userEvent.click(screen.getByRole('button', { name: 'Thêm 3 người' }))
    expect(onAdd).toHaveBeenCalledWith(['T0002', 'T0003', 'T0004'])
    expect(list).not.toHaveBeenCalled()
  })

  it('admins pick from the employee search', async () => {
    list.mockResolvedValue({ items: [{ code: 'T0002', fullName: 'Trần Mẫu Thử' }] })
    const onAdd = setup(['employee', 'editor', 'admin'])
    await userEvent.type(screen.getByRole('combobox', { name: 'Thêm thành viên' }), 'Trần')
    await userEvent.click(await screen.findByRole('option', { name: 'Trần Mẫu Thử · T0002' }))
    await userEvent.click(screen.getByRole('button', { name: 'Thêm 1 người' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(['T0002']))
    expect(list).toHaveBeenCalledWith('Trần', undefined, undefined, 15)
  })
})
