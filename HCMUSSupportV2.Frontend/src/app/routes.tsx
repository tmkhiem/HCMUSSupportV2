import { Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import LoginAlias from '../auth/LoginAlias'
import RequireAuth, { FullScreenLoading } from '../auth/RequireAuth'
import RequireRole from '../auth/RequireRole'
import AppLayout from './AppLayout'
import { RouteErrorPage } from './pages/RouteErrorPage'

/**
 * Every route is lazy. Pages that a later delivery builds point at `PlaceholderPage` until then: swap the
 * `lazy` import for the feature page (`() => import('../features/news/NewsPage')`, which exports `Component`)
 * and keep the `handle.title`, which feeds the document title and the mobile top bar.
 */
const placeholder = () => import('./pages/PlaceholderPage')
const page = (path: string, title: string, lazy: RouteObject['lazy'] = placeholder): RouteObject => ({
  path,
  lazy,
  handle: { title },
})

const redirect = (path: string, to: string): RouteObject => ({ path, element: <Navigate to={to} replace /> })

/** Dev-only playgrounds. `import.meta.env.DEV` is a build-time constant, so production bundles contain none of this. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/markdown',
        lazy: () => import('../features/notifications/dev/DevMarkdownPage'),
        errorElement: <RouteErrorPage />,
        handle: { title: 'Markdown spike' },
      },
    ]
  : []

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginAlias /> },
  ...devRoutes,
  {
    path: '/dang-nhap',
    lazy: () => import('../auth/LoginPage'),
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullScreenLoading />,
    handle: { title: 'Đăng nhập' },
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullScreenLoading />,
    children: [
      { index: true, element: <Navigate to="/tin-tuc" replace /> },

      // Tin tức (landing). The detail is a nested route whose Dialog opens over the list (InboxPage renders the Outlet);
      // `scrollGroup` keeps the list's scroll position when it opens (AppLayout scrolls to the top on other navigations).
      {
        path: 'tin-tuc',
        lazy: () => import('../features/notifications/inbox/InboxPage'),
        handle: { title: 'Tin tức', scrollGroup: 'tin-tuc' },
        children: [
          {
            path: ':id',
            lazy: () => import('../features/notifications/inbox/NotificationDialog'),
            handle: { title: 'Chi tiết thông báo', scrollGroup: 'tin-tuc' },
          },
        ],
      },

      // Hồ sơ cá nhân
      page('ho-so', 'Hồ sơ cá nhân', () => import('../features/profile/overview/OverviewPage')),
      page('ho-so/thong-tin-chung', 'Thông tin chung', () => import('../features/profile/general/GeneralPage')),
      page('ho-so/thong-tin-chi-tiet', 'Thông tin chi tiết', () => import('../features/profile/detailed/DetailedPage')),
      page('ho-so/luong', 'Quá trình lương', () => import('../features/profile/salary/SalaryPage')),
      page('ho-so/chuc-vu', 'Chức vụ', () => import('../features/profile/positions/PositionsPage')),
      page('ho-so/khen-thuong', 'Khen thưởng', () => import('../features/profile/commendations/CommendationsPage')),
      page('ho-so/dao-tao', 'Quá trình đào tạo', () => import('../features/profile/degrees/DegreesPage')),
      page('ho-so/boi-duong', 'Quá trình bồi dưỡng', () => import('../features/profile/training/TrainingPage')),
      page('ho-so/cong-tac', 'Đi công tác', () => import('../features/profile/trips/TripsPage')),

      page('sang-kien', 'Sáng kiến', () => import('../features/innovation/InnovationPage')),
      page('giang-day', 'Giảng dạy', () => import('../features/teaching/TeachingPage')),

      redirect('nckh', '/nckh/de-tai'),
      page('nckh/de-tai', 'Đề tài nghiên cứu', () => import('../features/research/ProjectsPage')),
      page('nckh/bai-bao', 'Bài báo khoa học', () => import('../features/research/PublicationsPage')),

      // Editor and above
      {
        path: 'quan-ly',
        element: <RequireRole role="editor" />,
        children: [
          { index: true, element: <Navigate to="/quan-ly/thong-bao" replace /> },
          page('thong-bao', 'Quản lý thông báo', () => import('../features/notifications/manage/ManageListPage')),
          page('thong-bao/:id', 'Soạn thông báo', () => import('../features/notifications/manage/NotificationEditorPage')),
          page('nhan-su', 'Nhân sự & email', () => import('../features/employees/EmployeesPage')),
          // One master-detail page for the list and the detail, so the list keeps its state while you pick a group.
          {
            path: 'nhom',
            lazy: () => import('../features/manage/groups/GroupsPage'),
            handle: { title: 'Nhóm' },
            children: [
              { index: true, element: null },
              { path: ':id', element: null },
            ],
          },
        ],
      },

      // Admin only
      {
        path: 'quan-tri',
        element: <RequireRole role="admin" />,
        children: [
          { index: true, lazy: () => import('../features/admin/AdminHomePage'), handle: { title: 'Quản trị' } },
          page('phan-quyen', 'Phân quyền', () => import('../features/admin/RolesPage')),
          page('xem-thu', 'Xem thử', () => import('../features/admin/ViewAsPage')),
          page('nhat-ky', 'Nhật ký', () => import('../features/admin/AuditPage')),
          page('dong-bo', 'Đồng bộ', () => import('../features/admin/SyncPage')),
          page('du-lieu', 'Dữ liệu', () => import('../features/admin/DatasetsPage')),
        ],
      },

      { path: '*', lazy: () => import('./pages/NotFoundPage'), handle: { title: 'Không tìm thấy trang' } },
    ],
  },
]
