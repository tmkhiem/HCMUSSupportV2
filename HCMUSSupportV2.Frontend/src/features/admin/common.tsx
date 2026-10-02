import Button from '@mui/material/Button'
import { useEffect, useState } from 'react'

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })

/** `dd/MM/yyyy HH:mm` in Vietnam time, or `—`. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d)
}

export function LoadMore({ visible, loading, onClick }: { visible: boolean; loading: boolean; onClick: () => void }) {
  if (!visible) return null
  return (
    <Button onClick={onClick} disabled={loading} sx={{ alignSelf: 'center' }}>
      {loading ? 'Đang tải…' : 'Tải thêm'}
    </Button>
  )
}
