import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AcrylicCard from '../../../ui/AcrylicCard'
import { FIELD_LABELS, STATUS_OPTIONS, newCondition } from './ruleModel'
import type { Combinator, Condition, ConditionField, RuleModel } from './ruleModel'

const RANK_SUGGESTIONS = ['GS', 'PGS']
const DEGREE_SUGGESTIONS = ['Tiến sĩ', 'Thạc sĩ', 'Cử nhân', 'Kỹ sư']

export interface RuleBuilderProps {
  model: RuleModel
  onChange: (model: RuleModel) => void
  /** Server validation messages by condition index. */
  errors?: Record<number, string[]>
  disabled?: boolean
}

function ValuesField({ condition, onPatch, options, label }: { condition: Condition; onPatch: (p: Partial<Condition>) => void; options: string[]; label: string }) {
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={options}
      value={condition.values ?? []}
      onChange={(_, v) => onPatch({ values: v.map((x) => x.trim()).filter(Boolean) })}
      renderValue={(value, getItemProps) =>
        value.map((v, i) => {
          const { key, ...rest } = getItemProps({ index: i })
          return <Chip key={key} size="small" label={v} {...rest} />
        })
      }
      renderInput={(params) => <TextField {...params} label={label} placeholder="Nhập rồi nhấn Enter" />}
      sx={{ flex: 1, minWidth: 220 }}
    />
  )
}

function ConditionEditor({ condition, onPatch, disabled }: { condition: Condition; onPatch: (p: Partial<Condition>) => void; disabled?: boolean }) {
  switch (condition.field) {
    case 'org_unit':
      return (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', flex: 1 }} useFlexGap>
          <TextField
            size="small"
            type="number"
            label="Mã đơn vị"
            value={condition.id ?? ''}
            disabled={disabled}
            onChange={(e) => onPatch({ id: e.target.value === '' ? null : Number(e.target.value) })}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            sx={{ width: 140 }}
          />
          <FormControlLabel
            control={<Switch checked={Boolean(condition.includeDescendants)} disabled={disabled} onChange={(_, v) => onPatch({ includeDescendants: v })} />}
            label="Gồm đơn vị trực thuộc"
          />
        </Stack>
      )
    case 'position_title':
      return (
        <Stack direction="row" spacing={2} sx={{ flex: 1, flexWrap: 'wrap' }} useFlexGap>
          <TextField select size="small" label="Điều kiện" value={condition.op ?? 'contains'} disabled={disabled} onChange={(e) => onPatch({ op: e.target.value as 'eq' | 'contains' })} sx={{ width: 150 }}>
            <MenuItem value="contains">Chứa</MenuItem>
            <MenuItem value="eq">Bằng</MenuItem>
          </TextField>
          <TextField size="small" label="Chức danh" value={condition.text ?? ''} disabled={disabled} onChange={(e) => onPatch({ text: e.target.value })} sx={{ flex: 1, minWidth: 200 }} />
        </Stack>
      )
    case 'academic_rank':
      return <ValuesField condition={condition} onPatch={onPatch} options={RANK_SUGGESTIONS} label="Học hàm (một trong)" />
    case 'degree':
      return <ValuesField condition={condition} onPatch={onPatch} options={DEGREE_SUGGESTIONS} label="Học vị (một trong)" />
    case 'status':
      return (
        <TextField
          select
          size="small"
          label="Trạng thái (một trong)"
          value={condition.values ?? []}
          disabled={disabled}
          onChange={(e) => onPatch({ values: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
          slotProps={{ select: { multiple: true } }}
          sx={{ flex: 1, minWidth: 220 }}
        >
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      )
    case 'has_email':
      return (
        <ToggleButtonGroup exclusive size="small" value={condition.flag ? 'yes' : 'no'} disabled={disabled} onChange={(_, v) => v && onPatch({ flag: v === 'yes' })} aria-label="Có email">
          <ToggleButton value="yes">Có email</ToggleButton>
          <ToggleButton value="no">Không có email</ToggleButton>
        </ToggleButtonGroup>
      )
  }
}

/** Structured editor for one flat level of rule conditions (docs/GROUP-RULES.md). */
export default function RuleBuilder({ model, onChange, errors = {}, disabled }: RuleBuilderProps) {
  const patch = (key: string, p: Partial<Condition>) =>
    onChange({ ...model, conditions: model.conditions.map((c) => (c.key === key ? { ...c, ...p } : c)) })
  const changeField = (key: string, field: ConditionField) =>
    onChange({ ...model, conditions: model.conditions.map((c) => (c.key === key ? { ...newCondition(field), key } : c)) })

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <Typography>Thành viên là cán bộ thỏa</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={model.combinator}
          disabled={disabled}
          onChange={(_, v: Combinator | null) => v && onChange({ ...model, combinator: v })}
          aria-label="Cách kết hợp điều kiện"
        >
          <ToggleButton value="all">Tất cả điều kiện</ToggleButton>
          <ToggleButton value="any">Một trong các điều kiện</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Nếu không có điều kiện &quot;Trạng thái&quot;, chỉ cán bộ đang làm việc được tính.
      </Typography>

      {model.conditions.map((c, i) => (
        <AcrylicCard key={c.key} sx={{ p: 2 }} role="group" aria-label={`Điều kiện ${i + 1}`}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'flex-start' } }}>
            <TextField
              select
              size="small"
              label="Trường"
              value={c.field}
              disabled={disabled}
              onChange={(e) => changeField(c.key, e.target.value as ConditionField)}
              sx={{ width: { xs: '100%', md: 160 }, flexShrink: 0 }}
            >
              {(Object.keys(FIELD_LABELS) as ConditionField[]).map((f) => (
                <MenuItem key={f} value={f}>{FIELD_LABELS[f]}</MenuItem>
              ))}
            </TextField>
            <ConditionEditor condition={c} onPatch={(p) => patch(c.key, p)} disabled={disabled} />
            <IconButton aria-label={`Xóa điều kiện ${i + 1}`} disabled={disabled || model.conditions.length <= 1} onClick={() => onChange({ ...model, conditions: model.conditions.filter((x) => x.key !== c.key) })}>
              <DeleteOutlineOutlined />
            </IconButton>
          </Stack>
          {(errors[i] ?? []).map((m) => (
            <Typography key={m} variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>{m}</Typography>
          ))}
        </AcrylicCard>
      ))}

      <Box>
        <Button startIcon={<AddOutlined />} disabled={disabled || model.conditions.length >= 50} onClick={() => onChange({ ...model, conditions: [...model.conditions, newCondition('has_email')] })}>
          Thêm điều kiện
        </Button>
      </Box>
    </Stack>
  )
}
