// Re-export facade: the design tokens live in @orkester/core/theme (the single
// source of truth, also consumed by the Electron renderer). Keeping this local
// path stable means the ~20 `../theme/tokens` imports don't churn.
export { colors, ink, paper, radii, shadow, space, FRAME } from '@orkester/core/theme';
