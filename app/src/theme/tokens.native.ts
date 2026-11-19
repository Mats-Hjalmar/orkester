// Re-export facade: the design tokens live in @orkester/core/theme (the single
// source of truth, also consumed by the Electron renderer). Keeping this local
// path stable means the ~20 `../theme/tokens` imports don't churn.
export { colors, ink, radii, shadow, space, FRAME, FIXED_DARK } from '@orkester/core/theme';
