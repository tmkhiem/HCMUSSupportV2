import Button from '@mui/material/Button'

/** "Tải thêm" button for keyset-paged admin lists. */
export default function LoadMore({ visible, loading, onClick }: { visible: boolean; loading: boolean; onClick: () => void }) {
  if (!visible) return null
  return (
    <Button onClick={onClick} disabled={loading} sx={{ alignSelf: 'center' }}>
      {loading ? 'Đang tải…' : 'Tải thêm'}
    </Button>
  )
}
