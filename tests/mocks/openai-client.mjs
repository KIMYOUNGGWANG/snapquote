import { getTestState } from './state.mjs'

export const openai = {
  audio: {
    transcriptions: {
      create: async (payload) => {
        const state = getTestState()
        state.openai.audioCalls.push(payload)
        return state.openai.audioTranscriptionsCreate(payload)
      },
    },
  },
}
