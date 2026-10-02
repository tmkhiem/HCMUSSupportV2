export type VarType = 'text' | 'date' | 'number' | 'money'

const DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/
const INT = /^-?[1-9]\d{0,2}$|^0$/
const DECIMAL = /^-?\d{1,6}[.,]\d{1,6}$/
const MONEY = /^-?\d{1,3}([.,]\d{3})+(\s?(đ|₫|vnd|vnđ|đồng))?$/i
const MONEY_NAME = /tiền|kinh phí|thành tiền|đồng|vnd|vnđ/i

/**
 * Guesses a variable type from its non-empty values (at least 90 % must agree).
 * Dates are dd/MM/yyyy. Numbers are plain integers (no leading zero, at most 3 digits, so identifiers such as an MSCB or
 * an insurance number stay text) or decimals. Money has thousands separators or a money-like column name.
 */
export function guessVarType(values: readonly string[], label = ''): VarType {
  const filled = values.map((v) => v.trim()).filter((v) => v.length > 0)
  if (filled.length === 0) return 'text'
  const share = (re: RegExp) => filled.filter((v) => re.test(v)).length / filled.length
  if (share(DATE) >= 0.9) return 'date'
  if (share(MONEY) >= 0.9) return 'money'
  const numeric = filled.filter((v) => INT.test(v) || DECIMAL.test(v)).length / filled.length
  if (numeric >= 0.9) return MONEY_NAME.test(label) ? 'money' : 'number'
  return 'text'
}
