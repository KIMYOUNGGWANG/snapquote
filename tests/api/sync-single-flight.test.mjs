import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createCoalescedRunner } from '../../lib/sync-single-flight.ts'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

// Fake sync: snapshots the local store when it starts, then "pushes" that snapshot once released.
function createFakeSync(localStore) {
  const pushes = []
  const gates = []
  let concurrent = 0
  let maxConcurrent = 0

  const task = async () => {
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    const snapshot = { ...localStore }
    const gate = deferred()
    gates.push(gate)
    try {
      await gate.promise
      pushes.push(snapshot)
      return snapshot
    } finally {
      concurrent--
    }
  }

  return {
    task,
    pushes,
    gates,
    get maxConcurrent() {
      return maxConcurrent
    },
  }
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

describe('createCoalescedRunner', () => {
  test('overlapping calls never run concurrently and later callers see their own writes', async () => {
    const localStore = { completion: null }
    const fake = createFakeSync(localStore)
    const sync = createCoalescedRunner(fake.task)

    const first = sync()
    await flushMicrotasks()

    // Saved after the first sync took its snapshot (e.g. finalizeJobCompletion stores the completion record).
    localStore.completion = 'sent'
    const second = sync()
    const third = sync()

    assert.equal(fake.gates.length, 1, 'follow-up must wait for the in-flight run')
    fake.gates[0].resolve()
    assert.deepEqual(await first, { completion: null })

    await flushMicrotasks()
    assert.equal(fake.gates.length, 2)
    fake.gates[1].resolve()

    const [secondResult, thirdResult] = await Promise.all([second, third])
    assert.deepEqual(secondResult, { completion: 'sent' })
    assert.equal(thirdResult, secondResult, 'callers queued during one run share a single follow-up')
    assert.equal(fake.pushes.length, 2, 'three calls push exactly twice: in-flight run + one coalesced follow-up')
    assert.equal(fake.maxConcurrent, 1)
  })

  test('a call after everything settles starts a fresh run', async () => {
    const fake = createFakeSync({ value: 1 })
    const sync = createCoalescedRunner(fake.task)

    const first = sync()
    await flushMicrotasks()
    fake.gates[0].resolve()
    await first

    const second = sync()
    await flushMicrotasks()
    assert.equal(fake.gates.length, 2)
    fake.gates[1].resolve()
    await second
    assert.equal(fake.pushes.length, 2)
  })

  test('a failed in-flight run still lets the queued follow-up run', async () => {
    const fake = createFakeSync({ value: 1 })
    const sync = createCoalescedRunner(fake.task)

    const first = sync()
    await flushMicrotasks()
    const second = sync()

    fake.gates[0].reject(new Error('network down'))
    await assert.rejects(first, /network down/)

    await flushMicrotasks()
    fake.gates[1].resolve()
    assert.deepEqual(await second, { value: 1 })
    assert.equal(fake.maxConcurrent, 1)
  })
})
