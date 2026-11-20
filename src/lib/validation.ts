import { z } from "zod";

/** Chat request body validation. */
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  sessionId: z.string().min(8).max(128),
  orgSlug: z.string().min(1).max(64).optional(),
  messages: z.array(chatMessageSchema).min(1).max(50),
});

/** Lead capture validation — used by both the AI tool and the public form. */
export const leadSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v.trim() : null)),
  service_interest: z.string().max(200).optional().nullable(),
  requirements: z.string().max(2000).optional().nullable(),
  sessionId: z.string().min(8).max(128).optional(),
  orgSlug: z.string().min(1).max(64).optional(),
});

export const handoffSchema = z.object({
  sessionId: z.string().min(8).max(128),
  orgSlug: z.string().min(1).max(64).optional(),
  reason: z.string().max(1000).optional().nullable(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type HandoffInput = z.infer<typeof handoffSchema>;
