import { getTestState } from './state.mjs'

export async function enforceUsageQuota(req, metric, options = {}) {
  const state = getTestState()
  state.usageQuota.enforceCalls.push({ metric, options })

  const result = state.usageQuota.enforceResult
  if (typeof result === 'function') {
    return result(req, metric, options)
  }

  return result
}

export async function recordUsage(context, metric, input = {}) {
  const state = getTestState()
  state.usageQuota.recordCalls.push({ context, metric, input })
}

export async function getUsageSnapshot(req) {
  const state = getTestState()
  state.usageQuota.snapshotCalls.push({ req })

  const result = state.usageQuota.snapshotResult
  if (typeof result === 'function') {
    return result(req)
  }

  return result
}
