/**
 * NG (あぼーん) filter type definitions.
 * Used for filtering/hiding responses based on configurable rules.
 */

/** Type of abon (hiding) to apply */
export const AbonType = {
  /** Normal abon: replace fields with placeholder text */
  Normal: 'normal',
  /** Transparent abon: completely hide the response */
  Transparent: 'transparent',
} as const;
export type AbonType = (typeof AbonType)[keyof typeof AbonType];

/** Target scope: what entity the rule filters */
export const NgTarget = {
  /** Filter individual responses in thread view */
  Response: 'response',
  /** Filter threads in thread list */
  Thread: 'thread',
  /** Filter boards in board tree */
  Board: 'board',
} as const;
export type NgTarget = (typeof NgTarget)[keyof typeof NgTarget];

/** Match mode for NG rules */
export const NgMatchMode = {
  /** Plain text AND matching (all tokens must be present) */
  Plain: 'plain',
  /** Regular expression matching (ES RegExp syntax) */
  Regexp: 'regexp',
} as const;
export type NgMatchMode = (typeof NgMatchMode)[keyof typeof NgMatchMode];

/** A single NG filter rule */
export interface NgRule {
  /** Unique identifier */
  readonly id: string;
  /** Target scope: what entity this rule filters (default: 'response') */
  readonly target?: NgTarget | undefined;
  /** Type of abon to apply when matched */
  readonly abonType: AbonType;
  /** Matching mode */
  readonly matchMode: NgMatchMode;
  /** Search tokens (AND condition for plain mode, single pattern for regexp) */
  readonly tokens: readonly string[];
  /** Restrict to specific board (BBSID), undefined = all boards */
  readonly boardId?: string | undefined;
  /** Restrict to specific thread (boardId/threadId), undefined = all threads */
  readonly threadId?: string | undefined;
  /** Whether the rule is enabled */
  readonly enabled: boolean;
}

/** Result of applying NG rules to a response */
export const NgFilterResult = {
  /** No match, show normally */
  None: 'none',
  /** Normal abon: replace with placeholder */
  NormalAbon: 'normal_abon',
  /** Transparent abon: hide completely */
  TransparentAbon: 'transparent_abon',
} as const;
export type NgFilterResult = (typeof NgFilterResult)[keyof typeof NgFilterResult];
