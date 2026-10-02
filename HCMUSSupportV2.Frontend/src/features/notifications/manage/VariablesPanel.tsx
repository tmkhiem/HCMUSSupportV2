import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AcrylicCard, SectionLabel } from '../../../ui'
import { VARIABLE_TYPES, nextVariableKey, variableKeyError } from './draft'
import { VARIABLE_TYPE_LABEL } from './manageTypes'
import type { DeclaredVariable, VariableType } from './manageTypes'

export interface VariablesPanelProps {
  variables: DeclaredVariable[]
  onChange: (next: DeclaredVariable[]) => void
  /** Server messages for the whole list (`errors.variables`). */
  serverErrors?: string[]
  disabled?: boolean
}

/**
 * The placeholders the body may use as `:var[Khóa]`: a key (letters, digits, `_`), the label shown in the "Chèn biến"
 * menu and the sheet header, and a type. Uploading a recipient sheet adds the columns it brings.
 */
export default function VariablesPanel({ variables, onChange, serverErrors, disabled }: VariablesPanelProps) {
  const update = (index: number, patch: Partial<DeclaredVariable>) => onChange(variables.map((v, i) => (i === index ? { ...v, ...patch } : v)))

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="variables-panel">
      <SectionLabel>Biến trong nội dung</SectionLabel>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
        Dùng “Chèn biến” trên thanh công cụ để đặt biến vào nội dung. Mỗi người nhận thấy giá trị riêng của mình.
      </Typography>
      <Stack spacing={1.5}>
        {variables.map((v, i) => {
          const keyError = variableKeyError(v.key, variables.filter((_, j) => j !== i).map((o) => o.key))
          return (
            <Box key={i} data-testid="variable-row" sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: '1.1fr 1.4fr 0.9fr auto' }, alignItems: 'start' }}>
              <TextField
                size="small"
                label="Khóa"
                value={v.key}
                disabled={disabled}
                error={keyError !== null}
                helperText={keyError ?? ' '}
                onChange={(e) => update(i, { key: e.target.value })}
                slotProps={{ htmlInput: { 'aria-label': `Khóa biến ${i + 1}`, spellCheck: false, style: { fontFamily: 'ui-monospace, Consolas, monospace' } } }}
              />
              <TextField
                size="small"
                label="Nhãn hiển thị"
                value={v.label}
                disabled={disabled}
                onChange={(e) => update(i, { label: e.target.value })}
                helperText=" "
                slotProps={{ htmlInput: { 'aria-label': `Nhãn biến ${i + 1}` } }}
              />
              <TextField select size="small" label="Kiểu" value={v.type} disabled={disabled} onChange={(e) => update(i, { type: e.target.value as VariableType })} helperText=" ">
                {VARIABLE_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {VARIABLE_TYPE_LABEL[t]}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton aria-label={`Xóa biến ${v.key || i + 1}`} disabled={disabled} onClick={() => onChange(variables.filter((_, j) => j !== i))} sx={{ mt: 0.25 }}>
                <DeleteOutlineIcon />
              </IconButton>
            </Box>
          )
        })}
      </Stack>
      {serverErrors?.map((m) => (
        <Typography key={m} variant="body2" color="error" role="alert">
          {m}
        </Typography>
      ))}
      <Button
        startIcon={<AddIcon />}
        disabled={disabled}
        onClick={() => onChange([...variables, { key: nextVariableKey(variables), label: '', type: 'text' }])}
        sx={{ mt: 1 }}
      >
        Thêm biến
      </Button>
    </AcrylicCard>
  )
}
