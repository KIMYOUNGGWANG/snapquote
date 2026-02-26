function defaultUsageSnapshot() {
  return {
    ok: true,
    data: {
      planTier: 'free',
      periodStart: '2026-02-01',
      usage: {
        generate: 0,
        transcribe: 0,
        send_email: 0,
      },
      limits: {
        generate: 50,
        transcribe: 80,
        send_email: 40,
      },
      remaining: {
        generate: 50,
        transcribe: 80,
        send_email: 40,
      },
      usageRatePct: {
        generate: 0,
        transcribe: 0,
        send_email: 0,
      },
      openaiPromptTokens: 0,
      openaiCompletionTokens: 0,
      estimatedCosts: {
        openai: 0,
        resend: 0,
        total: 0,
      },
    },
  }
}

function defaultQueryResolver(query) {
  if (query.action === 'insert' && query.mode === 'single') {
    return { data: { id: `${query.table}-id` }, error: null }
  }

  if (query.action === 'insert' && query.mode === 'maybeSingle') {
    return { data: { id: `${query.table}-id` }, error: null }
  }

  if (query.action === 'update' && query.mode === 'single') {
    return { data: { id: `${query.table}-updated` }, error: null }
  }

  if (query.mode === 'execute') {
    return { data: [], error: null }
  }

  return { data: null, error: null }
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object') {
    return { data: result ?? null, error: null }
  }

  if ('data' in result || 'error' in result) {
    return {
      data: result.data ?? null,
      error: result.error ?? null,
    }
  }

  return { data: result, error: null }
}

function createQueryBuilder(state, table) {
  const query = {
    table,
    action: 'select',
    payload: undefined,
    selectColumns: undefined,
    filters: [],
    orderBy: [],
    limitValue: undefined,
    upsertOptions: undefined,
  }

  async function execute(mode) {
    const snapshot = {
      ...query,
      mode,
    }

    state.supabase.queryCalls.push(snapshot)

    const resolver = state.supabase.queryResolver || defaultQueryResolver
    const resolved = await resolver(snapshot)
    return normalizeResult(resolved)
  }

  const builder = {
    select(columns) {
      query.selectColumns = columns
      return builder
    },

    insert(payload) {
      query.action = 'insert'
      query.payload = payload
      return builder
    },

    update(payload) {
      query.action = 'update'
      query.payload = payload
      return builder
    },

    upsert(payload, options) {
      query.action = 'upsert'
      query.payload = payload
      query.upsertOptions = options
      return builder
    },

    eq(column, value) {
      query.filters.push({ op: 'eq', column, value })
      return builder
    },

    neq(column, value) {
      query.filters.push({ op: 'neq', column, value })
      return builder
    },

    gte(column, value) {
      query.filters.push({ op: 'gte', column, value })
      return builder
    },

    lte(column, value) {
      query.filters.push({ op: 'lte', column, value })
      return builder
    },

    is(column, value) {
      query.filters.push({ op: 'is', column, value })
      return builder
    },

    in(column, value) {
      query.filters.push({ op: 'in', column, value })
      return builder
    },

    order(column, options) {
      query.orderBy.push({ column, options: options || {} })
      return builder
    },

    limit(value) {
      query.limitValue = value
      return builder
    },

    single() {
      return execute('single')
    },

    maybeSingle() {
      return execute('maybeSingle')
    },

    then(onFulfilled, onRejected) {
      return execute('execute').then(onFulfilled, onRejected)
    },

    catch(onRejected) {
      return execute('execute').catch(onRejected)
    },

    finally(onFinally) {
      return execute('execute').finally(onFinally)
    },
  }

  return builder
}

export function createSupabaseClientMock(state) {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: state.supabase.user,
        },
        error: state.supabase.userError,
      }),
    },

    from(table) {
      return createQueryBuilder(state, table)
    },

    rpc(name, args) {
      state.supabase.rpcCalls.push({ name, args })
      const resolver = state.supabase.rpcResolver || (async () => ({ data: null, error: null }))
      return Promise.resolve(resolver({ name, args }))
    },
  }
}

export function resetTestState() {
  const state = {
    rateLimit: {
      result: {
        allowed: true,
        remaining: 999,
        resetAt: Date.now() + 60_000,
      },
      ip: '127.0.0.1',
      calls: [],
    },

    usageQuota: {
      enforceResult: {
        ok: true,
        context: {
          id: 'usage-context',
        },
        used: 0,
        limit: 50,
        remaining: 50,
        planTier: 'free',
      },
      enforceCalls: [],
      recordCalls: [],
      snapshotResult: defaultUsageSnapshot(),
      snapshotCalls: [],
    },

    routeAuth: {
      result: {
        ok: true,
        userId: 'user-1',
      },
      calls: [],
    },

    supabaseAuth: {
      forceNoClient: false,
      lastToken: null,
      parseTokenOverride: null,
    },

    supabase: {
      createClientCalls: [],
      user: {
        id: 'user-1',
      },
      userError: null,
      queryResolver: defaultQueryResolver,
      queryCalls: [],
      rpcResolver: async () => ({ data: null, error: null }),
      rpcCalls: [],
    },

    stripe: {
      instances: [],
      paymentLinksCreate: async () => ({
        id: 'plink_default',
        url: 'https://example.com/payment-link',
      }),
      customersCreateCalls: [],
      customersCreate: async () => ({
        id: 'cus_default',
      }),
      checkoutSessionsCreateCalls: [],
      checkoutSessionsCreate: async () => ({
        id: 'cs_default',
        url: 'https://checkout.stripe.com/c/pay/cs_default',
      }),
      billingPortalSessionsCreateCalls: [],
      billingPortalSessionsCreate: async () => ({
        url: 'https://billing.stripe.com/p/session_default',
      }),
      subscriptionsRetrieveCalls: [],
      subscriptionsRetrieve: async (subscriptionId) => ({
        id: subscriptionId,
        customer: 'cus_default',
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_pro_default',
              },
            },
          ],
        },
        current_period_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        cancel_at_period_end: false,
        metadata: {},
      }),
      accountsCreateCalls: [],
      accountRetrieveCalls: [],
      accountLinksCreateCalls: [],
      accountLoginLinkCreateCalls: [],
      accountsCreate: async () => ({
        id: 'acct_default',
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
      }),
      accountRetrieve: async (accountId) => ({
        id: accountId,
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
      }),
      accountLinksCreate: async () => ({
        url: 'https://connect.stripe.com/setup/s/default',
      }),
      accountLoginLinkCreate: async (accountId) => ({
        url: `https://connect.stripe.com/express/${accountId}`,
      }),
      paymentIntentsRetrieve: async () => ({
        metadata: {},
      }),
      sessionsListPages: [],
      checkoutSessionsListCalls: [],
      constructEvent: () => ({
        id: 'evt_default',
        type: 'noop',
        data: { object: {} },
      }),
    },

    resend: {
      constructorCalls: [],
      sendCalls: [],
      send: async () => ({
        id: 'email_default',
        error: null,
      }),
    },

    openai: {
      constructorCalls: [],
      chatCalls: [],
      audioCalls: [],
      chatCompletionsCreate: async () => ({
        choices: [{ message: { content: '{"items":[],"warnings":[]}' } }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
        },
      }),
      audioTranscriptionsCreate: async () => ({
        text: 'two 2x4 P-trap',
      }),
    },

    opsAlerts: {
      calls: [],
    },
  }

  globalThis.__snapquoteTestState = state
  return state
}

export function getTestState() {
  if (!globalThis.__snapquoteTestState) {
    return resetTestState()
  }

  return globalThis.__snapquoteTestState
}
