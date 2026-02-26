import { getTestState } from './state.mjs'

export function getClientIp() {
  const state = getTestState()
  return state.rateLimit.ip
}

export async function checkRateLimit(options) {
  const state = getTestState()
  state.rateLimit.calls.push(options)

  const result = state.rateLimit.result
  if (typeof result === 'function') {
    return result(options)
  }

  return result
}
