import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined'
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import SyncOutlined from '@mui/icons-material/SyncOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuditEntryDto, DashboardTile } from '../../api/generated-client'
import AcrylicCard from '../../ui/AcrylicCard'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import SectionLabel from '../../ui/SectionLabel'
import StatCard from '../../ui/StatCard'
import { dashboardClient } from './clients'
import { formatDateTime } from './common'
import { actionLabel } from './auditLabels'

interface QuickAction {
  to: string
  title: string
  text: string
  icon: ReactNode
}

const QUICK_ACTIONS: QuickAction[] = [
  { to: '/quan-tri/phan-quyen', title: 'Phân quyền', text: 'Gán quyền biên tập viên và quản trị viên', icon: <AdminPanelSettingsOutlined color="primary" /> },
  { to: '/quan-tri/xem-thu', title: 'Xem thử', text: 'Xem hệ thống với tư cách một cán bộ (chỉ đọc)', icon: <VisibilityOutlined color="primary" /> },
  { to: '/quan-ly/nhom', title: 'Nhóm', text: 'Nhóm người nhận thông báo và quy tắc nhóm', icon: <GroupsOutlined color="primary" /> },
  { to: '/quan-tri/nhat-ky', title: 'Nhật ký', text: 'Tra cứu nhật ký thao tác của quản trị', icon: <FactCheckOutlined color="primary" /> },
  { to: '/quan-tri/dong-bo', title: 'Đồng bộ', text: 'Lịch sử đồng bộ HRM và các vấn đề cần xử lý', icon: <SyncOutlined color="primary" /> },
  { to: '/quan-tri/du-lieu', title: 'Dữ liệu', text: 'Nhập dữ liệu giảng dạy, đề tài và bài báo từ Excel', icon: <TableChartOutlined color="primary" /> },
]

function tileValue(t: DashboardTile): string {
  const n = new Intl.NumberFormat('vi-VN').format(t.value ?? 0)
  return t.unit ? `${n}${t.unit === '%' ? '' : ' '}${t.unit}` : n
}

function ActivityRow({ entry }: { entry: AuditEntryDto }) {
  const who = entry.actorName ?? entry.actorCode ?? 'Hệ thống'
  return (
    <ListItem divider disableGutters>
      <ListItemText
        primary={`${who} · ${actionLabel(entry.action)}`}
        secondary={[formatDateTime(entry.at), entry.targetId && `${entry.targetType ?? ''} ${entry.targetId}`.trim()]
          .filter(Boolean)
          .join(' · ')}
      />
    </ListItem>
  )
}

export function Component() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => dashboardClient.get() })
  const tiles = q.data?.tiles ?? []
  const recent = q.data?.recentActivity ?? []

  return (
    <>
      <PageHeader title="Quản trị" eyebrow="Hệ thống" subtitle="Tổng quan và lối tắt tới các công cụ quản trị." />
      <Box sx={{ mt: 3 }}>
        <PageState error={q.error} loading={q.isPending} onRetry={() => q.refetch()} errorFallback="Không tải được số liệu quản trị.">
          <Grid container spacing={2}>
            {tiles.map((t, i) => (
              <Grid key={t.key} size={{ xs: 12, sm: 6, lg: 4 }}>
                <StatCard
                  index={i + 1}
                  icon={<AdminPanelSettingsOutlined color={t.severity === 'danger' ? 'error' : 'primary'} />}
                  label={t.label ?? ''}
                  value={tileValue(t)}
                  hint={t.hint}
                  emphasis={t.severity === 'warning' || t.severity === 'danger'}
                />
              </Grid>
            ))}
          </Grid>
        </PageState>
      </Box>

      <SectionLabel sx={{ mt: 4, mb: 1.5 }}>Công cụ</SectionLabel>
      <Grid container spacing={2}>
        {QUICK_ACTIONS.map((a, i) => (
          <Grid key={a.to} size={{ xs: 12, sm: 6, lg: 4 }}>
            <AcrylicCard
              index={i + 8}
              onClick={() => navigate(a.to)}
              role="link"
              aria-label={a.title}
              sx={{ p: 2.5, height: '100%', display: 'flex', gap: 2, alignItems: 'center' }}
            >
              <Box sx={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '50%', bgcolor: (t) => alpha(t.palette.primary.main, 0.1) }}>
                {a.icon}
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{a.title}</Typography>
                <Typography variant="body2" color="text.secondary">{a.text}</Typography>
              </Box>
            </AcrylicCard>
          </Grid>
        ))}
      </Grid>

      <SectionLabel sx={{ mt: 4, mb: 1 }}>Hoạt động gần đây</SectionLabel>
      <AcrylicCard sx={{ p: 2.5 }}>
        {recent.length === 0 && !q.isPending ? (
          <Typography color="text.secondary">Chưa có hoạt động nào.</Typography>
        ) : (
          <List disablePadding>
            {recent.map((e) => (
              <ActivityRow key={e.id} entry={e} />
            ))}
          </List>
        )}
      </AcrylicCard>
    </>
  )
}
