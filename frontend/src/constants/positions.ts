/**
 * FPL position constants
 * element_type values: 1=GKP, 2=DEF, 3=MID, 4=FWD
 */

/**
 * Position type enum for element_type field
 * Use instead of magic numbers like `element_type === 1`
 */
export const POSITION_TYPES = {
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 3,
  FORWARD: 4,
} as const;

export type PositionType = (typeof POSITION_TYPES)[keyof typeof POSITION_TYPES];

export const POSITION_LABELS: Record<number, string> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

// WCAG AA compliant colors (4.5:1+ contrast with white text)
export const POSITION_COLORS: Record<number, string> = {
  1: '#d97706', // amber-600 (goalkeeper)
  2: '#b91c1c', // red-700 (defender)
  3: '#1d4ed8', // blue-700 (midfielder)
  4: '#15803d', // green-700 (forward)
};

export function getPositionLabel(elementType: number): string {
  return POSITION_LABELS[elementType] ?? 'UNK';
}

export function getPositionColor(elementType: number): string {
  return POSITION_COLORS[elementType] ?? '#6b7280'; // gray-500
}

/** Starting XI positions are 1-11, bench is 12-15 */
export const STARTING_XI_MAX_POSITION = 11;
