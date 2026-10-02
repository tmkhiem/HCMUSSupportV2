import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useId } from 'react'
import { useCurrentUser } from '../../auth/authContext'
import { formatDate, orDash } from '../../lib/format'
import SectionLabel from '../../ui/SectionLabel'
import type { ResearchProject } from './researchApi'
import { fundingLabel, isChair, roleLabel, sortMembers } from './researchFormat'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ mb: 0.25 }}>{label}</SectionLabel>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

/**
 * Detail of one đề tài: facts and the member list (chủ nhiệm first). Members are named, not linked: the app has no
 * page for another employee's profile.
 */
export default function ProjectDialog({ project, onClose }: { project: ResearchProject | null; onClose: () => void }) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const titleId = useId()
  const me = useCurrentUser()
  return (
    <Dialog open={project !== null} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      {project && (
        <>
          <DialogTitle id={titleId} component="h2" sx={{ pr: 7, overflowWrap: 'anywhere' }}>
            {project.title}
            <IconButton aria-label="Đóng" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Chip
              size="small"
              color={isChair(project.myRole) ? 'primary' : 'default'}
              label={`Bạn: ${roleLabel(project.myRole)}`}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <Field label="Mã đề tài" value={orDash(project.code)} />
              <Field label="Cấp quản lý" value={orDash(project.level)} />
              <Field label="Loại hình" value={orDash(project.researchType)} />
              <Field label="Kinh phí" value={fundingLabel(project.funding)} />
              <Field label="Thời gian thực hiện" value={orDash(project.periodText)} />
              <Field label="Ngày nghiệm thu" value={formatDate(project.acceptedOn)} />
              <Field label="Kết quả" value={orDash(project.result)} />
            </Box>
            <SectionLabel sx={{ mt: 3 }}>{`Thành viên (${project.members.length})`}</SectionLabel>
            <List dense disablePadding data-testid="project-members">
              {sortMembers(project.members).map((m) => (
                <ListItem key={m.employeeCode} disableGutters>
                  <ListItemText
                    primary={
                      <>
                        {m.fullName ?? m.employeeCode}
                        {m.employeeCode === me.code && (
                          <Chip size="small" variant="outlined" label="Bạn" sx={{ ml: 1 }} />
                        )}
                      </>
                    }
                    secondary={`${m.employeeCode} · ${roleLabel(m.role)}`}
                  />
                </ListItem>
              ))}
            </List>
          </DialogContent>
        </>
      )}
    </Dialog>
  )
}
