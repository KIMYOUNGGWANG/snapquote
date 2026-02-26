import { getTestState } from './state.mjs'

class Stripe {
  constructor(secretKey, options = {}) {
    const state = getTestState()
    state.stripe.instances.push({ secretKey, options })

    this.webhooks = {
      constructEvent: (body, signature, endpointSecret) => {
        const current = getTestState()
        return current.stripe.constructEvent(body, signature, endpointSecret)
      },
    }

    this.paymentLinks = {
      create: async (payload, requestOptions) => {
        const current = getTestState()
        return current.stripe.paymentLinksCreate(payload, requestOptions)
      },
    }

    this.customers = {
      create: async (payload) => {
        const current = getTestState()
        current.stripe.customersCreateCalls.push(payload)
        return current.stripe.customersCreate(payload)
      },
    }

    this.accounts = {
      create: async (payload) => {
        const current = getTestState()
        current.stripe.accountsCreateCalls.push(payload)
        return current.stripe.accountsCreate(payload)
      },
      retrieve: async (accountId) => {
        const current = getTestState()
        current.stripe.accountRetrieveCalls.push(accountId)
        return current.stripe.accountRetrieve(accountId)
      },
      createLoginLink: async (accountId) => {
        const current = getTestState()
        current.stripe.accountLoginLinkCreateCalls.push(accountId)
        return current.stripe.accountLoginLinkCreate(accountId)
      },
    }

    this.accountLinks = {
      create: async (payload) => {
        const current = getTestState()
        current.stripe.accountLinksCreateCalls.push(payload)
        return current.stripe.accountLinksCreate(payload)
      },
    }

    this.paymentIntents = {
      retrieve: async (paymentIntentId) => {
        const current = getTestState()
        return current.stripe.paymentIntentsRetrieve(paymentIntentId)
      },
    }

    this.checkout = {
      sessions: {
        create: async (payload) => {
          const current = getTestState()
          current.stripe.checkoutSessionsCreateCalls.push(payload)
          return current.stripe.checkoutSessionsCreate(payload)
        },
        list: async (params) => {
          const current = getTestState()
          current.stripe.checkoutSessionsListCalls.push(params)

          if (current.stripe.sessionsListPages.length > 0) {
            return current.stripe.sessionsListPages.shift()
          }

          return {
            data: [],
            has_more: false,
          }
        },
      },
    }

    this.billingPortal = {
      sessions: {
        create: async (payload) => {
          const current = getTestState()
          current.stripe.billingPortalSessionsCreateCalls.push(payload)
          return current.stripe.billingPortalSessionsCreate(payload)
        },
      },
    }

    this.subscriptions = {
      retrieve: async (subscriptionId) => {
        const current = getTestState()
        current.stripe.subscriptionsRetrieveCalls.push(subscriptionId)
        return current.stripe.subscriptionsRetrieve(subscriptionId)
      },
    }
  }
}

export default Stripe
