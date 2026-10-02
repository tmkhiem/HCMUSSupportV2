import { useState } from 'react'
import { ApiError } from '../../../api/http'
import { revealSensitive } from '../api'
import type { MaskedField, SensitiveField } from '../api'

/** `•••• 1234` -> `1234` (MaskedValue draws the dots itself). */
export function maskTail(field: MaskedField): string | null {
  if (!field.hasValue || !field.masked) return null
  const tail = field.masked.replace(/^[•\s*]+/, '').trim()
  return tail === '' ? null : tail
}

/** Shown when the server refuses a reveal because an admin is viewing as someone else (HTTP 403). */
export const VIEW_AS_REVEAL_MESSAGE = 'Không thể xem khi đang xem thử'

export function revealErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return VIEW_AS_REVEAL_MESSAGE
    if (error.status === 404) return 'Chưa có dữ liệu cho trường này.'
    if (error.message) return error.message
  }
  return 'Không xem được giá trị. Vui lòng thử lại.'
}

/**
 * Per-field reveal state: values are fetched one at a time (each fetch is audited by the server), kept in memory
 * only, and can be hidden again. Nothing is cached in the query client or storage.
 */
export function useReveal() {
  const [values, setValues] = useState<Partial<Record<SensitiveField, string>>>({})
  const [loading, setLoading] = useState<SensitiveField | null>(null)
  const [error, setError] = useState<{ field: SensitiveField; message: string } | null>(null)

  const reveal = async (field: SensitiveField) => {
    setError(null)
    setLoading(field)
    try {
      const value = await revealSensitive(field)
      setValues((v) => ({ ...v, [field]: value }))
    } catch (e) {
      setError({ field, message: revealErrorMessage(e) })
    } finally {
      setLoading(null)
    }
  }

  const hide = (field: SensitiveField) =>
    setValues((v) => {
      const next = { ...v }
      delete next[field]
      return next
    })

  return { values, loading, error, reveal, hide, clearError: () => setError(null) }
}
