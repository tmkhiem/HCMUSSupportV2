import { Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
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
  ...devRoutes,
  {
    path: '/login',
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
      { index: true, element: <Navigate to="/news" replace /> },

      // News (landing). The detail is a nested route whose Dialog opens over the list (InboxPage renders the Outlet);
      // `scrollGroup` keeps the list's scroll position when it opens (AppLayout scrolls to the top on other navigations).
      {
        path: 'news',
        lazy: () => import('../features/notifications/inbox/InboxPage'),
        handle: { title: 'Tin tức', scrollGroup: 'news' },
        children: [
          {
            path: ':id',
            lazy: () => import('../features/notifications/inbox/NotificationDialog'),
            handle: { title: 'Chi tiết thông báo', scrollGroup: 'news' },
          },
        ],
      },

      // Hồ sơ cá nhân
      page('profile', 'Hồ sơ cá nhân', () => import('../features/profile/overview/OverviewPage')),
      page('profile/general', 'Thông tin chung', () => import('../features/profile/general/GeneralPage')),
      page('profile/detailed', 'Thông tin chi tiết', () => import('../features/profile/detailed/DetailedPage')),
      page('profile/salary', 'Quá trình lương', () => import('../features/profile/salary/SalaryPage')),
      page('profile/positions', 'Chức vụ', () => import('../features/profile/positions/PositionsPage')),
      page('profile/commendations', 'Khen thưởng', () => import('../features/profile/commendations/CommendationsPage')),
      page('profile/degrees', 'Quá trình đào tạo', () => import('../features/profile/degrees/DegreesPage')),
      page('profile/training', 'Quá trình bồi dưỡng', () => import('../features/profile/training/TrainingPage')),
      page('profile/business-trips', 'Đi công tác', () => import('../features/profile/trips/TripsPage')),

      page('innovations', 'Sáng kiến', () => import('../features/innovation/InnovationPage')),
      page('teaching', 'Giảng dạy', () => import('../features/teaching/TeachingPage')),

      redirect('research', '/research/projects'),
      page('research/projects', 'Đề tài nghiên cứu', () => import('../features/research/ProjectsPage')),
      page('research/publications', 'Bài báo khoa học', () => import('../features/research/PublicationsPage')),

      // Editor and above
      {
        path: 'manage',
        element: <RequireRole role="editor" />,
        children: [
          { index: true, element: <Navigate to="/manage/notifications" replace /> },
          page('notifications', 'Quản lý thông báo', () => import('../features/notifications/manage/ManageListPage')),
          page('notifications/:id', 'Soạn thông báo', () => import('../features/notifications/manage/NotificationEditorPage')),
          page('employees', 'Nhân sự & email', () => import('../features/employees/EmployeesPage')),
          // One master-detail page for the list and the detail, so the list keeps its state while you pick a group.
          {
            path: 'groups',
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
        path: 'admin',
        element: <RequireRole role="admin" />,
        children: [
          { index: true, lazy: () => import('../features/admin/AdminHomePage'), handle: { title: 'Quản trị' } },
          page('roles', 'Phân quyền', () => import('../features/admin/RolesPage')),
          page('view-as', 'Xem thử', () => import('../features/admin/ViewAsPage')),
          page('audit', 'Nhật ký', () => import('../features/admin/AuditPage')),
          page('sync', 'Đồng bộ', () => import('../features/admin/SyncPage')),
          page('datasets', 'Dữ liệu', () => import('../features/admin/DatasetsPage')),
          page('api-clients', 'API clients', () => import('../features/admin/ApiClientsPage')),
        ],
      },

      { path: '*', lazy: () => import('./pages/NotFoundPage'), handle: { title: 'Không tìm thấy trang' } },
    ],
  },
]
