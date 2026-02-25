/**
 * NG (あぼーん) filter type definitions.
 * Supports string, numeric, and time conditions for advanced filtering.
 */

// ---------------------------------------------------------------------------
// Abon type & filter target
// ---------------------------------------------------------------------------

export const AbonType = {
  Normal: 'normal',
  Transparent: 'transparent',
} as const;
export type AbonType = (typeof AbonType)[keyof typeof AbonType];

export const NgTarget = {
  Response: 'response',
  Thread: 'thread',
  Board: 'board',
} as const;
export type NgTarget = (typeof NgTarget)[keyof typeof NgTarget];

export const NgFilterResult = {
  None: 'none',
  NormalAbon: 'normal_abon',
  TransparentAbon: 'transparent_abon',
} as const;
export type NgFilterResult = (typeof NgFilterResult)[keyof typeof NgFilterResult];

// ---------------------------------------------------------------------------
// String condition
// ---------------------------------------------------------------------------

export const NgStringField = {
  Name: 'name',
  Body: 'body',
  Mail: 'mail',
  Id: 'id',
  Trip: 'trip',
  Watchoi: 'watchoi',
  Ip: 'ip',
  Be: 'be',
  Url: 'url',
  ThreadTitle: 'threadTitle',
  All: 'all',
} as const;
export type NgStringField = (typeof NgStringField)[keyof typeof NgStringField];

export const NgStringMatchMode = {
  Plain: 'plain',
  Regexp: 'regexp',
  RegexpNoCase: 'regexp_nocase',
  Fuzzy: 'fuzzy',
} as const;
export type NgStringMatchMode = (typeof NgStringMatchMode)[keyof typeof NgStringMatchMode];

export interface NgStringCondition {
  readonly type: 'string';
  readonly matchMode: NgStringMatchMode;
  readonly fields: readonly NgStringField[];
  readonly tokens: readonly string[];
  readonly negate: boolean;
}

// ---------------------------------------------------------------------------
// Numeric condition
// ---------------------------------------------------------------------------

export const NgNumericTarget = {
  ResNumber: 'resNumber',
  LineCount: 'lineCount',
  CharCount: 'charCount',
  IdCount: 'idCount',
  ReplyCount: 'replyCount',
  RepliedCount: 'repliedCount',
  ThreadMomentum: 'threadMomentum',
  ThreadResCount: 'threadResCount',
} as const;
export type NgNumericTarget = (typeof NgNumericTarget)[keyof typeof NgNumericTarget];

export const NgNumericOp = {
  Eq: 'eq',
  Gte: 'gte',
  Lte: 'lte',
  Lt: 'lt',
  Gt: 'gt',
  Between: 'between',
} as const;
export type NgNumericOp = (typeof NgNumericOp)[keyof typeof NgNumericOp];

export interface NgNumericCondition {
  readonly type: 'numeric';
  readonly target: NgNumericTarget;
  readonly op: NgNumericOp;
  readonly value: number;
  readonly value2?: number | undefined;
  readonly negate: boolean;
}

// ---------------------------------------------------------------------------
// Time condition
// ---------------------------------------------------------------------------

export const NgTimeTarget = {
  Weekday: 'weekday',
  Hour: 'hour',
  RelativeTime: 'relativeTime',
  Datetime: 'datetime',
} as const;
export type NgTimeTarget = (typeof NgTimeTarget)[keyof typeof NgTimeTarget];

export interface NgWeekdayValue {
  readonly days: readonly number[];
}
export interface NgHourValue {
  readonly from: number;
  readonly to: number;
}
export interface NgRelativeTimeValue {
  readonly withinMinutes: number;
}
export interface NgDatetimeValue {
  readonly from: string;
  readonly to: string;
}

export type NgTimeValue = NgWeekdayValue | NgHourValue | NgRelativeTimeValue | NgDatetimeValue;

export interface NgTimeCondition {
  readonly type: 'time';
  readonly target: NgTimeTarget;
  readonly value: NgTimeValue;
  readonly negate: boolean;
}

// ---------------------------------------------------------------------------
// Matching context
// ---------------------------------------------------------------------------

export interface NgMatchContext {
  readonly extractedFields: Record<NgStringField, string>;
  readonly numericValues: Record<string, number>;
  readonly parsedDate: Date | null;
  /** Optional rule ID for log messages (e.g. invalid regex) */
  readonly ruleId?: string;
}

// ---------------------------------------------------------------------------
// Unified rule
// ---------------------------------------------------------------------------

export type NgCondition = NgStringCondition | NgNumericCondition | NgTimeCondition;

export interface NgRule {
  readonly id: string;
  readonly condition: NgCondition;
  readonly target: NgTarget;
  readonly abonType: AbonType;
  readonly boardId?: string | undefined;
  readonly threadId?: string | undefined;
  readonly enabled: boolean;
  readonly label?: string | undefined;
}

// ---------------------------------------------------------------------------
// Legacy type (for migration from NGword.txt)
// ---------------------------------------------------------------------------

/** Match mode for legacy NG rules (NGword.txt format) */
export const NgMatchMode = {
  Plain: 'plain',
  Regexp: 'regexp',
} as const;
export type NgMatchMode = (typeof NgMatchMode)[keyof typeof NgMatchMode];

export interface NgLegacyRule {
  readonly id: string;
  readonly target?: NgTarget | undefined;
  readonly abonType: AbonType;
  readonly matchMode: NgMatchMode;
  readonly tokens: readonly string[];
  readonly boardId?: string | undefined;
  readonly threadId?: string | undefined;
  readonly enabled: boolean;
}
