/**
 * Parser for the VBBB DSL (.vbbs) used in programmatic posting.
 *
 * Grammar overview:
 *   script      = global_stmt* post_block+
 *   global_stmt = SCHEDULE <datetime> | COUNTDOWN <number>
 *   post_block  = POST post_stmt* MESSAGE_BODY END
 *   post_stmt   = NAME [value] | MAIL [value]
 *               | REPEAT <number> | INTERVAL <number>
 *               | MESSAGE <single-line-value>
 *   MESSAGE_BODY = MESSAGE (multi-line until END)
 *
 * Rules:
 *   - Lines starting with # (after optional whitespace) are comments.
 *   - Keywords are case-insensitive.
 *   - NAME / MAIL with no value produce an empty string.
 *   - MESSAGE with a value on the same line → single-line message; END closes only the POST block.
 *   - MESSAGE with no value → multi-line mode; subsequent lines are message content until END.
 *   - END on a standalone line closes both the multi-line message and the POST block.
 */

import type { DslParseError, DslParseResult, DslPost, DslScript } from '../../types/dsl';

/** Strip inline comment and trim whitespace */
function stripComment(raw: string): string {
  const idx = raw.indexOf('#');
  return (idx === -1 ? raw : raw.slice(0, idx)).trim();
}

/** Extract the value portion after a keyword prefix (handles both "KW value" and bare "KW") */
function valueAfter(line: string, keyword: string): string {
  return line.slice(keyword.length).trim();
}

export function parseDslScript(source: string): DslParseResult {
  const errors: DslParseError[] = [];
  const rawLines = source.split(/\r?\n/);

  let scheduleAt: Date | undefined;
  let countdownSec: number | undefined;
  const posts: DslPost[] = [];

  let i = 0;

  while (i < rawLines.length) {
    const rawLine = rawLines[i] ?? '';
    i++;
    const lineNo = i; // 1-based

    const line = stripComment(rawLine);
    if (line.length === 0) continue;

    const upper = line.toUpperCase();

    if (upper.startsWith('SCHEDULE')) {
      const val = valueAfter(line, 'SCHEDULE').trim();
      if (val.length === 0) {
        errors.push({
          line: lineNo,
          message: 'SCHEDULEに値が必要です (例: SCHEDULE 2026-03-01T10:00:00)',
        });
        continue;
      }
      const date = new Date(val);
      if (!Number.isFinite(date.getTime())) {
        errors.push({
          line: lineNo,
          message: `SCHEDULEの日時形式が無効です: "${val}" (ISO 8601形式で指定してください)`,
        });
      } else {
        scheduleAt = date;
      }
    } else if (upper.startsWith('COUNTDOWN')) {
      const val = valueAfter(line, 'COUNTDOWN').trim();
      if (val.length === 0) {
        errors.push({ line: lineNo, message: 'COUNTDOWNに値が必要です (例: COUNTDOWN 10)' });
        continue;
      }
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          line: lineNo,
          message: `COUNTDOWNの値が無効です: "${val}" (0以上の数値を指定してください)`,
        });
      } else {
        countdownSec = n;
      }
    } else if (upper === 'POST') {
      // Parse a POST...END block
      let name = '';
      let mail = '';
      let message: string | undefined;
      let repeat = 1;
      let intervalSec: number | undefined;

      let foundEnd = false;

      while (i < rawLines.length) {
        const rawPostLine = rawLines[i] ?? '';
        i++;
        const postLineNo = i;

        const postLine = stripComment(rawPostLine);
        const postUpper = postLine.toUpperCase();

        if (postLine.length === 0) continue;

        if (postUpper === 'END') {
          foundEnd = true;
          break;
        }

        if (postUpper.startsWith('NAME')) {
          name = valueAfter(postLine, 'NAME');
        } else if (postUpper.startsWith('MAIL')) {
          mail = valueAfter(postLine, 'MAIL');
        } else if (postUpper.startsWith('REPEAT')) {
          const val = valueAfter(postLine, 'REPEAT');
          const n = Number(val);
          if (!Number.isFinite(n) || n < 1) {
            errors.push({
              line: postLineNo,
              message: `REPEATの値が無効です: "${val}" (1以上の整数を指定してください)`,
            });
          } else {
            repeat = Math.floor(n);
          }
        } else if (postUpper.startsWith('INTERVAL')) {
          const val = valueAfter(postLine, 'INTERVAL');
          const n = Number(val);
          if (!Number.isFinite(n) || n < 0) {
            errors.push({
              line: postLineNo,
              message: `INTERVALの値が無効です: "${val}" (0以上の数値を指定してください)`,
            });
          } else {
            intervalSec = n;
          }
        } else if (postUpper.startsWith('MESSAGE')) {
          // Extract value from the raw (un-stripped) line so that '#' in
          // message content is preserved as-is, not treated as a comment.
          const rawTrimmed = rawPostLine.replace(/^\s+/u, '');
          // MESSAGE keyword is always 7 characters regardless of case
          const inlineVal = rawTrimmed.slice(7).replace(/^\s+/u, '').replace(/\s+$/u, '');
          if (inlineVal.length > 0) {
            // Single-line: MESSAGE <value>
            message = inlineVal;
          } else {
            // Multi-line: collect lines until END
            const bodyLines: string[] = [];
            while (i < rawLines.length) {
              const rawBodyLine = rawLines[i] ?? '';
              i++;
              // END on its own line (possibly with comment) closes both message and POST
              if (stripComment(rawBodyLine).toUpperCase() === 'END') {
                foundEnd = true;
                break;
              }
              bodyLines.push(rawBodyLine);
            }
            // Trim leading/trailing blank lines from message body
            let start = 0;
            let end = bodyLines.length - 1;
            while (start <= end && (bodyLines[start] ?? '').trim().length === 0) start++;
            while (end >= start && (bodyLines[end] ?? '').trim().length === 0) end--;
            message = bodyLines.slice(start, end + 1).join('\n');
            if (foundEnd) break;
          }
        } else {
          const kw = postLine.split(/\s/u)[0] ?? postLine;
          errors.push({ line: postLineNo, message: `不明なキーワードです: "${kw}"` });
        }
      }

      if (!foundEnd) {
        errors.push({ line: lineNo, message: 'POSTブロックにENDがありません' });
      }

      if (message === undefined || message.length === 0) {
        errors.push({ line: lineNo, message: 'POSTブロックにMESSAGEが必要です' });
        // Push placeholder to avoid cascading errors
        posts.push({ name, mail, message: '', repeat, intervalSec });
      } else {
        posts.push({ name, mail, message, repeat, intervalSec });
      }
    } else {
      const kw = line.split(/\s/u)[0] ?? line;
      errors.push({ line: lineNo, message: `不明なキーワードです: "${kw}"` });
    }
  }

  if (posts.length === 0 && errors.length === 0) {
    errors.push({ line: 0, message: 'POSTブロックが1つも存在しません' });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const script: DslScript = { scheduleAt, countdownSec, posts };
  return { ok: true, script };
}

