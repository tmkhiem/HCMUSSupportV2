import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepButton from '@mui/material/StepButton'
import Stepper from '@mui/material/Stepper'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { ReactNode } from 'react'
import { AcrylicCard } from '../../../ui'

export interface StepDef {
  label: string
  /** One or two sentences: what this step is for. */
  help: string
}

export interface StepFlowProps {
  steps: readonly StepDef[]
  step: number
  onStep: (index: number) => void
  /** One panel per step. All stay mounted (the editor keeps its state); only the current one is shown. */
  panels: readonly ReactNode[]
  onBack: () => void
  onNext: () => void
  busy?: boolean
}

/**
 * The multi-step frame of a new notification: a stepper (clickable, so people can jump), the help text of the current
 * step, its panel, and Quay lại / Tiếp. The last step has its own buttons inside its panel.
 */
export default function StepFlow({ steps, step, onStep, panels, onBack, onNext, busy }: StepFlowProps) {
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true })
  const last = step === steps.length - 1
  return (
    <Stack spacing={2} data-testid="step-flow">
      <AcrylicCard sx={{ p: { xs: 1.5, md: 2 } }}>
        {wide ? (
          <Stepper nonLinear activeStep={step} aria-label="Các bước soạn thông báo">
            {steps.map((s, i) => (
              <Step key={s.label} completed={i < step}>
                <StepButton onClick={() => onStep(i)} aria-current={i === step ? 'step' : undefined} data-testid={`step-${i}`}>
                  {s.label}
                </StepButton>
              </Step>
            ))}
          </Stepper>
        ) : (
          <Box>
            <Typography variant="subtitle2">
              Bước {step + 1}/{steps.length}: {steps[step].label}
            </Typography>
            <LinearProgress variant="determinate" value={((step + 1) / steps.length) * 100} sx={{ mt: 1 }} aria-label="Tiến độ" />
          </Box>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} data-testid="step-help">
          {steps[step].help}
        </Typography>
      </AcrylicCard>

      {panels.map((panel, i) => (
        <Box key={steps[i].label} role="group" aria-label={steps[i].label} hidden={i !== step} sx={{ display: i === step ? 'block' : 'none' }}>
          {panel}
        </Box>
      ))}

      {!last && (
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Button color="inherit" variant="outlined" disabled={step === 0 || busy} onClick={onBack}>
            Quay lại
          </Button>
          <Button variant="contained" disabled={busy} onClick={onNext} data-testid="step-next">
            Tiếp: {steps[step + 1].label}
          </Button>
        </Stack>
      )}
      {last && (
        <Stack direction="row">
          <Button color="inherit" variant="outlined" disabled={busy} onClick={onBack}>
            Quay lại
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
