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

export const routes: RouteObject[] = [
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

      // Tin tức (landing)
      page('tin-tuc', 'Tin tức'),
      page('tin-tuc/:id', 'Chi tiết thông báo'),

      // Hồ sơ cá nhân
      page('ho-so', 'Hồ sơ cá nhân'),
      page('ho-so/thong-tin-chung', 'Thông tin chung'),
      page('ho-so/thong-tin-chi-tiet', 'Thông tin chi tiết'),
      page('ho-so/luong', 'Quá trình lương'),
      page('ho-so/chuc-vu', 'Chức vụ'),
      page('ho-so/khen-thuong', 'Khen thưởng'),
      page('ho-so/dao-tao', 'Quá trình đào tạo'),
      page('ho-so/boi-duong', 'Quá trình bồi dưỡng'),
      page('ho-so/cong-tac', 'Đi công tác'),

      page('sang-kien', 'Sáng kiến'),
      page('giang-day', 'Giảng dạy'),

      redirect('nckh', '/nckh/de-tai'),
      page('nckh/de-tai', 'Đề tài nghiên cứu'),
      page('nckh/bai-bao', 'Bài báo khoa học'),

      // Editor and above
      {
        path: 'quan-ly',
        element: <RequireRole role="editor" />,
        children: [
          { index: true, element: <Navigate to="/quan-ly/thong-bao" replace /> },
          page('thong-bao', 'Quản lý thông báo'),
          page('thong-bao/:id', 'Soạn thông báo'),
          page('nhan-su', 'Nhân sự & email'),
          page('nhom', 'Nhóm'),
          page('nhom/:id', 'Chi tiết nhóm'),
        ],
      },

      // Admin only
      {
        path: 'quan-tri',
        element: <RequireRole role="admin" />,
        children: [
          { index: true, lazy: placeholder, handle: { title: 'Quản trị' } },
          page('phan-quyen', 'Phân quyền'),
          page('xem-thu', 'Xem thử'),
          page('nhat-ky', 'Nhật ký'),
          page('dong-bo', 'Đồng bộ'),
          page('du-lieu', 'Dữ liệu'),
        ],
      },

      { path: '*', lazy: () => import('./pages/NotFoundPage'), handle: { title: 'Không tìm thấy trang' } },
    ],
  },
]
