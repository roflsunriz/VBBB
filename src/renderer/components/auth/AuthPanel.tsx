/**
 * Authentication panel component.
 * Provides login/logout UI for UPLIFT and Be authentication.
 */
import { useState, useCallback, useEffect } from 'react';
import { mdiAccountKey, mdiClose, mdiLogin, mdiLogout } from '@mdi/js';
import type { AuthState } from '@shared/auth';
import { DEFAULT_AUTH_STATE } from '@shared/auth';
import { MdiIcon } from '../common/MdiIcon';

type AuthTab = 'uplift' | 'be';

interface AuthPanelProps {
  readonly onClose: () => void;
}

export function AuthPanel({ onClose }: AuthPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<AuthTab>('uplift');
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_AUTH_STATE);

  // UPLIFT form state
  const [upliftUserId, setUpliftUserId] = useState('');
  const [upliftPassword, setUpliftPassword] = useState('');
  const [upliftLoading, setUpliftLoading] = useState(false);
  const [upliftMessage, setUpliftMessage] = useState('');

  // Be form state
  const [beMail, setBeMail] = useState('');
  const [bePassword, setBePassword] = useState('');
  const [beLoading, setBeLoading] = useState(false);
  const [beMessage, setBeMessage] = useState('');

  const refreshAuthState = useCallback(async () => {
    try {
      const state: AuthState = await window.electronApi.invoke('auth:get-state');
      setAuthState(state);
    } catch {
      // Use defaults
    }
  }, []);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  const handleUpliftLogin = useCallback(async () => {
    if (upliftUserId.length === 0 || upliftPassword.length === 0) {
      setUpliftMessage('ユーザーIDとパスワードを入力してください');
      return;
    }
    setUpliftLoading(true);
    setUpliftMessage('');
    try {
      const result = await window.electronApi.invoke('auth:uplift-login', upliftUserId, upliftPassword);
      setUpliftMessage(result.message);
      if (result.success) {
        setUpliftUserId('');
        setUpliftPassword('');
        await refreshAuthState();
      }
    } catch (err) {
      setUpliftMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUpliftLoading(false);
    }
  }, [upliftUserId, upliftPassword, refreshAuthState]);

  const handleUpliftLogout = useCallback(async () => {
    await window.electronApi.invoke('auth:uplift-logout');
    setUpliftMessage('ログアウトしました');
    await refreshAuthState();
  }, [refreshAuthState]);

  const handleBeLogin = useCallback(async () => {
    if (beMail.length === 0 || bePassword.length === 0) {
      setBeMessage('メールアドレスとパスワードを入力してください');
      return;
    }
    setBeLoading(true);
    setBeMessage('');
    try {
      const result = await window.electronApi.invoke('auth:be-login', beMail, bePassword);
      setBeMessage(result.message);
      if (result.success) {
        setBeMail('');
        setBePassword('');
        await refreshAuthState();
      }
    } catch (err) {
      setBeMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBeLoading(false);
    }
  }, [beMail, bePassword, refreshAuthState]);

  const handleBeLogout = useCallback(async () => {
    await window.electronApi.invoke('auth:be-logout');
    setBeMessage('ログアウトしました');
    await refreshAuthState();
  }, [refreshAuthState]);

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MdiIcon path={mdiAccountKey} size={16} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">認証設定</span>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          <MdiIcon path={mdiClose} size={16} />
        </button>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 border-b border-[var(--color-border-primary)]">
        <button
          type="button"
          onClick={() => { setActiveTab('uplift'); }}
          className={`px-3 py-1 text-xs ${
            activeTab === 'uplift'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          UPLIFT
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('be'); }}
          className={`px-3 py-1 text-xs ${
            activeTab === 'be'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          Be
        </button>
      </div>

      {/* UPLIFT tab */}
      {activeTab === 'uplift' && (
        <div className="flex flex-col gap-2">
          {authState.uplift.loggedIn ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">UPLIFT: ログイン中</span>
              <button
                type="button"
                onClick={() => { void handleUpliftLogout(); }}
                className="flex items-center gap-1 rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600"
              >
                <MdiIcon path={mdiLogout} size={12} />
                ログアウト
              </button>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
                ユーザーID
                <input
                  type="text"
                  value={upliftUserId}
                  onChange={(e) => { setUpliftUserId(e.target.value); }}
                  className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
                パスワード
                <input
                  type="password"
                  value={upliftPassword}
                  onChange={(e) => { setUpliftPassword(e.target.value); }}
                  className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={() => { void handleUpliftLogin(); }}
                disabled={upliftLoading}
                className="flex items-center gap-1 self-start rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                <MdiIcon path={mdiLogin} size={12} />
                {upliftLoading ? 'ログイン中...' : 'ログイン'}
              </button>
            </>
          )}
          {upliftMessage.length > 0 && (
            <span className="text-xs text-[var(--color-text-muted)]">{upliftMessage}</span>
          )}
        </div>
      )}

      {/* Be tab */}
      {activeTab === 'be' && (
        <div className="flex flex-col gap-2">
          {authState.be.loggedIn ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">Be: ログイン中</span>
              <button
                type="button"
                onClick={() => { void handleBeLogout(); }}
                className="flex items-center gap-1 rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600"
              >
                <MdiIcon path={mdiLogout} size={12} />
                ログアウト
              </button>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
                メールアドレス
                <input
                  type="email"
                  value={beMail}
                  onChange={(e) => { setBeMail(e.target.value); }}
                  className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
                パスワード
                <input
                  type="password"
                  value={bePassword}
                  onChange={(e) => { setBePassword(e.target.value); }}
                  className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={() => { void handleBeLogin(); }}
                disabled={beLoading}
                className="flex items-center gap-1 self-start rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                <MdiIcon path={mdiLogin} size={12} />
                {beLoading ? 'ログイン中...' : 'ログイン'}
              </button>
            </>
          )}
          {beMessage.length > 0 && (
            <span className="text-xs text-[var(--color-text-muted)]">{beMessage}</span>
          )}
        </div>
      )}

      {/* Donguri status (informational) */}
      <div className="border-t border-[var(--color-border-primary)] pt-2">
        <span className="text-xs text-[var(--color-text-muted)]">
          どんぐり: {authState.donguri.status === 'active' ? 'アクティブ' : authState.donguri.status === 'broken' ? '破損' : authState.donguri.status === 'consumed' ? '消費済み' : '未設定'}
          {authState.donguri.message.length > 0 ? ` - ${authState.donguri.message}` : ''}
        </span>
      </div>
    </div>
  );
}
