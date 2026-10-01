import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { formatPartialDate } from '../../../lib/partialDate'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import SectionLabel from '../../../ui/SectionLabel'
import { useGeneralProfile } from '../api'
import type { Address } from '../api'
import { BackToProfile, FieldList, FieldRow, NO_PROFILE_MESSAGE, SectionCard, isNotFound } from '../ProfileFields'
import CopyButton from './CopyButton'

function AddressBlock({ title, address }: { title: string; address: Address }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ mt: 1.5, color: 'primary.main' }}>{title}</SectionLabel>
      <FieldList>
        <FieldRow label="Địa chỉ" value={address.address} />
        <FieldRow label="Phường / Xã" value={address.ward} />
        <FieldRow label="Quận / Huyện" value={address.district} />
        <FieldRow label="Tỉnh / Thành phố" value={address.province} />
      </FieldList>
    </Box>
  )
}

export function Component() {
  const q = useGeneralProfile()
  const g = q.data
  const noProfile = isNotFound(q.error)

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Thông tin chung"
        eyebrow="Hồ sơ cá nhân"
        subtitle={g ? `${g.fullName} · ${g.code}` : undefined}
        actions={<BackToProfile />}
      />
      <PageState
        error={noProfile ? undefined : q.error}
        loading={q.isPending && !q.error}
        empty={noProfile}
        emptyMessage={NO_PROFILE_MESSAGE}
        errorFallback="Không tải được thông tin chung."
        onRetry={() => void q.refetch()}
      >
        {g && (
          <Stack spacing={3}>
            <SectionCard title="Cá nhân" index={1}>
              <FieldList>
                <FieldRow label="Họ và tên" value={g.fullName} />
                <FieldRow label="Họ và tên đệm" value={g.lastName} />
                <FieldRow label="Tên" value={g.firstName} />
                <FieldRow label="Ngày sinh" value={formatPartialDate(g.dateOfBirth)} />
                <FieldRow label="Giới tính" value={g.gender} />
                <FieldRow label="Dân tộc" value={g.ethnicity} />
                <FieldRow label="Tôn giáo" value={g.religion} />
                <FieldRow label="Quốc tịch" value={g.nationality} />
                <FieldRow label="Nơi sinh" value={g.birthPlace} />
                <FieldRow label="Quê quán" value={g.hometown} />
              </FieldList>
            </SectionCard>

            <SectionCard title="Liên hệ" index={2}>
              <FieldList>
                <FieldRow
                  label="Điện thoại di động"
                  value={g.phoneMobile}
                  action={<CopyButton text={g.phoneMobile} label="số điện thoại di động" />}
                />
                <FieldRow
                  label="Điện thoại cố định"
                  value={g.phoneHome}
                  action={<CopyButton text={g.phoneHome} label="số điện thoại cố định" />}
                />
                <FieldRow
                  label="Email cá nhân"
                  value={g.personalEmail}
                  action={<CopyButton text={g.personalEmail} label="email cá nhân" />}
                />
                {g.emails.length === 0 ? (
                  <FieldRow label="Email trường" />
                ) : (
                  g.emails.map((email, i) => (
                    <FieldRow
                      key={email}
                      label={i === 0 ? 'Email trường' : ''}
                      value={email}
                      action={<CopyButton text={email} label={`email ${email}`} />}
                    />
                  ))
                )}
              </FieldList>
            </SectionCard>

            <SectionCard title="Địa chỉ" index={3}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4 }}>
                <AddressBlock title="Thường trú" address={g.permanentAddress} />
                <AddressBlock title="Liên hệ" address={g.contactAddress} />
              </Box>
            </SectionCard>
          </Stack>
        )}
      </PageState>
    </Stack>
  )
}
