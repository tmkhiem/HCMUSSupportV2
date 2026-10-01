import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { formatDate, formatDecimal, joinParts } from '../../../lib/format'
import MaskedValue from '../../../ui/MaskedValue'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import { useDetailedProfile } from '../api'
import type { MaskedField, Membership } from '../api'
import { BackToProfile, FieldList, FieldRow, SectionCard } from '../ProfileFields'
import { NO_PROFILE_MESSAGE, isNotFound } from '../profileStates'
import { maskTail, useReveal } from './useReveal'

/** "Đã tham gia · ngày 19/05/2012 · Số hồ sơ …" for a member, "Chưa tham gia" otherwise. */
function membershipText(m: Membership): string {
  if (!m.isMember) return 'Chưa tham gia'
  return joinParts([
    'Đã tham gia',
    m.joinedOn && `ngày ${formatDate(m.joinedOn)}`,
    m.fileNo && `Số hồ sơ ${m.fileNo}`,
    m.cardNo && `Số thẻ ${m.cardNo}`,
  ])
}

export function Component() {
  const q = useDetailedProfile()
  const d = q.data
  const noProfile = isNotFound(q.error)
  const reveal = useReveal()

  const masked = (label: string, f: MaskedField) => (
    <MaskedValue
      label={label}
      tail={maskTail(f)}
      revealed={reveal.values[f.field]}
      loading={reveal.loading === f.field}
      onReveal={() => void reveal.reveal(f.field)}
      onHide={() => reveal.hide(f.field)}
    />
  )

  const salary = d
    ? joinParts([
        d.salaryStep != null && `Bậc ${d.salaryStep}`,
        d.salaryCoefficient != null && `Hệ số ${formatDecimal(d.salaryCoefficient)}`,
        d.overGradePct != null && `Vượt khung ${formatDecimal(d.overGradePct, 0)}%`,
      ])
    : undefined

  return (
    <Stack spacing={3}>
      <PageHeader title="Thông tin chi tiết" eyebrow="Hồ sơ cá nhân" actions={<BackToProfile />} />
      <PageState
        error={noProfile ? undefined : q.error}
        loading={q.isPending && !q.error}
        empty={noProfile}
        emptyMessage={NO_PROFILE_MESSAGE}
        errorFallback="Không tải được thông tin chi tiết."
        onRetry={() => void q.refetch()}
      >
        {d && (
          <Stack spacing={3}>
            <SectionCard title="Công tác" index={1}>
              <FieldList>
                <FieldRow label="Đơn vị" value={d.unit} />
                <FieldRow label="Bộ môn / phòng" value={d.department} />
                <FieldRow label="Chức vụ" value={d.positionTitle} />
                <FieldRow label="Ngạch" value={joinParts([d.salaryGradeCode, d.salaryGradeName])} />
                <FieldRow label="Bậc / hệ số" value={salary} />
              </FieldList>
            </SectionCard>

            <SectionCard title="Học hàm và học vị" index={2}>
              <FieldList>
                <FieldRow label="Học hàm" value={d.academicRank} />
                <FieldRow label="Học vị" value={d.degree} />
                <FieldRow label="Chuyên ngành" value={d.major} />
                <FieldRow label="Trình độ giáo dục phổ thông" value={d.educationLevel} />
                <FieldRow label="Lý luận chính trị" value={d.politicalTheory} />
              </FieldList>
            </SectionCard>

            <SectionCard title="Đoàn thể" index={3}>
              <FieldList>
                <FieldRow label="Đảng Cộng sản Việt Nam" value={membershipText(d.party)} />
                <FieldRow label="Đoàn Thanh niên" value={membershipText(d.youthUnion)} />
                <FieldRow label="Công đoàn" value={membershipText(d.tradeUnion)} />
              </FieldList>
            </SectionCard>

            <SectionCard title="Tài chính và bảo hiểm" index={4}>
              {reveal.error && (
                <Alert severity="error" onClose={reveal.clearError} sx={{ my: 1 }}>
                  {reveal.error.message}
                </Alert>
              )}
              <FieldList>
                <FieldRow label="Số CCCD" value={masked('Số CCCD', d.nationalId)} />
                <FieldRow label="Ngày cấp" value={d.nationalIdIssuedOn ? formatDate(d.nationalIdIssuedOn) : null} />
                <FieldRow label="Nơi cấp" value={d.nationalIdIssuedBy} />
                <FieldRow label="Mã số thuế" value={masked('Mã số thuế', d.taxCode)} />
                <FieldRow label="Ngân hàng" value={joinParts([d.bankName, d.bankBranch])} />
                <FieldRow label="Số tài khoản" value={masked('Số tài khoản', d.bankAccount)} />
                <FieldRow label="Số sổ BHXH" value={masked('Số sổ BHXH', d.socialInsuranceNo)} />
                <FieldRow label="Số thẻ BHYT" value={masked('Số thẻ BHYT', d.healthInsuranceNo)} />
              </FieldList>
            </SectionCard>
          </Stack>
        )}
      </PageState>
    </Stack>
  )
}
