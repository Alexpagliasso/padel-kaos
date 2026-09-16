export const typography = {
  fontFamily: '"Segoe UI Variable", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif',
  h1: { fontWeight: 900, fontSize: 'clamp(2rem, 4vw, 4.5rem)', letterSpacing: '-.05em', lineHeight: 1.05 },
  h2: { fontWeight: 850, fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', letterSpacing: '-.035em' },
  h3: { fontWeight: 800, fontSize: '1.4rem' },
  button: { fontWeight: 800, textTransform: 'none' as const },
}
export const scoreTypography = { fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.06em', lineHeight: 1 } as const
export const displayTypography = { ...scoreTypography, fontSize: 'clamp(4rem, 12vw, 12rem)' }
