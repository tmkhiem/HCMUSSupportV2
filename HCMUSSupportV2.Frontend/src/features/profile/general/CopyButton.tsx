import CheckOutlined from '@mui/icons-material/CheckOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useEffect, useRef, useState } from 'react'

/** Copies `text` to the clipboard and says so for a moment ("Đã sao chép"). Renders nothing for a missing value. */
export default function CopyButton({ text, label }: { text: string | null | undefined; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!text) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (insecure context or denied): leave the button as is.
    }
  }

  const title = copied ? 'Đã sao chép' : `Sao chép ${label}`
  return (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={`Sao chép ${label}`} onClick={copy}>
        {copied ? <CheckOutlined fontSize="small" color="success" /> : <ContentCopyOutlined fontSize="small" />}
      </IconButton>
    </Tooltip>
  )
}
