import { createSupabaseClientMock, getTestState } from './state.mjs'

export function createClient(url, key, options = {}) {
  const state = getTestState()
  state.supabase.createClientCalls.push({ url, key, options })
  return createSupabaseClientMock(state, key === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service' : 'anon')
}
