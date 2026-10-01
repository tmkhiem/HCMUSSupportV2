import Box from '@mui/material/Box'

/**
 * Self-hosted bg-logo, bottom-right at 0.2 opacity (PLAN §7.1). `public/bg-logo.svg` is a placeholder mark;
 * drop the official asset in as `public/bg-logo.svg` (or change the file name here).
 */
export default function Watermark() {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        p: 4,
      }}
    >
      <Box
        component="img"
        src={`${import.meta.env.BASE_URL}bg-logo.svg`}
        alt=""
        sx={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'right bottom', opacity: 0.2 }}
      />
    </Box>
  )
}
