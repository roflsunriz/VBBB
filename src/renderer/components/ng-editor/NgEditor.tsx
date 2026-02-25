/**
 * NG (あぼーん) rule editor panel.
 * 3-tab UI: string / numeric / time conditions.
 * Left panel: condition input form, Right panel: existing rule list.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { mdiClose, mdiPlus, mdiDelete } from '@mdi/js';
import type {
  NgRule,
  NgStringCondition,
  NgNumericCondition,
  NgTimeCondition,
  NgCondition,
  NgStringField,
  NgStringMatchMode,
  NgNumericTarget,
  NgNumericOp,
  NgTimeTarget,
  NgTimeValue,
  AbonType,
  NgTarget,
} from '@shared/ng';
import {
  AbonType as AbonTypeEnum,
  NgTarget as NgTargetEnum,
  NgStringField as NgStringFieldEnum,
  NgStringMatchMode as NgStringMatchModeEnum,
  NgNumericTarget as NgNumericTargetEnum,
  NgNumericOp as NgNumericOpEnum,
  NgTimeTarget as NgTimeTargetEnum,
} from '@shared/ng';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

type ConditionTab = 'string' | 'numeric' | 'time';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Rule summary for display
// ---------------------------------------------------------------------------

function summarizeRule(rule: NgRule): string {
  const c = rule.condition;
  if (c.type === 'string') {
    const fieldLabel = c.fields.includes(NgStringFieldEnum.All as NgStringField)
      ? '全体'
      : c.fields.map(stringFieldLabel).join('+');
    const modeLabel = stringMatchModeLabel(c.matchMode);
    const neg = c.negate ? '否定 ' : '';
    return `[文字] ${neg}${fieldLabel} ${modeLabel}: "${c.tokens.join(' ')}"`;
  }
  if (c.type === 'numeric') {
    const neg = c.negate ? '否定 ' : '';
    const opLabel = numericOpLabel(c.op);
    const val2 =
      c.op === NgNumericOpEnum.Between && c.value2 !== undefined
        ? `～${String(c.value2)}`
        : '';
    return `[数値] ${neg}${numericTargetLabel(c.target)} ${opLabel} ${String(c.value)}${val2}`;
  }
  const neg = c.negate ? '否定 ' : '';
  return `[時間] ${neg}${timeTargetLabel(c.target)}`;
}

function stringFieldLabel(f: NgStringField): string {
  const labels: Record<NgStringField, string> = {
    name: '名前',
    body: '本文',
    mail: 'メール',
    id: 'ID',
    trip: 'トリップ',
    watchoi: 'ﾜｯﾁｮｲ',
    ip: 'IP',
    be: 'BE',
    url: 'URL',
    threadTitle: 'スレタイ',
    all: '全体',
  };
  return labels[f];
}

function stringMatchModeLabel(m: NgStringMatchMode): string {
  const labels: Record<NgStringMatchMode, string> = {
    plain: '単純比較',
    regexp: '正規表現',
    regexp_nocase: '正規表現(大小無視)',
    fuzzy: 'あいまい',
  };
  return labels[m];
}

function numericTargetLabel(t: NgNumericTarget): string {
  const labels: Record<NgNumericTarget, string> = {
    resNumber: 'レス番号',
    lineCount: '改行数',
    charCount: '文字数',
    idCount: 'ID数',
    replyCount: '返信数',
    repliedCount: '被返信数',
    threadMomentum: '勢い',
    threadResCount: 'レス数',
  };
  return labels[t];
}

function numericOpLabel(op: NgNumericOp): string {
  const labels: Record<NgNumericOp, string> = {
    eq: '=',
    gte: '≧',
    lte: '≦',
    lt: '<',
    gt: '>',
    between: '範囲',
  };
  return labels[op];
}

function timeTargetLabel(t: NgTimeTarget): string {
  const labels: Record<NgTimeTarget, string> = {
    weekday: '投稿曜日',
    hour: '投稿時間',
    relativeTime: '相対時間',
    datetime: '投稿日時',
  };
  return labels[t];
}

// ---------------------------------------------------------------------------
// Rule row
// ---------------------------------------------------------------------------

function NgRuleRow({
  rule,
  onRemove,
  onToggle,
}: {
  readonly rule: NgRule;
  readonly onRemove: (id: string) => void;
  readonly onToggle: (id: string) => void;
}): React.JSX.Element {
  const abonLabel = rule.abonType === AbonTypeEnum.Transparent ? '透明' : '通常';
  const targetLabel =
    rule.target === NgTargetEnum.Thread
      ? '[スレ]'
      : rule.target === NgTargetEnum.Board
        ? '[板]'
        : '[レス]';

  return (
    <div className="flex items-center gap-1.5 border-b border-[var(--color-border-secondary)] px-2 py-1 text-xs">
      <button
        type="button"
        onClick={() => {
          onToggle(rule.id);
        }}
        className={`shrink-0 rounded border px-1 py-0.5 text-[10px] ${
          rule.enabled
            ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
            : 'border-[var(--color-border-secondary)] text-[var(--color-text-muted)]'
        }`}
        title={rule.enabled ? '有効 (クリックで無効化)' : '無効 (クリックで有効化)'}
      >
        {rule.enabled ? 'ON' : 'OFF'}
      </button>
      <span
        className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${
          rule.abonType === AbonTypeEnum.Transparent
            ? 'bg-[var(--color-error)]/15 text-[var(--color-error)]'
            : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
        }`}
      >
        {abonLabel}
      </span>
      <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{targetLabel}</span>
      <span className="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
        {rule.label !== undefined && rule.label.length > 0 ? rule.label : summarizeRule(rule)}
      </span>
      <button
        type="button"
        onClick={() => {
          onRemove(rule.id);
        }}
        className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
        aria-label="削除"
      >
        <MdiIcon path={mdiDelete} size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// String condition form
// ---------------------------------------------------------------------------

const STRING_FIELDS: readonly { value: NgStringField; label: string }[] = [
  { value: NgStringFieldEnum.All, label: '全体' },
  { value: NgStringFieldEnum.Name, label: '名前' },
  { value: NgStringFieldEnum.Body, label: '本文' },
  { value: NgStringFieldEnum.Mail, label: 'メール' },
  { value: NgStringFieldEnum.Id, label: 'ID' },
  { value: NgStringFieldEnum.Trip, label: 'トリップ' },
  { value: NgStringFieldEnum.Watchoi, label: 'ﾜｯﾁｮｲ' },
  { value: NgStringFieldEnum.Ip, label: 'IP' },
  { value: NgStringFieldEnum.Be, label: 'BE' },
  { value: NgStringFieldEnum.Url, label: 'URL' },
  { value: NgStringFieldEnum.ThreadTitle, label: 'スレタイ' },
];

function StringConditionForm({
  onAdd,
  initialToken,
}: {
  readonly onAdd: (condition: NgCondition) => void;
  readonly initialToken: string;
}): React.JSX.Element {
  const [matchMode, setMatchMode] = useState<NgStringMatchMode>(NgStringMatchModeEnum.Plain);
  const [fields, setFields] = useState<readonly NgStringField[]>([NgStringFieldEnum.All]);
  const [negate, setNegate] = useState(false);
  const [token, setToken] = useState(initialToken);

  useEffect(() => {
    if (initialToken.length > 0) setToken(initialToken);
  }, [initialToken]);

  const toggleField = useCallback((f: NgStringField) => {
    setFields((prev) => {
      if (f === NgStringFieldEnum.All) return [NgStringFieldEnum.All];
      const without = prev.filter((x) => x !== NgStringFieldEnum.All && x !== f);
      if (prev.includes(f)) return without.length > 0 ? without : [NgStringFieldEnum.All];
      return [...without, f];
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (token.trim().length === 0) return;
    const tokens =
      matchMode === NgStringMatchModeEnum.Regexp || matchMode === NgStringMatchModeEnum.RegexpNoCase
        ? [token.trim()]
        : token.trim().split(/\s+/);
    const condition: NgStringCondition = {
      type: 'string',
      matchMode,
      fields,
      tokens,
      negate,
    };
    onAdd(condition);
    setToken('');
  }, [token, matchMode, fields, negate, onAdd]);

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[var(--color-text-muted)]">検索方法:</span>
        <select
          value={matchMode}
          onChange={(e) => {
            setMatchMode(e.target.value as NgStringMatchMode);
          }}
          className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
        >
          <option value="plain">単純比較</option>
          <option value="regexp">正規表現</option>
          <option value="regexp_nocase">正規表現(大小無視)</option>
          <option value="fuzzy">あいまい</option>
        </select>
        <label className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={negate}
            onChange={(e) => {
              setNegate(e.target.checked);
            }}
            className="accent-[var(--color-accent)]"
          />
          否定
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="shrink-0 text-[var(--color-text-muted)]">対象:</span>
        {STRING_FIELDS.map((f) => (
          <label
            key={f.value}
            className="flex items-center gap-0.5 text-[var(--color-text-secondary)]"
          >
            <input
              type="checkbox"
              checked={fields.includes(f.value)}
              onChange={() => {
                toggleField(f.value);
              }}
              className="accent-[var(--color-accent)]"
            />
            {f.label}
          </label>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          placeholder={
            matchMode === NgStringMatchModeEnum.Regexp ||
            matchMode === NgStringMatchModeEnum.RegexpNoCase
              ? '正規表現パターン'
              : 'NGワード (スペース区切り=AND)'
          }
          className="min-w-0 flex-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={token.trim().length === 0}
          className="flex items-center gap-0.5 rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          <MdiIcon path={mdiPlus} size={12} />
          追加
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numeric condition form
// ---------------------------------------------------------------------------

const NUMERIC_TARGETS: readonly { value: NgNumericTarget; label: string }[] = [
  { value: NgNumericTargetEnum.ResNumber, label: 'レス番号' },
  { value: NgNumericTargetEnum.LineCount, label: '改行数' },
  { value: NgNumericTargetEnum.CharCount, label: '文字数' },
  { value: NgNumericTargetEnum.IdCount, label: 'ID数' },
  { value: NgNumericTargetEnum.ReplyCount, label: '返信数' },
  { value: NgNumericTargetEnum.RepliedCount, label: '被返信数' },
  { value: NgNumericTargetEnum.ThreadMomentum, label: 'スレッドの勢い' },
  { value: NgNumericTargetEnum.ThreadResCount, label: 'スレッドのレス数' },
];

const NUMERIC_OPS: readonly { value: NgNumericOp; label: string }[] = [
  { value: NgNumericOpEnum.Eq, label: '同数 (=)' },
  { value: NgNumericOpEnum.Gte, label: '以上 (≧)' },
  { value: NgNumericOpEnum.Lte, label: '以下 (≦)' },
  { value: NgNumericOpEnum.Lt, label: '未満 (<)' },
  { value: NgNumericOpEnum.Gt, label: '超過 (>)' },
  { value: NgNumericOpEnum.Between, label: '範囲' },
];

function NumericConditionForm({
  onAdd,
}: {
  readonly onAdd: (condition: NgCondition) => void;
}): React.JSX.Element {
  const [target, setTarget] = useState<NgNumericTarget>(NgNumericTargetEnum.ResNumber);
  const [op, setOp] = useState<NgNumericOp>(NgNumericOpEnum.Gte);
  const [value, setValue] = useState(0);
  const [value2, setValue2] = useState(0);
  const [negate, setNegate] = useState(false);

  const handleAdd = useCallback(() => {
    const condition: NgNumericCondition = {
      type: 'numeric',
      target,
      op,
      value,
      ...(op === NgNumericOpEnum.Between ? { value2 } : {}),
      negate,
    };
    onAdd(condition);
  }, [target, op, value, value2, negate, onAdd]);

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[var(--color-text-muted)]">対象:</span>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value as NgNumericTarget);
          }}
          className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
        >
          {NUMERIC_TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={negate}
            onChange={(e) => {
              setNegate(e.target.checked);
            }}
            className="accent-[var(--color-accent)]"
          />
          否定
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[var(--color-text-muted)]">範囲:</span>
        <select
          value={op}
          onChange={(e) => {
            setOp(e.target.value as NgNumericOp);
          }}
          className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
        >
          {NUMERIC_OPS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
          }}
          className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
        />
        {op === NgNumericOpEnum.Between && (
          <>
            <span className="text-[var(--color-text-muted)]">～</span>
            <input
              type="number"
              value={value2}
              onChange={(e) => {
                setValue2(Number(e.target.value));
              }}
              className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
            />
          </>
        )}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="flex w-fit items-center gap-0.5 rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white hover:opacity-90"
      >
        <MdiIcon path={mdiPlus} size={12} />
        追加
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time condition form
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function TimeConditionForm({
  onAdd,
}: {
  readonly onAdd: (condition: NgCondition) => void;
}): React.JSX.Element {
  const [target, setTarget] = useState<NgTimeTarget>(NgTimeTargetEnum.Weekday);
  const [negate, setNegate] = useState(false);
  const [weekdays, setWeekdays] = useState<readonly number[]>([]);
  const [hourFrom, setHourFrom] = useState(0);
  const [hourTo, setHourTo] = useState(23);
  const [relativeMinutes, setRelativeMinutes] = useState(60);
  const [datetimeFrom, setDatetimeFrom] = useState('');
  const [datetimeTo, setDatetimeTo] = useState('');

  const toggleWeekday = useCallback((day: number) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);

  const handleAdd = useCallback(() => {
    let value: NgTimeValue;
    switch (target) {
      case NgTimeTargetEnum.Weekday:
        if (weekdays.length === 0) return;
        value = { days: weekdays };
        break;
      case NgTimeTargetEnum.Hour:
        value = { from: hourFrom, to: hourTo };
        break;
      case NgTimeTargetEnum.RelativeTime:
        value = { withinMinutes: relativeMinutes };
        break;
      case NgTimeTargetEnum.Datetime:
        if (datetimeFrom.length === 0 || datetimeTo.length === 0) return;
        value = { from: datetimeFrom, to: datetimeTo };
        break;
      default: {
        const _: never = target;
        return _;
      }
    }

    const condition: NgTimeCondition = {
      type: 'time',
      target,
      value,
      negate,
    };
    onAdd(condition);
  }, [target, negate, weekdays, hourFrom, hourTo, relativeMinutes, datetimeFrom, datetimeTo]);

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, i) => i),
    [],
  );

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[var(--color-text-muted)]">対象:</span>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value as NgTimeTarget);
          }}
          className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
        >
          <option value="weekday">投稿曜日</option>
          <option value="hour">投稿時間</option>
          <option value="relativeTime">相対時間</option>
          <option value="datetime">投稿日時</option>
        </select>
        <label className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={negate}
            onChange={(e) => {
              setNegate(e.target.checked);
            }}
            className="accent-[var(--color-accent)]"
          />
          否定
        </label>
      </div>

      {target === NgTimeTargetEnum.Weekday && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <label
              key={label}
              className="flex items-center gap-0.5 text-[var(--color-text-secondary)]"
            >
              <input
                type="checkbox"
                checked={weekdays.includes(i)}
                onChange={() => {
                  toggleWeekday(i);
                }}
                className="accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {target === NgTimeTargetEnum.Hour && (
        <div className="flex items-center gap-1.5">
          <select
            value={hourFrom}
            onChange={(e) => {
              setHourFrom(Number(e.target.value));
            }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
          >
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {String(h)}時
              </option>
            ))}
          </select>
          <span className="text-[var(--color-text-muted)]">～</span>
          <select
            value={hourTo}
            onChange={(e) => {
              setHourTo(Number(e.target.value));
            }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
          >
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {String(h)}時
              </option>
            ))}
          </select>
        </div>
      )}

      {target === NgTimeTargetEnum.RelativeTime && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={relativeMinutes}
            onChange={(e) => {
              setRelativeMinutes(Number(e.target.value));
            }}
            min={1}
            className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
          />
          <span className="text-[var(--color-text-muted)]">分以内</span>
        </div>
      )}

      {target === NgTimeTargetEnum.Datetime && (
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={datetimeFrom}
            onChange={(e) => {
              setDatetimeFrom(e.target.value);
            }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
          />
          <span className="text-[var(--color-text-muted)]">～</span>
          <input
            type="datetime-local"
            value={datetimeTo}
            onChange={(e) => {
              setDatetimeTo(e.target.value);
            }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="flex w-fit items-center gap-0.5 rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white hover:opacity-90"
      >
        <MdiIcon path={mdiPlus} size={12} />
        追加
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor component
// ---------------------------------------------------------------------------

interface NgEditorProps {
  readonly onClose?: () => void;
}

export function NgEditor({ onClose }: NgEditorProps = {}): React.JSX.Element {
  const ngRules = useBBSStore((s) => s.ngRules);
  const addNgRule = useBBSStore((s) => s.addNgRule);
  const removeNgRule = useBBSStore((s) => s.removeNgRule);
  const fetchNgRules = useBBSStore((s) => s.fetchNgRules);
  const toggleNgEditor = useBBSStore((s) => s.toggleNgEditor);
  const saveFn = useBBSStore((s) => s.saveNgRules);
  const ngEditorInitialToken = useBBSStore((s) => s.ngEditorInitialToken);
  const ngEditorInitialBoardId = useBBSStore((s) => s.ngEditorInitialBoardId);
  const ngEditorInitialThreadId = useBBSStore((s) => s.ngEditorInitialThreadId);
  const handleClose = onClose ?? toggleNgEditor;

  const [activeTab, setActiveTab] = useState<ConditionTab>('string');
  const [newTarget, setNewTarget] = useState<NgTarget>(NgTargetEnum.Response);
  const [newAbonType, setNewAbonType] = useState<AbonType>(AbonTypeEnum.Normal);
  const [newBoardId, setNewBoardId] = useState('');
  const [newThreadId, setNewThreadId] = useState('');

  useEffect(() => {
    if (ngEditorInitialBoardId.length > 0) setNewBoardId(ngEditorInitialBoardId);
    if (ngEditorInitialThreadId.length > 0) setNewThreadId(ngEditorInitialThreadId);
  }, [ngEditorInitialBoardId, ngEditorInitialThreadId]);

  useEffect(() => {
    void fetchNgRules();
  }, [fetchNgRules]);

  const handleAddCondition = useCallback(
    (condition: NgCondition) => {
      const rule: NgRule = {
        id: generateId(),
        condition,
        target: newTarget,
        abonType: newAbonType,
        boardId: newBoardId.length > 0 ? newBoardId : undefined,
        threadId: newThreadId.length > 0 ? newThreadId : undefined,
        enabled: true,
      };
      void addNgRule(rule);
      setNewThreadId('');
    },
    [newTarget, newAbonType, newBoardId, newThreadId, addNgRule],
  );

  const handleRemove = useCallback(
    (id: string) => {
      void removeNgRule(id);
    },
    [removeNgRule],
  );

  const handleToggleEnabled = useCallback(
    (id: string) => {
      const updated = ngRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      void saveFn(updated);
    },
    [ngRules, saveFn],
  );

  const isInline = onClose === undefined;
  const [panelHeight, setPanelHeight] = useState(320);
  const handlePanelResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.max(200, Math.min(window.innerHeight * 0.7, prev - deltaY)));
  }, []);

  const filteredRules = useMemo(() => {
    return ngRules.filter((r) => r.condition.type === activeTab);
  }, [ngRules, activeTab]);

  return (
    <>
      {isInline && <TopResizeHandle onResize={handlePanelResize} />}
      <div
        className={`flex flex-col overflow-hidden border-l border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]${isInline ? '' : ' h-80 min-h-48 max-h-[70vh]'}`}
        style={isInline ? { height: panelHeight } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-3 py-1.5">
          <h3 className="text-xs font-medium text-[var(--color-text-primary)]">NG ルール管理</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="閉じる"
          >
            <MdiIcon path={mdiClose} size={14} />
          </button>
        </div>

        {/* Condition type tabs */}
        <div className="flex border-b border-[var(--color-border-primary)]">
          {(
            [
              { key: 'string', label: '文字列' },
              { key: 'numeric', label: '数値' },
              { key: 'time', label: '時間' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium ${
                activeTab === tab.key
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Two-column layout: left = form, right = rule list */}
        <div className="flex min-h-0 flex-1">
          {/* Left: Condition form */}
          <div className="flex w-1/2 flex-col gap-2 overflow-y-auto border-r border-[var(--color-border-secondary)] p-2">
            {/* Common settings */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <select
                value={newTarget}
                onChange={(e) => {
                  setNewTarget(e.target.value as NgTarget);
                }}
                className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
              >
                <option value="response">レス対象</option>
                <option value="thread">スレッド対象</option>
                <option value="board">板対象</option>
              </select>
              <select
                value={newAbonType}
                onChange={(e) => {
                  setNewAbonType(e.target.value as AbonType);
                }}
                className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
              >
                <option value="normal">通常あぼーん</option>
                <option value="transparent">透明あぼーん</option>
              </select>
              <input
                type="text"
                value={newBoardId}
                onChange={(e) => {
                  setNewBoardId(e.target.value);
                }}
                placeholder="板ID"
                className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
              />
              <input
                type="text"
                value={newThreadId}
                onChange={(e) => {
                  setNewThreadId(e.target.value);
                }}
                placeholder="スレID"
                className="w-24 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
              />
            </div>

            {/* Tab-specific form */}
            {activeTab === 'string' && (
              <StringConditionForm
                onAdd={handleAddCondition}
                initialToken={ngEditorInitialToken}
              />
            )}
            {activeTab === 'numeric' && <NumericConditionForm onAdd={handleAddCondition} />}
            {activeTab === 'time' && <TimeConditionForm onAdd={handleAddCondition} />}
          </div>

          {/* Right: Rule list */}
          <div className="flex w-1/2 flex-col overflow-y-auto">
            {filteredRules.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                {activeTab === 'string'
                  ? '文字列ルールはありません'
                  : activeTab === 'numeric'
                    ? '数値ルールはありません'
                    : '時間ルールはありません'}
              </p>
            ) : (
              filteredRules.map((rule) => (
                <NgRuleRow
                  key={rule.id}
                  rule={rule}
                  onRemove={handleRemove}
                  onToggle={handleToggleEnabled}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
