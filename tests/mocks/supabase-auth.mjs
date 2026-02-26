import { createSupabaseClientMock, getTestState } from './state.mjs'

export function parseBearerToken(req) {
  const state = getTestState()

  if (typeof state.supabaseAuth.parseTokenOverride === 'function') {
    return state.supabaseAuth.parseTokenOverride(req)
  }

  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return ''
  return authHeader.slice(7).trim()
}

export function createAuthedSupabaseClient(accessToken) {
  const state = getTestState()
  state.supabaseAuth.lastToken = accessToken

  if (state.supabaseAuth.forceNoClient) {
    return null
  }

  return createSupabaseClientMock(state)
}
