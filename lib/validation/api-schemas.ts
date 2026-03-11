import { z } from "zod"

const MAX_GENERATE_NOTES_LENGTH = 8_000
const MAX_GENERATE_IMAGES = 8
const MAX_GENERATE_IMAGE_LENGTH = 2_000_000
const MAX_RECEIPT_CONTEXT_LENGTH = 500

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
    userProfile: generateUserProfileSchema.optional(),
    projectType: z.enum(["residential", "commercial"], { error: "Invalid project type" }).optional(),
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