/**
 * DSL specification text displayed in the download file.
 * Version should be bumped when grammar changes.
 */
export const DSL_SPEC_TEXT = `\
VBBB DSL 仕様書 v1.0
======================

ファイル拡張子: .vbbs
文字コード: UTF-8
改行コード: LF または CRLF


概要
----
VBBB DSL は、プログラマティック書き込み機能で使用する独自スクリプト言語です。
テキストファイルに記述し、VBBB の「DSL」タブから読み込んで実行します。


書式の基本ルール
----------------
- # から行末まではコメントとして無視されます。
- キーワードは大文字・小文字を区別しません（NAME / name / Name はすべて同じ）。
- 行頭・行末の余分な空白は無視されます。
- 空行は無視されます。


グローバル設定（省略可）
------------------------

  SCHEDULE <日時>
    指定した日時になるまで待機してから実行を開始します。
    日時は ISO 8601 形式（例: 2026-03-01T10:00:00）またはブラウザが解釈できる
    任意の日時文字列（例: 2026-03-01 10:00:00）で指定します。
    省略した場合は即時実行します。

  COUNTDOWN <秒>
    最初の投稿を開始する前に指定秒数だけ待機します。
    SCHEDULE と併用した場合、SCHEDULE の待機後にさらに COUNTDOWN 分待機します。
    省略した場合は待機しません。


投稿ブロック（1個以上必須）
----------------------------

  POST
    ...
  END

  POST と END の間に以下のキーワードを記述します。
  MESSAGE は必須です。その他は省略可能です。
  キーワードの順序は自由ですが、MESSAGE はブロック内で最後に記述することを推奨します。

  NAME <名前>
    投稿者名を指定します。省略または値なし（NAME のみ）で空欄（名無し）になります。

  MAIL <メールアドレス>
    メール欄を指定します。省略または値なし（MAIL のみ）で空欄になります。
    sage 投稿にする場合は MAIL sage と記述します。

  REPEAT <回数>
    この投稿ブロックを指定回数繰り返します。デフォルトは 1（繰り返しなし）です。
    繰り返し間の待機には INTERVAL を使用します。

  INTERVAL <秒>
    この投稿ブロックの実行後、次の投稿（繰り返し含む）まで待機する秒数を指定します。
    省略した場合は待機しません。
    ※ 最後の投稿の後には INTERVAL による待機は発生しません。

  MESSAGE <本文>  （1行形式）
    本文を1行で指定します。例: MESSAGE テスト投稿です

  MESSAGE  （複数行形式）
    MESSAGE を単独行で記述した場合、続く行が本文になります。
    本文は END 行で終了します（END は投稿ブロックも同時に閉じます）。
    例:
      MESSAGE
      1行目の本文
      2行目の本文
      END
    ※ 本文内に "END" とだけ書いた行を含めることはできません。


サンプルスクリプト
------------------

# 指定日時にカウントダウン付きで3回同じ内容を投稿する例
SCHEDULE 2026-03-01T10:00:00
COUNTDOWN 5

POST
NAME テスト太郎
MAIL sage
REPEAT 3
INTERVAL 60
MESSAGE これはテスト投稿です
END

# 複数行本文の例
POST
NAME
MAIL
INTERVAL 30
MESSAGE
1行目
2行目
3行目
END

# 即時・1回・間隔なし（最小構成）
POST
MESSAGE こんにちは
END
`;
