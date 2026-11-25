export type ResetState =
  | 'requested'
  | 'email_verified'
  | 'pending_cooling_off'
  | 'completed'
  | 'vetoed'
  | 'expired'
  | 'cancelled'

const ALLOWED_TRANSITIONS: Record<ResetState, ReadonlyArray<ResetState>> = {
  requested: ['email_verified', 'expired', 'cancelled', 'vetoed'],
  email_verified: ['pending_cooling_off', 'expired', 'cancelled', 'vetoed'],
  pending_cooling_off: ['completed', 'vetoed', 'expired', 'cancelled'],
  completed: [],
  vetoed: [],
  expired: [],
  cancelled: [],
}

export class IllegalStateTransitionError extends Error {
  constructor(from: ResetState, to: ResetState) {
    super(`Illegal reset state transition: ${from} -> ${to}`)
    this.name = 'IllegalStateTransitionError'
  }
}

export function canTransition(from: ResetState, to: ResetState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertValidTransition(from: ResetState, to: ResetState): void {
  if (!canTransition(from, to)) {
    throw new IllegalStateTransitionError(from, to)
  }
}

export const TERMINAL_RESET_STATES: ReadonlyArray<ResetState> = [
  'completed',
  'vetoed',
  'expired',
  'cancelled',
]
