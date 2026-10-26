export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Remaining balance in dollars, never below 0. */
export function computeBalanceDue(totalAmount: number, amountPaid: number): number {
  return Math.max(0, toCents(totalAmount) - toCents(amountPaid)) / 100
}

/** Paid in full (cent comparison). A zero total is never "paid". */
export function isFullyPaid(totalAmount: number, amountPaid: number): boolean {
  const total = toCents(totalAmount)
  return total > 0 && toCents(amountPaid) >= total
}
