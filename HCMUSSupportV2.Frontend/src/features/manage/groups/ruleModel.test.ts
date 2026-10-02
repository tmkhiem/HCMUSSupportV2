import { describe, expect, it } from 'vitest'
import { emptyModel, fromRule, modelComplete, newCondition, ruleErrors, toRule } from './ruleModel'

describe('ruleModel', () => {
  it('round-trips the example rule from GROUP-RULES.md', () => {
    const rule = {
      all: [
        { field: 'org_unit', id: 12, includeDescendants: true },
        { field: 'academic_rank', op: 'in', value: ['GS', 'PGS'] },
        { field: 'has_email', value: true },
      ],
    }
    const model = fromRule(rule)
    expect(model).not.toBeNull()
    expect(model!.combinator).toBe('all')
    expect(model!.conditions).toHaveLength(3)
    expect(toRule(model!)).toEqual(rule)
  })

  it('refuses nested combinators and unknown fields instead of flattening them', () => {
    expect(fromRule({ all: [{ any: [{ field: 'has_email', value: true }] }] })).toBeNull()
    expect(fromRule({ all: [{ field: 'salary_grade', value: 1 }] })).toBeNull()
    expect(fromRule({ all: [], any: [] })).toBeNull()
    expect(fromRule(null)).toBeNull()
  })

  it('knows when a rule is complete', () => {
    const m = emptyModel()
    expect(modelComplete(m)).toBe(false) // org_unit without an id
    m.conditions[0].id = 7
    expect(modelComplete(m)).toBe(true)
    m.conditions.push(newCondition('academic_rank'))
    expect(modelComplete(m)).toBe(false)
    m.conditions[1].values = ['GS']
    expect(modelComplete(m)).toBe(true)
    m.conditions.push({ ...newCondition('position_title'), text: '   ' })
    expect(modelComplete(m)).toBe(false)
  })

  it('trims position_title and writes any/all', () => {
    const rule = toRule({ combinator: 'any', conditions: [{ ...newCondition('position_title'), op: 'eq', text: ' Trưởng khoa ' }] })
    expect(rule).toEqual({ any: [{ field: 'position_title', op: 'eq', value: 'Trưởng khoa' }] })
  })

  it('maps server error paths to condition indexes', () => {
    const { byIndex, general } = ruleErrors({
      '$.all[1].value': ["'value' phải là một mảng chuỗi."],
      '$.all[0].id': ['Không tìm thấy đơn vị.'],
      '$': ['Quy tắc không hợp lệ.'],
    })
    expect(byIndex[1]).toEqual(["'value' phải là một mảng chuỗi."])
    expect(byIndex[0]).toEqual(['Không tìm thấy đơn vị.'])
    expect(general).toEqual(['Quy tắc không hợp lệ.'])
  })

  it('round-trips every condition kind, in any and all', () => {
    const rule = {
      any: [
        { field: 'org_unit', id: 3, includeDescendants: false },
        { field: 'position_title', op: 'eq', value: 'Trưởng khoa' },
        { field: 'position_title', op: 'contains', value: 'phó' },
        { field: 'academic_rank', op: 'in', value: ['GS'] },
        { field: 'degree', op: 'in', value: ['Tiến sĩ', 'Thạc sĩ'] },
        { field: 'status', op: 'in', value: ['active', 'retired'] },
        { field: 'has_email', value: false },
      ],
    }
    const model = fromRule(rule)!
    expect(model.combinator).toBe('any')
    expect(model.conditions.map((c) => c.field)).toEqual(['org_unit', 'position_title', 'position_title', 'academic_rank', 'degree', 'status', 'has_email'])
    expect(modelComplete(model)).toBe(true)
    expect(toRule(model)).toEqual(rule)
  })

  it('never sends the client-only unit name', () => {
    const c = { ...newCondition('org_unit'), id: 9, unitName: 'Khoa Toán' }
    expect(toRule({ combinator: 'all', conditions: [c] })).toEqual({ all: [{ field: 'org_unit', id: 9, includeDescendants: false }] })
  })

  it('refuses malformed leaves', () => {
    expect(fromRule({ all: [{ field: 'degree', op: 'in', value: 'Tiến sĩ' }] })).toBeNull()
    expect(fromRule({ all: [{ field: 'position_title', value: 5 }] })).toBeNull()
    expect(fromRule({ all: 'x' })).toBeNull()
    expect(fromRule({ all: [3] })).toBeNull()
  })

  it('limits a rule to 50 conditions and needs at least one', () => {
    const many = { combinator: 'all' as const, conditions: Array.from({ length: 51 }, () => ({ ...newCondition('has_email') })) }
    expect(modelComplete(many)).toBe(false)
    expect(modelComplete({ combinator: 'all', conditions: [] })).toBe(false)
  })

  it('a new status condition starts with active only, a new org_unit without a unit', () => {
    expect(newCondition('status').values).toEqual(['active'])
    expect(newCondition('org_unit').id).toBeNull()
  })
})
