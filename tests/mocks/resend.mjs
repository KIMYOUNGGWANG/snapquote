import { getTestState } from './state.mjs'

export class Resend {
  constructor(apiKey) {
    const state = getTestState()
    state.resend.constructorCalls.push({ apiKey })

    this.emails = {
      send: async (payload) => {
        const current = getTestState()
        current.resend.sendCalls.push(payload)
        return current.resend.send(payload)
      },
    }
  }
}
