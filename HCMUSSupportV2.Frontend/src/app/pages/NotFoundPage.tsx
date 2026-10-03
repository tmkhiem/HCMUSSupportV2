import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router-dom'
import AcrylicCard from '../../ui/AcrylicCard'

export function Component() {
  return (
    <AcrylicCard index={0} sx={{ p: 5, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: 6 }}>
      <SearchOffOutlined color="disabled" sx={{ fontSize: 56, mb: 2 }} />
      <Typography variant="h6" component="h1" sx={{ mb: 1 }}>
        Không tìm thấy trang
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Đường dẫn không tồn tại hoặc đã được di chuyển.
      </Typography>
      <Button component={Link} to="/news" variant="contained">
        Về trang Tin tức
      </Button>
    </AcrylicCard>
  )
}
