export type RecoveryAction =
    | "sent_sms"
    | "sent_email"
    | "skipped_no_contact"
    | "skipped_scope_review_needed"
    | "skipped_customer_paid"
    | "skipped_customer_approved"
    | "skipped_customer_change_requested"

export type RecoveryResult = {
    estimateId: string
    estimateNumber: string
    action: RecoveryAction
    messagePreview: string
    customerPortalStatus?: CustomerPortalFollowupStatus
}

export type RecoveryPayload = {
    estimateId?: string
    dryRun: boolean
}

export type CustomerPortalFollowupStatus = "shared" | "viewed" | "approved" | "change_requested"

export type CandidateEstimate = {
    id: string
    user_id: string
    estimate_number?: string | null
    total_amount?: number | null
    sent_at?: string | null
    created_at?: string | null
    first_followup_queued_at?: string | null
    first_followed_up_at?: string | null
    last_followed_up_at?: string | null
    payment_completed_at?: string | null
    clients?: unknown
    profiles?: unknown
    estimate_attachments?: unknown
}

export type CandidateCustomerPortal = {
    status: CustomerPortalFollowupStatus
    shareUrl: string
    customerNote: string
}

export type CandidateContact = {
    clientName: string
    clientEmail: string
    clientPhone: string
    businessName: string
}
