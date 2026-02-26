import { getTestState } from './state.mjs'

export async function recordOpsAlert(payload) {
  const state = getTestState()
  state.opsAlerts.calls.push(payload)
}
