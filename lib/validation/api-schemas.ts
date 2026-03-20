import { z } from "zod"

const MAX_GENERATE_NOTES_LENGTH = 8_000
const MAX_GENERATE_IMAGES = 8
const MAX_GENERATE_IMAGE_LENGTH = 2_000_000
const MAX_GENERATE_PHOTO_CONTEXT_LENGTH = 500
const MAX_RECEIPT_CONTEXT_LENGTH = 500
const SOURCE_LANGUAGE_VALUES = ["auto", "en", "es", "ko"] as const
const GENERATE_WORKFLOW_VALUES = ["standard", "photo_estimate"] as const
const QUICKBOOKS_INVOICE_STATUS_VALUES = ["open", "paid", "unknown"] as const
const TEAM_MEMBER_ROLE_VALUES = ["owner", "admin", "member"] as const
const TEAM_INVITE_ROLE_VALUES = ["admin", "member"] as const
const TEAM_SESSION_ACTION_VALUES = ["claim", "heartbeat", "release", "takeover"] as const

const generateImageSchema = z
    .string({ error: "Invalid image payload" })
    .max(MAX_GENERATE_IMAGE_LENGTH, "Invalid image payload")

const generateUserProfileSchema = z.object({
    city: z.string({ error: "Invalid user profile input" }).trim().max(120, "Invalid user profile input").optional(),
    country: z.string({ error: "Invalid user profile input" }).trim().max(80, "Invalid user profile input").optional(),
    taxRate: z.number({ error: "Invalid user profile input" }).finite("Invalid user profile input").min(0, "Invalid user profile input").max(100, "Invalid user profile input").optional(),
    businessName: z.string({ error: "Invalid user profile input" }).trim().max(160, "Invalid user profile input").optional(),
    priceList: z.string({ error: "Invalid user profile input" }).trim().max(20_000, "Invalid user profile input").optional(),
}).strict()

export const generateRequestSchema = z.object({
    notes: z.string({ error: "Invalid notes input" }).max(MAX_GENERATE_NOTES_LENGTH, "Invalid notes input").optional(),
    images: z.array(generateImageSchema, { error: "Invalid images input" }).max(MAX_GENERATE_IMAGES, "Invalid images input").optional(),
    sourceLanguage: z.enum(SOURCE_LANGUAGE_VALUES, { error: "Invalid source language" }).optional(),
    userProfile: generateUserProfileSchema.optional(),
    projectType: z.enum(["residential", "commercial"], { error: "Invalid project type" }).optional(),
    workflow: z.enum(GENERATE_WORKFLOW_VALUES, { error: "Invalid workflow" }).optional(),
    photoContext: z.string({ error: "Invalid photo context" }).max(MAX_GENERATE_PHOTO_CONTEXT_LENGTH, "Invalid photo context").optional(),
}).strict()

export const parseReceiptFormSchema = z.object({
    file: z.custom<File>((value) => value instanceof File, {
        error: "No file provided",
    })
        .refine((file) => file.type.startsWith("image/"), {
            message: "Invalid file type",
        })
        .refine((file) => file.size <= 10 * 1024 * 1024, {
            message: "Image file too large",
        }),
    context: z.union([
        z.string({ error: "Invalid context input" }).max(MAX_RECEIPT_CONTEXT_LENGTH, "Invalid context input"),
        z.null(),
        z.undefined(),
    ]).transform((value) => typeof value === "string" ? value.trim() : ""),
}).strict()

export const quickBooksConnectStartSchema = z.object({
    returnPath: z.string({ error: "Invalid return path" }).trim().max(200, "Invalid return path").optional(),
}).strict()

export const quickBooksConnectTokenSchema = z.object({
    code: z.string({ error: "Invalid authorization code" }).trim().min(1, "Invalid authorization code").max(2048, "Invalid authorization code"),
    realmId: z.string({ error: "Invalid company id" }).trim().min(1, "Invalid company id").max(128, "Invalid company id"),
}).strict()

const quickBooksSyncItemSchema = z.object({
    id: z.string({ error: "Invalid estimate item" }).trim().max(120, "Invalid estimate item").optional(),
    description: z.string({ error: "Invalid estimate item" }).trim().min(1, "Invalid estimate item").max(320, "Invalid estimate item"),
    quantity: z.number({ error: "Invalid estimate item" }).finite("Invalid estimate item").min(0, "Invalid estimate item").max(100_000, "Invalid estimate item"),
    unit_price: z.number({ error: "Invalid estimate item" }).finite("Invalid estimate item").min(0, "Invalid estimate item").max(1_000_000, "Invalid estimate item"),
    total: z.number({ error: "Invalid estimate item" }).finite("Invalid estimate item").min(0, "Invalid estimate item").max(1_000_000, "Invalid estimate item").optional(),
    category: z.string({ error: "Invalid estimate item" }).trim().max(40, "Invalid estimate item").optional(),
    unit: z.string({ error: "Invalid estimate item" }).trim().max(20, "Invalid estimate item").optional(),
}).strict()

