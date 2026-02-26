import { getTestState } from './state.mjs'

export async function requireAuthenticatedUser(req) {
  const state = getTestState()
  state.routeAuth.calls.push({ req })

  const result = state.routeAuth.result
  if (typeof result === 'function') {
    return result(req)
  }

  return result
}
