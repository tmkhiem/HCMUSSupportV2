import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { SectionLabel } from '../../../ui'
import LazyNotificationMarkdownEditor from '../editor/LazyNotificationMarkdownEditor'
import MarkdownPreviewPane from '../editor/MarkdownPreviewPane'

/**
 * Dev-only playground (`/dev/markdown`, registered only when `import.meta.env.DEV`): the editor next to its preview,
 * the emitted Markdown, and a box to load arbitrary Markdown. Playwright drives it (e2e/markdown.spec.ts).
 */

const VARIABLES = [
  { key: 'HeSoLuong', label: 'Hệ số lương' },
  { key: 'NgayHieuLuc', label: 'Ngày hiệu lực' },
  { key: 'MucLuong', label: 'Mức lương' },
  { key: 'Ten_Day_Du', label: 'Họ và tên' },
]

const ROWS = [
  { HeSoLuong: '3,66', NgayHieuLuc: '01/07/2026', MucLuong: '8.500.000 đ', Ten_Day_Du: 'Nguyễn Thử Nghiệm' },
  { HeSoLuong: '3,99', NgayHieuLuc: '01/01/2027', MucLuong: '9.200.000 đ', Ten_Day_Du: 'Nguyễn Thử Nghiệm' },
]

const SAMPLE = `# Thông báo nâng lương

Kính gửi :var[Ten_Day_Du],

Hệ số lương mới của bạn là **:var[HeSoLuong]**, hiệu lực từ :var[NgayHieuLuc]. Họp lúc 10:30.

| Hạng mục | Giá trị |
| --- | --- |
| Hệ số | :var[HeSoLuong] |
| Mức lương | :var[MucLuong] |

> Liên hệ phòng Tổ chức nếu có thắc mắc.
`

export function Component() {
  const [markdown, setMarkdown] = useState(SAMPLE)
  const [loadText, setLoadText] = useState('')
  const [twoRows, setTwoRows] = useState(false)
  const [lastMeta, setLastMeta] = useState('')

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1600, mx: 'auto' }}>
      <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
        Markdown spike (dev)
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        MDXEditor + :var[Key] chips + NotificationBody preview. Not part of the product; absent from production builds.
      </Typography>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, alignItems: 'start' }}>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <LazyNotificationMarkdownEditor
            value={markdown}
            variables={VARIABLES}
            onChange={(md, meta) => {
              setMarkdown(md)
              setLastMeta(meta.initialNormalize ? 'initialNormalize' : 'edit')
            }}
            onUploadImage={async () => `/api/files/${crypto.randomUUID()}`}
            minHeight={360}
          />
        </Box>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <FormControlLabel
            control={<Switch checked={twoRows} onChange={(e) => setTwoRows(e.target.checked)} />}
            label="Hai dòng dữ liệu (xem trước từng khối)"
          />
          <MarkdownPreviewPane
            markdown={markdown}
            vars={twoRows ? ROWS : [ROWS[0]]}
            recipientLabel="Nguyễn Thử Nghiệm · T0001"
          />
        </Box>
      </Box>

      <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <div>
          <SectionLabel>Markdown phát ra ({lastMeta || '—'})</SectionLabel>
          <pre
            data-testid="md-out"
            style={{ margin: '8px 0 0', padding: 12, background: 'rgba(38,50,56,.06)', whiteSpace: 'pre-wrap', fontSize: 13 }}
          >
            {markdown}
          </pre>
        </div>
        <div>
          <SectionLabel>Nạp Markdown</SectionLabel>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={loadText}
            onChange={(e) => setLoadText(e.target.value)}
            slotProps={{ htmlInput: { 'data-testid': 'md-in' } }}
            sx={{ mt: 1 }}
          />
          <Button sx={{ mt: 1 }} variant="outlined" onClick={() => setMarkdown(loadText)} data-testid="md-load">
            Nạp vào trình soạn thảo
          </Button>
        </div>
      </Box>
    </Box>
  )
}
