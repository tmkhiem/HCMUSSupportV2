import { describe, expect, it } from 'vitest'
import { deriveKey, deriveLabel, isValidVarKey, stripWrapper, transliterate } from '../src/keys.ts'
import { guessVarType } from '../src/varTypes.ts'

describe('transliterate', () => {
  it('removes Vietnamese diacritics and maps đ', () => {
    expect(transliterate('Hệ số lương')).toBe('He so luong')
    expect(transliterate('Đơn vị công tác')).toBe('Don vi cong tac')
    expect(transliterate('đồng')).toBe('dong')
  })

  it('handles decomposed input', () => {
    expect(transliterate('Ngày'.normalize('NFD'))).toBe('Ngay')
  })
})

describe('deriveKey', () => {
  it('builds PascalCase keys from Vietnamese column names', () => {
    const taken = new Set<string>()
    expect(deriveKey('{Hệ số lương}', taken)).toBe('HeSoLuong')
    expect(deriveKey('{Đơn vị}', taken)).toBe('DonVi')
    expect(deriveKey('{Họ và tên}', taken)).toBe('HoVaTen')
  })

  it('keeps single tokens as they are', () => {
    const taken = new Set<string>()
    expect(deriveKey('{mscb}', taken)).toBe('mscb')
    expect(deriveKey('{C}', taken)).toBe('C')
    expect(deriveKey('{MA}', taken)).toBe('MA')
  })

  it('prefixes names that do not start with a letter', () => {
    const taken = new Set<string>()
    expect(deriveKey('{0}', taken)).toBe('Cot0')
    expect(deriveKey('(7)', taken)).toBe('Cot7')
    expect(deriveKey('{9x}', taken)).toBe('Cot9x')
    expect(deriveKey('{%}', taken)).toBe('Cot')
  })

  it('drops bad characters', () => {
    const taken = new Set<string>()
    expect(deriveKey('{tỷ lệ (%)}', taken)).toBe('TyLe')
    expect(deriveKey('{a_b-c.d}', taken)).toBe('ABCD')
  })

  it('dedupes, ignoring case', () => {
    const taken = new Set<string>()
    expect(deriveKey('{Họ tên}', taken)).toBe('HoTen')
    expect(deriveKey('{Ho ten}', taken)).toBe('HoTen_2')
    expect(deriveKey('{HO TEN}', taken)).toBe('HOTEN_3')
    expect(deriveKey('{hoten}', taken)).toBe('hoten_4')
  })

  it('cuts to 64 characters and still dedupes', () => {
    const taken = new Set<string>()
    const long = '{' + 'a'.repeat(80) + '}'
    const first = deriveKey(long, taken)
    const second = deriveKey(long, taken)
    expect(first).toHaveLength(64)
    expect(second).toHaveLength(64)
    expect(second.endsWith('_2')).toBe(true)
    expect(isValidVarKey(first) && isValidVarKey(second)).toBe(true)
  })

  it('always returns a key the server accepts', () => {
    const taken = new Set<string>()
    for (const name of ['{}', '{ }', '{😀}', '{--}', '{1}', '(12)', '{Số 1}', '{ä ö}', '{__}']) {
      expect(isValidVarKey(deriveKey(name, taken))).toBe(true)
    }
  })
})

describe('labels', () => {
  it('strips one wrapper', () => {
    expect(stripWrapper('{Col}')).toBe('Col')
    expect(stripWrapper('(7)')).toBe('7')
    expect(stripWrapper(' [x] ')).toBe('x')
    expect(stripWrapper('plain')).toBe('plain')
  })

  it('keeps readable names and describes index-like ones', () => {
    expect(deriveLabel('{Hệ số lương}')).toBe('Hệ số lương')
    expect(deriveLabel('{7}')).toBe('Cột 7')
    expect(deriveLabel('(12)')).toBe('Cột 12')
    expect(deriveLabel('{C}')).toBe('Cột C')
    expect(deriveLabel('{9x}')).toBe('Cột 9x')
  })
})

describe('guessVarType', () => {
  it('detects dd/MM/yyyy dates', () => {
    expect(guessVarType(['01/02/2025', '31/12/2024', ''])).toBe('date')
    expect(guessVarType(['1/2/2025'])).toBe('date')
  })

  it('does not take month/year or ranges for dates', () => {
    expect(guessVarType(['03/2025', '12/2024'])).toBe('text')
    expect(guessVarType(['01/2020-12/2024'])).toBe('text')
  })

  it('detects small integers and decimals as numbers', () => {
    expect(guessVarType(['3', '12', '7'])).toBe('number')
    expect(guessVarType(['4.98', '3,99', '2'])).toBe('number')
  })

  it('keeps identifiers as text', () => {
    expect(guessVarType(['0123', '4567'])).toBe('text')
    expect(guessVarType(['1234567890'])).toBe('text')
  })

  it('detects money by thousands separators or by a money-like label', () => {
    expect(guessVarType(['1.234.567', '12.000.000'])).toBe('money')
    expect(guessVarType(['55', '12'], 'Số tiền')).toBe('money')
  })

  it('tolerates a few odd values and falls back to text when empty', () => {
    expect(guessVarType([...Array(19).fill('01/02/2025'), '(1)'])).toBe('date')
    expect(guessVarType(['a', 'b', '3'])).toBe('text')
    expect(guessVarType([])).toBe('text')
    expect(guessVarType(['', '  '])).toBe('text')
  })
})
