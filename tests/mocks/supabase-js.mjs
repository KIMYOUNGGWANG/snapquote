import { createSupabaseClientMock, getTestState } from './state.mjs'

export function createClient(url, key, options = {}) {
  const state = getTestState()
  state.supabase.createClientCalls.push({ url, key, options })
  return createSupabaseClientMock(state)
}
