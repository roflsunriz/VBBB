/**
 * Zod schemas for runtime validation at I/O boundaries.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// subject.txt parsing
// ---------------------------------------------------------------------------

/** A single line of subject.txt */
export const SubjectLineSchema = z.object({
  fileName: z.string().regex(/^\d+\.dat$/, 'Invalid DAT filename'),
  title: z.string().min(1),
  count: z.number().int().nonnegative(),
});
export type SubjectLine = z.infer<typeof SubjectLineSchema>;

// ---------------------------------------------------------------------------
// DAT line parsing (5ch/2ch format: 5 fields separated by <>)
// ---------------------------------------------------------------------------

export const DatLineSchema = z.object({
  name: z.string(),
  mail: z.string(),
  dateTime: z.string(),
  body: z.string(),
  title: z.string(),
});
export type DatLine = z.infer<typeof DatLineSchema>;

// ---------------------------------------------------------------------------
// Board from BBS menu
// ---------------------------------------------------------------------------

export const BoardEntrySchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});
export type BoardEntry = z.infer<typeof BoardEntrySchema>;

export const CategorySchema = z.object({
  name: z.string().min(1),
  boards: z.array(BoardEntrySchema),
});
export type CategoryEntry = z.infer<typeof CategorySchema>;

export const BBSMenuSchema = z.object({
  categories: z.array(CategorySchema),
});
export type BBSMenuEntry = z.infer<typeof BBSMenuSchema>;

// ---------------------------------------------------------------------------
// Post params validation
// ---------------------------------------------------------------------------

export const PostParamsSchema = z.object({
  boardUrl: z.string().url(),
  /** Numeric thread ID, or empty string when creating a new thread. */
  threadId: z.string().regex(/^\d*$/, 'Thread ID must be numeric (or empty for new thread)'),
  name: z.string(),
  mail: z.string(),
  message: z.string().min(1, 'Message must not be empty'),
  /** Required when threadId is empty (new thread creation). */
  subject: z.string().optional(),
}).refine(
  (data) => data.threadId.length > 0 || (data.subject !== undefined && data.subject.trim().length > 0),
  { message: 'Subject is required when creating a new thread (threadId must be empty)' },
);
export type PostParamsInput = z.infer<typeof PostParamsSchema>;

// ---------------------------------------------------------------------------
// Folder.idx line
// ---------------------------------------------------------------------------

export const FolderIdxLineSchema = z.object({
  no: z.number().int().nonnegative(),
  fileName: z.string(),
  title: z.string(),
  count: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  roundDate: z.string().nullable(),
  lastModified: z.string().nullable(),
  kokomade: z.number().int(),
  newReceive: z.number().int().nonnegative(),
  unRead: z.boolean(),
  scrollTop: z.number().int().nonnegative(),
  scrollResNumber: z.number().int().nonnegative(),
  scrollResOffset: z.number().int().nonnegative(),
  allResCount: z.number().int().nonnegative(),
  newResCount: z.number().int().nonnegative(),
  ageSage: z.number().int().min(0).max(4),
});
export type FolderIdxLine = z.infer<typeof FolderIdxLineSchema>;

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/** Validate a board URL */
export const BoardUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.pathname.endsWith('/');
      } catch {
        return false;
      }
    },
    { message: 'Board URL must end with /' },
  );
