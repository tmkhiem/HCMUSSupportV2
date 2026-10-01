import type { Me } from './types'

/**
 * Synthetic signed-in user for viewing the shell without a backend. Only reachable from `useMe` when
 * `import.meta.env.DEV && VITE_MOCK_AUTH === '1'`, so it never ships in a production build.
 */
export function createMockMe(search = ''): Me {
  const viewAs = new URLSearchParams(search).has('mock-view-as')
  return {
    code: 'T0001',
    fullName: 'Nguyễn Thử Nghiệm',
    unit: 'Khoa Công nghệ thông tin',
    photoUrl: null,
    emails: ['t0001@example.test'],
    roles: ['employee', 'editor', 'admin'],
    actingAs: viewAs ? { code: 'T0002', fullName: 'Trần Mẫu Thử' } : null,
  }
}
