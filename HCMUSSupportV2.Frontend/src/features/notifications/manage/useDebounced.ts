import { useEffect, useState } from 'react'

/** `value`, but only after it has stayed the same for `ms` milliseconds (search boxes that call the server). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
