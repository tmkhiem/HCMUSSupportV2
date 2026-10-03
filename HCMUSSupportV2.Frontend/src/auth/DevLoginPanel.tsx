import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '../api/clients'
import { DevLoginRequest } from '../api/generated-client'
import { errorMessage } from '../ui/errorMessage'
import SectionLabel from '../ui/SectionLabel'
import { refreshSession } from './session'

/**
 * Development only (`LoginPage` imports this behind `import.meta.env.DEV`, so it is not in production builds).
 * `POST /api/auth/dev-login`, then refetch `me` (also refreshes the XSRF cookie); `LoginPage` then redirects.
 */
export default function DevLoginPanel() {
  const qc = useQueryClient()
  const [code, setCode] = useState('T0001')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authClient.devLogin(new DevLoginRequest({ employeeCode: code.trim() }))
      await refreshSession(qc)
    } catch (err) {
      setError(errorMessage(err, 'Đăng nhập thử không thành công.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack
      component="form"
      onSubmit={submit}
      data-testid="dev-login"
      spacing={1}
      sx={{ width: '100%', mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}
    >
      <SectionLabel sx={{ fontSize: 13, opacity: 0.6 }}>Đăng nhập thử (dev)</SectionLabel>
      {error && (
        <Alert severity="error" sx={{ py: 0 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          label="MSCB"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'MSCB đăng nhập thử' } }}
          sx={{ flex: 1 }}
        />
        <Button type="submit" variant="outlined" disabled={busy || !code.trim()}>
          Đăng nhập thử
        </Button>
      </Stack>
    </Stack>
  )
}
