/**
 * NG condition matching logic.
 * Shared between main (ng-abon) and renderer (ThreadView).
 */
import type {
  NgStringCondition,
  NgNumericCondition,
  NgTimeCondition,
  NgCondition,
  NgMatchContext,
  NgStringField,
} from '@shared/ng';
import {
  NgStringField as NgStringFieldEnum,
  NgStringMatchMode,
  NgNumericOp,
  NgTimeTarget,
} from '@shared/ng';

/** Check if token characters appear in order in text (fuzzy match) */
function fuzzyMatch(text: string, token: string): boolean {
  if (token.length === 0) return true;
  const lower = text.toLowerCase();
  let ti = 0;
  for (let i = 0; i < lower.length && ti < token.length; i++) {
    const tc = token[ti];
    if (tc !== undefined && lower[i] === tc.toLowerCase()) ti++;
  }
  return ti === token.length;
}

/**
 * Match string condition against extracted fields.
 */
export function matchStringCondition(
  condition: NgStringCondition,
  extractedFields: Record<NgStringField, string>,
  ruleId?: string,
): boolean {
  const text =
    condition.fields.length === 0 || condition.fields.includes(NgStringFieldEnum.All)
      ? extractedFields[NgStringFieldEnum.All]
      : condition.fields.map((f) => extractedFields[f]).join('\t');

  if (
    condition.matchMode === NgStringMatchMode.Regexp ||
    condition.matchMode === NgStringMatchMode.RegexpNoCase
  ) {
    const pattern = condition.tokens[0];
    if (pattern === undefined) return false;
    try {
      const regex = new RegExp(
        pattern,
        condition.matchMode === NgStringMatchMode.RegexpNoCase ? 'i' : '',
      );
      const matches = regex.test(text);
      return condition.negate ? !matches : matches;
    } catch {
      if (ruleId !== undefined && ruleId.length > 0) {
        console.warn(`Invalid regex pattern in NG rule ${ruleId}: ${pattern}`);
      }
      return false;
    }
  }
  if (condition.matchMode === NgStringMatchMode.Fuzzy) {
    const matches = condition.tokens.every((token: string) => fuzzyMatch(text, token));
    return condition.negate ? !matches : matches;
  }
  // Plain: all tokens must be present (case-insensitive)
  const lowerText = text.toLowerCase();
  const matches = condition.tokens.every((token) => lowerText.includes(token.toLowerCase()));
  return condition.negate ? !matches : matches;
}

/**
 * Match numeric condition against numeric values.
 */
export function matchNumericCondition(
  condition: NgNumericCondition,
  numericValues: Record<string, number>,
): boolean {
  const value = numericValues[condition.target] ?? 0;
  let result: boolean;
  switch (condition.op) {
    case NgNumericOp.Eq:
      result = value === condition.value;
      break;
    case NgNumericOp.Gte:
      result = value >= condition.value;
      break;
    case NgNumericOp.Lte:
      result = value <= condition.value;
      break;
    case NgNumericOp.Lt:
      result = value < condition.value;
      break;
    case NgNumericOp.Gt:
      result = value > condition.value;
      break;
    case NgNumericOp.Between: {
      const v2 = condition.value2 ?? condition.value;
      result = value >= condition.value && value <= v2;
      break;
    }
    default: {
      const _never: never = condition.op;
      return false;
    }
  }
  return condition.negate ? !result : result;
}

/**
 * Match time condition against parsed date.
 */
export function matchTimeCondition(condition: NgTimeCondition, parsedDate: Date | null): boolean {
  if (parsedDate === null) return false;
  const val = condition.value;
  let result: boolean;
  switch (condition.target) {
    case NgTimeTarget.Weekday:
      result = 'days' in val && val.days.includes(parsedDate.getDay());
      break;
    case NgTimeTarget.Hour:
      result = 'from' in val && 'to' in val;
      if (result) {
        const h = parsedDate.getHours();
        const from = (val as { from: number; to: number }).from;
        const to = (val as { from: number; to: number }).to;
        result = from <= to ? h >= from && h <= to : h >= from || h <= to;
      }
      break;
    case NgTimeTarget.RelativeTime:
      result =
        'withinMinutes' in val && (Date.now() - parsedDate.getTime()) / 60000 <= val.withinMinutes;
      break;
    case NgTimeTarget.Datetime:
      result = 'from' in val && 'to' in val;
      if (result) {
        const dTime = parsedDate.getTime();
        const from = (val as { from: string; to: string }).from;
        const to = (val as { from: string; to: string }).to;
        const fromTime = new Date(from).getTime();
        const toTime = new Date(to).getTime();
        result = dTime >= fromTime && dTime <= toTime;
      }
      break;
    default:
      return false;
  }
  return condition.negate ? !result : result;
}

/**
 * Match any condition against context.
 */
export function matchNgCondition(condition: NgCondition, context: NgMatchContext): boolean {
  switch (condition.type) {
    case 'string':
      return matchStringCondition(condition, context.extractedFields, context.ruleId);
    case 'numeric':
      return matchNumericCondition(condition, context.numericValues);
    case 'time':
      return matchTimeCondition(condition, context.parsedDate);
    default: {
      const _never: never = condition;
      return false;
    }
  }
}
