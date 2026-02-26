import { getTestState } from './state.mjs'

export class OpenAI {
  constructor(config = {}) {
    const state = getTestState()
    state.openai.constructorCalls.push({ config })

    this.chat = {
      completions: {
        create: async (payload) => {
          const current = getTestState()
          current.openai.chatCalls.push(payload)
          return current.openai.chatCompletionsCreate(payload)
        },
      },
    }

    this.audio = {
      transcriptions: {
        create: async (payload) => {
          const current = getTestState()
          current.openai.audioCalls.push(payload)
          return current.openai.audioTranscriptionsCreate(payload)
        },
      },
    }
  }
}

export default OpenAI
