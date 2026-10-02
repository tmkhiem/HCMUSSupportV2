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
})
