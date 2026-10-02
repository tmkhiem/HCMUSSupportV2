import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import AcrylicCard from '../../ui/AcrylicCard'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import ProjectDialog from './ProjectDialog'
import ResearchSwitcher from './ResearchSwitcher'
import { useResearchProjects } from './researchApi'
import type { ResearchProject } from './researchApi'
import { isChair, projectMeta, roleLabel } from './researchFormat'

function ProjectRow({ project, index, onOpen }: { project: ResearchProject; index: number; onOpen: () => void }) {
  return (
    <AcrylicCard index={index} onClick={onOpen} aria-label={project.title} sx={{ p: 2, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{project.title}</Typography>
      <Stack direction="row" sx={{ mt: 1, gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          size="small"
          color={isChair(project.myRole) ? 'primary' : 'default'}
          variant={isChair(project.myRole) ? 'filled' : 'outlined'}
          label={roleLabel(project.myRole)}
        />
        {project.level && <Chip size="small" variant="outlined" label={project.level} />}
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {projectMeta(project)}
        </Typography>
      </Stack>
    </AcrylicCard>
  )
}

export function Component() {
  const { data, error, isPending, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useResearchProjects()
  const [selected, setSelected] = useState<ResearchProject | null>(null)
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <ResearchSwitcher active="de-tai" />
      <Box sx={{ mt: 3 }}>
        <PageHeader
          index={1}
          title="Đề tài nghiên cứu"
          subtitle="Các đề tài bạn chủ nhiệm hoặc tham gia."
        />
      </Box>
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={items.length === 0}
          errorFallback="Không tải được danh sách đề tài nghiên cứu."
          emptyMessage="Chưa có đề tài nghiên cứu nào được ghi nhận."
          onRetry={() => void refetch()}
        >
          <Stack data-testid="project-list" sx={{ gap: 1.5 }}>
            {items.map((p, i) => (
              <ProjectRow key={p.id} project={p} index={2 + Math.min(i, 8)} onOpen={() => setSelected(p)} />
            ))}
          </Stack>
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ExpandMoreOutlined />}
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                Tải thêm đề tài
              </Button>
            </Box>
          )}
        </PageState>
      </Box>
      <ProjectDialog project={selected} onClose={() => setSelected(null)} />
    </>
  )
}
