import { useEffect, useState } from 'react'

/** The value after it has stopped changing for `ms`. Pass primitives (or strings from `JSON.stringify`), not fresh objects. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
