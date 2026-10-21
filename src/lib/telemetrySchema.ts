import { z } from "zod";

/**
 * What one finished interview sends to the usage counter.
 *
 * Deliberately small. It is numbers and a topic id, so there is nothing in it
 * that could be a transcript, a question, a name, or audio. The browser builds
 * it from the scorecard and the server validates it with this same schema, so
 * the two cannot drift: a field added on one side and not the other is rejected.
 *
 * The ids are random strings made in the browser. They exist to count distinct
 * visitors and to make a retry of the same interview count once. They are not
 * accounts, and clearing site data starts a new one.
 */

export const TELEMETRY_BANDS = ["strong", "solid", "developing", "not-yet"] as const;

const randomId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const telemetrySchema = z
  .object({
    v: z.literal(1),
    /** One per interview. Sending the same one twice counts once. */
    sessionId: randomId,
    /** One per browser, for the distinct-visitor count. */
    visitorId: randomId,
    topicId: z.string().min(1).max(64),
    /** Questions answered, and how many of them the models rated. */
    asked: z.number().int().min(1).max(10),
    rated: z.number().int().min(1).max(10),
    /** Mean score per model, 0 to 100. Null when that model rated nothing. */
    nano: z.number().int().min(0).max(100).nullable(),
    ultra: z.number().int().min(0).max(100).nullable(),
    band: z.enum(TELEMETRY_BANDS).nullable(),
    /** Rubric lines covered out of those asked about. */
    landed: z.number().int().min(0).max(12),
    lines: z.number().int().min(1).max(12),
    /** Points the two models rated the same way, out of the points both rated. */
    agree: z.number().int().min(0).max(500),
    agreeTotal: z.number().int().min(0).max(500),
  })
  .strict()
  .refine((e) => e.rated <= e.asked, { message: "rated cannot exceed asked" })
  .refine((e) => e.landed <= e.lines, { message: "landed cannot exceed lines" })
  .refine((e) => e.agree <= e.agreeTotal, { message: "agree cannot exceed agreeTotal" })
  .refine((e) => e.nano !== null || e.ultra !== null, { message: "at least one model score is required" });

export type TelemetryEvent = z.infer<typeof telemetrySchema>;

/** What /api/stats returns. Everything is an aggregate; nothing is per person. */
export interface PublicStats {
  /** False when no database is configured. The UI then shows nothing rather than zeros. */
  enabled: boolean;
  interviews: number;
  visitors: number;
  answersRated: number;
  /** Mean of the two models' interview scores, 0 to 100. */
  averageScore: number | null;
  /** Share of points both models rated the same way, 0 to 100. */
  agreementPct: number | null;
  /** Share of the rubric lines asked about that the answers covered, 0 to 100. */
  coveragePct: number | null;
  bands: Record<(typeof TELEMETRY_BANDS)[number], number>;
  topics: { topicId: string; interviews: number; averageScore: number | null }[];
  /** Last 14 days, oldest first, zero-filled. */
  daily: { date: string; interviews: number }[];
  updatedAt: string;
}
