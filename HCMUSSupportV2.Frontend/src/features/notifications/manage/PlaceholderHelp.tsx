import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { DeclaredVariable } from './manageTypes'

/**
 * Explains placeholders instead of editing them. The editor never declares them by hand: they come from the columns of the
 * uploaded recipient sheet (named by the first row) or from the template a draft was started from, and the "Chèn biến"
 * button of the toolbar lists them. Shows what can be inserted now, or how to get some.
 */
export default function PlaceholderHelp({ variables, serverErrors }: { variables: readonly DeclaredVariable[]; serverErrors?: string[] }) {
  return (
    <Stack spacing={1} data-testid="placeholder-help">
      {variables.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Chưa có placeholder. Muốn mỗi người nhận thấy một giá trị riêng (ví dụ hệ số lương mới), hãy tải lên tệp xlsx hoặc csv ở mục Người nhận trước: mỗi
          ô ở dòng đầu (trừ cột MSCB) trở thành một placeholder. Sau đó quay lại đây và chèn bằng nút “Chèn biến” trên thanh công cụ.
        </Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary">
            Đặt con trỏ vào nội dung rồi bấm “Chèn biến” để chèn một placeholder. Mỗi người nhận thấy giá trị ở dòng của mình trong tệp danh sách; thiếu giá trị thì hiện “—”.
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }} aria-label="Các placeholder có thể chèn">
            {variables.map((v) => (
              <Chip key={v.key} size="small" variant="outlined" label={v.label || v.key} title={`:var[${v.key}]`} />
            ))}
          </Stack>
        </>
      )}
      {serverErrors?.map((m) => (
        <Typography key={m} variant="body2" color="error" role="alert">
          {m}
        </Typography>
      ))}
    </Stack>
  )
}
