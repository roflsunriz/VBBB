/**
 * Cookie, Monakey, User-Agent, and domain management panel.
 * Provides UI to view/delete cookies, change user agent, configure BBS menu URLs,
 * and set the 5ch base domain.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  mdiClose,
  mdiDelete,
  mdiCookie,
  mdiWeb,
  mdiFormatListBulleted,
  mdiDomain,
} from '@mdi/js';
import type { StoredCookie } from '@shared/cookie';
import { MdiIcon } from '../common/MdiIcon';

interface CookieManagerProps {
  readonly onClose: () => void;
}

type CookieTab = 'cookies' | 'useragent' | 'bbsmenu' | 'domain';

export function CookieManager({ onClose }: CookieManagerProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<CookieTab>('cookies');
  const [cookies, setCookies] = useState<readonly StoredCookie[]>([]);
  const [userAgent, setUserAgent] = useState('');
  const [originalUserAgent, setOriginalUserAgent] = useState('');
  const [bbsMenuUrlsText, setBbsMenuUrlsText] = useState('');
  const [originalBbsMenuUrlsText, setOriginalBbsMenuUrlsText] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [originalDomain, setOriginalDomain] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Load data on mount
  useEffect(() => {
    void (async () => {
      try {
        const [allCookies, currentUA, bbsMenuUrls, currentDomain] = await Promise.all([
          window.electronApi.invoke('cookie:get-all'),
          window.electronApi.invoke('config:get-user-agent'),
          window.electronApi.invoke('config:get-bbs-menu-urls'),
          window.electronApi.invoke('config:get-5ch-domain'),
        ]);
        const urlsText = bbsMenuUrls.join('\n');
        setCookies(allCookies);
        setUserAgent(currentUA);
        setOriginalUserAgent(currentUA);
        setBbsMenuUrlsText(urlsText);
        setOriginalBbsMenuUrlsText(urlsText);
        setDomainInput(currentDomain);
        setOriginalDomain(currentDomain);
      } catch {
        setStatusMessage('Failed to load settings');
      }
    })();
  }, []);

  const handleDeleteCookie = useCallback(async (name: string, domain: string) => {
    try {
      await window.electronApi.invoke('cookie:remove', name, domain);
      setCookies((prev) => prev.filter((c) => !(c.name === name && c.domain === domain)));
      setStatusMessage('Cookie removed');
    } catch {
      setStatusMessage('Failed to remove cookie');
    }
  }, []);

  const handleSaveUserAgent = useCallback(async () => {
    try {
      await window.electronApi.invoke('config:set-user-agent', userAgent);
      setOriginalUserAgent(userAgent);
      setStatusMessage('User-Agent saved');
    } catch {
      setStatusMessage('Failed to save User-Agent');
    }
  }, [userAgent]);

  const handleResetUserAgent = useCallback(() => {
    setUserAgent(originalUserAgent);
  }, [originalUserAgent]);

  const handleSaveBbsMenuUrls = useCallback(async () => {
    const normalized = Array.from(
      new Set(
        bbsMenuUrlsText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      ),
    );
    try {
      await window.electronApi.invoke('config:set-bbs-menu-urls', normalized);
      const saved = await window.electronApi.invoke('config:get-bbs-menu-urls');
      const savedText = saved.join('\n');
      setBbsMenuUrlsText(savedText);
      setOriginalBbsMenuUrlsText(savedText);
      setStatusMessage('BBS メニュー URL を保存しました');
    } catch {
      setStatusMessage('BBS メニュー URL の保存に失敗しました');
    }
  }, [bbsMenuUrlsText]);

  const handleResetBbsMenuUrls = useCallback(() => {
    setBbsMenuUrlsText(originalBbsMenuUrlsText);
  }, [originalBbsMenuUrlsText]);

  const handleSaveDomain = useCallback(async () => {
    const trimmed = domainInput.trim();
    if (trimmed.length === 0) {
      setStatusMessage('ドメインを入力してください');
      return;
    }
    try {
      await window.electronApi.invoke('config:set-5ch-domain', trimmed);
      const saved = await window.electronApi.invoke('config:get-5ch-domain');
      setDomainInput(saved);
      setOriginalDomain(saved);
      setStatusMessage('5ch ドメインを保存しました。認証 Cookie は再設定が必要です。');
    } catch {
      setStatusMessage('5ch ドメインの保存に失敗しました');
    }
  }, [domainInput]);

  const handleResetDomain = useCallback(() => {
    setDomainInput(originalDomain);
  }, [originalDomain]);

  // Group cookies by domain
  const groupedCookies = cookies.reduce<Record<string, StoredCookie[]>>((acc, cookie) => {
    const key = cookie.domain;
    const existing = acc[key];
    if (existing !== undefined) {
      existing.push(cookie);
    } else {
      acc[key] = [cookie];
    }
    return acc;
  }, {});

  const previewDomain = domainInput.trim().length > 0 ? domainInput.trim() : '(未入力)';

  return (
    <div className="flex h-full flex-col rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-4 py-2">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Cookie / UA 管理</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
        >
          <MdiIcon path={mdiClose} size={14} className="text-[var(--color-text-muted)]" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('cookies');
          }}
          className={`flex items-center gap-1 px-4 py-2 text-xs ${
            activeTab === 'cookies'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <MdiIcon path={mdiCookie} size={14} />
          Cookie / Monakey
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('useragent');
          }}
          className={`flex items-center gap-1 px-4 py-2 text-xs ${
            activeTab === 'useragent'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <MdiIcon path={mdiWeb} size={14} />
          User-Agent
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('bbsmenu');
          }}
          className={`flex items-center gap-1 px-4 py-2 text-xs ${
            activeTab === 'bbsmenu'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <MdiIcon path={mdiFormatListBulleted} size={14} />
          BBSメニューURL
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('domain');
          }}
          className={`flex items-center gap-1 px-4 py-2 text-xs ${
            activeTab === 'domain'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <MdiIcon path={mdiDomain} size={14} />
          ドメイン
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'cookies' && (
          <div className="space-y-3">
            {Object.keys(groupedCookies).length === 0 ? (
              <p className="text-center text-xs text-[var(--color-text-muted)]">
                Cookie はありません
              </p>
            ) : (
              Object.entries(groupedCookies).map(([domain, domainCookies]) => (
                <div
                  key={domain}
                  className="rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]"
                >
                  <div className="border-b border-[var(--color-border-secondary)] px-3 py-1.5">
                    <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                      {domain}
                    </span>
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      ({domainCookies.length})
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--color-border-secondary)]">
                    {domainCookies.map((cookie) => (
                      <div
                        key={`${cookie.domain}-${cookie.name}`}
                        className="flex items-center justify-between px-3 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-[var(--color-text-primary)]">
                            {cookie.name}
                          </span>
                          <span className="ml-2 truncate text-xs text-[var(--color-text-muted)]">
                            {cookie.value.length > 60
                              ? `${cookie.value.substring(0, 60)}...`
                              : cookie.value}
                          </span>
                          {cookie.expires !== undefined && (
                            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                              Exp: {new Date(cookie.expires).toLocaleDateString('ja-JP')}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteCookie(cookie.name, cookie.domain);
                          }}
                          className="ml-2 shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
                          title="Cookie を削除"
                        >
                          <MdiIcon path={mdiDelete} size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'useragent' && (
          <div className="space-y-3">
            <div>
              <label
                className="mb-1 block text-xs text-[var(--color-text-secondary)]"
                htmlFor="ua-input"
              >
                User-Agent 文字列
              </label>
              <input
                id="ua-input"
                type="text"
                value={userAgent}
                onChange={(e) => {
                  setUserAgent(e.target.value);
                }}
                className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                空にするとデフォルトの User-Agent が使用されます
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleSaveUserAgent();
                }}
                className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white hover:opacity-90"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleResetUserAgent}
                className="rounded border border-[var(--color-border-primary)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                リセット
              </button>
            </div>
          </div>
        )}

        {activeTab === 'bbsmenu' && (
          <div className="space-y-3">
            <div>
              <label
                className="mb-1 block text-xs text-[var(--color-text-secondary)]"
                htmlFor="bbs-menu-urls-input"
              >
                BBSメニューURL（1行に1つ）
              </label>
              <textarea
                id="bbs-menu-urls-input"
                value={bbsMenuUrlsText}
                onChange={(e) => {
                  setBbsMenuUrlsText(e.target.value);
                }}
                rows={8}
                className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                placeholder="https://menu.5ch.io/bbsmenu.html"
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                空行は無視されます。無効なURLのみの場合はデフォルトURLに戻ります。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleSaveBbsMenuUrls();
                }}
                className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white hover:opacity-90"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleResetBbsMenuUrls}
                className="rounded border border-[var(--color-border-primary)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                リセット
              </button>
            </div>
          </div>
        )}

        {activeTab === 'domain' && (
          <div className="space-y-4">
            <div>
              <label
                className="mb-1 block text-xs text-[var(--color-text-secondary)]"
                htmlFor="domain-input"
              >
                5ch ベースドメイン
              </label>
              <input
                id="domain-input"
                type="text"
                value={domainInput}
                onChange={(e) => {
                  setDomainInput(e.target.value);
                }}
                className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                placeholder="5ch.io"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                ドメイン名のみを入力してください（例: 5ch.io）。https:// は不要です。
              </p>
            </div>

            {/* Service URL preview */}
            <div className="rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                設定後の各サービス URL
              </p>
              <ul className="space-y-1 font-mono text-xs text-[var(--color-text-muted)]">
                <li>Be: https://be.{previewDomain}/</li>
                <li>UPLIFT: https://uplift.{previewDomain}/</li>
                <li>どんぐり: https://donguri.{previewDomain}/</li>
                <li>BBSメニュー(デフォルト): https://menu.{previewDomain}/bbsmenu.html</li>
              </ul>
            </div>

            {/* Warning */}
            <div className="rounded border border-[var(--color-warning,#f59e0b)] bg-[var(--color-bg-primary)] p-3">
              <p className="text-xs text-[var(--color-warning,#f59e0b)]">
                ドメインを変更すると、Be / UPLIFT / どんぐりの認証 Cookie が無効になります。変更後は各サービスへ再ログインしてください。
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleSaveDomain();
                }}
                className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white hover:opacity-90"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleResetDomain}
                className="rounded border border-[var(--color-border-primary)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                リセット
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {statusMessage.length > 0 && (
        <div className="border-t border-[var(--color-border-primary)] px-4 py-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">{statusMessage}</span>
        </div>
      )}
    </div>
  );
}