export const quickBooksInvoiceSyncSchema = z.object({
    estimateId: z.string({ error: "Invalid estimate input" }).trim().min(1, "Invalid estimate input").max(120, "Invalid estimate input"),
    estimateNumber: z.string({ error: "Invalid estimate input" }).trim().min(1, "Invalid estimate input").max(120, "Invalid estimate input"),
    clientName: z.string({ error: "Invalid estimate input" }).trim().min(1, "Invalid estimate input").max(160, "Invalid estimate input"),
    clientAddress: z.string({ error: "Invalid estimate input" }).trim().max(240, "Invalid estimate input").optional(),
    summaryNote: z.string({ error: "Invalid estimate input" }).trim().max(4000, "Invalid estimate input").optional(),
    currency: z.enum(["USD", "CAD"], { error: "Invalid estimate input" }).optional(),
    type: z.enum(["estimate", "invoice"], { error: "Invalid estimate input" }).optional(),
    taxAmount: z.number({ error: "Invalid estimate input" }).finite("Invalid estimate input").min(0, "Invalid estimate input").max(1_000_000, "Invalid estimate input").optional(),
    totalAmount: z.number({ error: "Invalid estimate input" }).finite("Invalid estimate input").min(0, "Invalid estimate input").max(1_000_000, "Invalid estimate input"),
    items: z.array(quickBooksSyncItemSchema, { error: "Invalid estimate input" }).min(1, "Invalid estimate input").max(200, "Invalid estimate input"),
}).strict()

export const quickBooksInvoiceStatusSchema = z.enum(QUICKBOOKS_INVOICE_STATUS_VALUES, {
    error: "Invalid QuickBooks invoice status",
})

export const teamInviteSchema = z.object({
    email: z.string({ error: "Invalid invite email" }).trim().email("Invalid invite email").max(320, "Invalid invite email"),
    role: z.enum(TEAM_INVITE_ROLE_VALUES, { error: "Invalid invite role" }).optional(),
}).strict()

export const teamInviteAcceptSchema = z.object({
    token: z.string({ error: "Invalid invite token" }).trim().min(8, "Invalid invite token").max(128, "Invalid invite token"),
}).strict()

export const teamEstimateFeedQuerySchema = z.object({
    limit: z.coerce.number({ error: "Invalid limit" }).int("Invalid limit").min(1, "Invalid limit").max(100, "Invalid limit").optional(),
}).strict()

export const teamMemberRoleSchema = z.enum(TEAM_MEMBER_ROLE_VALUES, {
    error: "Invalid team member role",
})

const teamEstimateItemSchema = z.object({
    id: z.string({ error: "Invalid estimate item" }).trim().min(1, "Invalid estimate item").max(120, "Invalid estimate item"),
    itemNumber: z.number({ error: "Invalid estimate item" }).int("Invalid estimate item").min(1, "Invalid estimate item").max(1000, "Invalid estimate item"),
    category: z.string({ error: "Invalid estimate item" }).trim().min(1, "Invalid estimate item").max(40, "Invalid estimate item"),
    description: z.string({ error: "Invalid estimate item" }).trim().min(1, "Invalid estimate item").max(320, "Invalid estimate item"),
    quantity: z.number({ error: "Invalid estimate item" }).finite("Invalid estimate item").min(0, "Invalid estimate item").max(100_000, "Invalid estimate item"),
    unit: z.string({ error: "Invalid estimate item" }).trim().min(1, "Invalid estimate item").max(20, "Invalid estimate item"),
    unit_price: z.number({ error: "Invalid estimate item" }).finite("Invalid estimate item").min(0, "Invalid estimate item").max(1_000_000, "Invalid estimate item"),
    total: z.number({ error: "Invalid estimate item" }).finite("Invalid estimate item").min(0, "Invalid estimate item").max(1_000_000, "Invalid estimate item"),
}).strict()

const teamEstimateSectionSchema = z.object({
    id: z.string({ error: "Invalid estimate section" }).trim().min(1, "Invalid estimate section").max(120, "Invalid estimate section"),
    name: z.string({ error: "Invalid estimate section" }).trim().min(1, "Invalid estimate section").max(160, "Invalid estimate section"),
    divisionCode: z.string({ error: "Invalid estimate section" }).trim().max(20, "Invalid estimate section").optional(),
    items: z.array(teamEstimateItemSchema, { error: "Invalid estimate section" }).max(200, "Invalid estimate section"),
}).strict()

export const teamEstimateUpdateSchema = z.object({
    clientName: z.string({ error: "Invalid Team estimate payload" }).trim().min(1, "Invalid Team estimate payload").max(160, "Invalid Team estimate payload"),
    clientAddress: z.string({ error: "Invalid Team estimate payload" }).trim().max(240, "Invalid Team estimate payload").optional(),
    summary_note: z.string({ error: "Invalid Team estimate payload" }).trim().max(4000, "Invalid Team estimate payload"),
    status: z.enum(["draft", "sent", "paid"], { error: "Invalid Team estimate payload" }),
    taxRate: z.number({ error: "Invalid Team estimate payload" }).finite("Invalid Team estimate payload").min(0, "Invalid Team estimate payload").max(100, "Invalid Team estimate payload"),
    taxAmount: z.number({ error: "Invalid Team estimate payload" }).finite("Invalid Team estimate payload").min(0, "Invalid Team estimate payload").max(1_000_000, "Invalid Team estimate payload"),
    totalAmount: z.number({ error: "Invalid Team estimate payload" }).finite("Invalid Team estimate payload").min(0, "Invalid Team estimate payload").max(1_000_000, "Invalid Team estimate payload"),
    sentAt: z.string({ error: "Invalid Team estimate payload" }).trim().datetime("Invalid Team estimate payload").optional(),
    items: z.array(teamEstimateItemSchema, { error: "Invalid Team estimate payload" }).max(200, "Invalid Team estimate payload"),
    sections: z.array(teamEstimateSectionSchema, { error: "Invalid Team estimate payload" }).max(50, "Invalid Team estimate payload").optional(),
}).strict()

export const teamEstimateSessionActionSchema = z.object({
    action: z.enum(TEAM_SESSION_ACTION_VALUES, { error: "Invalid Team session action" }),
}).strict()
