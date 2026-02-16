/**
 * Proxy settings panel.
 * Allows configuring separate read/write proxy endpoints.
 */
import { useState, useCallback, useEffect } from 'react';
import { mdiShieldLock, mdiClose, mdiCheck } from '@mdi/js';
import type { ProxyConfig, ProxyEndpointConfig } from '@shared/proxy';
import { DEFAULT_PROXY_CONFIG } from '@shared/proxy';
import { MdiIcon } from '../common/MdiIcon';

interface ProxyEndpointFormProps {
  readonly label: string;
  readonly value: ProxyEndpointConfig;
  readonly onChange: (updated: ProxyEndpointConfig) => void;
}

function ProxyEndpointForm({ label, value, onChange }: ProxyEndpointFormProps): React.JSX.Element {
  const updateField = useCallback(
    <K extends keyof ProxyEndpointConfig>(field: K, fieldValue: ProxyEndpointConfig[K]) => {
      onChange({ ...value, [field]: fieldValue });
    },
    [value, onChange],
  );

  return (
    <fieldset className="rounded border border-[var(--color-border-primary)] p-3">
      <legend className="px-2 text-xs font-semibold text-[var(--color-text-secondary)]">{label}</legend>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => { updateField('enabled', e.target.checked); }}
            className="accent-[var(--color-accent)]"
          />
          有効
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
            アドレス
            <input
              type="text"
              value={value.address}
              onChange={(e) => { updateField('address', e.target.value); }}
              disabled={!value.enabled}
              placeholder="proxy.example.com"
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-50"
            />
          </label>
          <label className="flex w-20 flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
            ポート
            <input
              type="number"
              value={value.port === 0 ? '' : String(value.port)}
              onChange={(e) => {
                const port = parseInt(e.target.value, 10);
                updateField('port', Number.isNaN(port) ? 0 : port);
              }}
              disabled={!value.enabled}
              placeholder="8080"
              min={1}
              max={65535}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-50"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
            ユーザーID
            <input
              type="text"
              value={value.userId}
              onChange={(e) => { updateField('userId', e.target.value); }}
              disabled={!value.enabled}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-50"
            />
          </label>
          <label className="flex flex-1 flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
            パスワード
            <input
              type="password"
              value={value.password}
              onChange={(e) => { updateField('password', e.target.value); }}
              disabled={!value.enabled}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-50"
            />
          </label>
        </div>
      </div>
    </fieldset>
  );
}

interface ProxySettingsProps {
  readonly onClose: () => void;
}

export function ProxySettings({ onClose }: ProxySettingsProps): React.JSX.Element {
  const [config, setConfig] = useState<ProxyConfig>(DEFAULT_PROXY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const loaded: ProxyConfig = await window.electronApi.invoke('proxy:get-config');
        setConfig(loaded);
      } catch {
        // Use defaults on failure
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      await window.electronApi.invoke('proxy:set-config', config);
      setStatusMsg('保存しました');
    } catch {
      setStatusMsg('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const updateReadProxy = useCallback((updated: ProxyEndpointConfig) => {
    setConfig((prev) => ({ ...prev, readProxy: updated }));
  }, []);

  const updateWriteProxy = useCallback((updated: ProxyEndpointConfig) => {
    setConfig((prev) => ({ ...prev, writeProxy: updated }));
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MdiIcon path={mdiShieldLock} size={16} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">プロキシ設定</span>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          <MdiIcon path={mdiClose} size={16} />
        </button>
      </div>

      <ProxyEndpointForm label="読み込み用プロキシ (ReadProxy)" value={config.readProxy} onChange={updateReadProxy} />
      <ProxyEndpointForm label="書き込み用プロキシ (WriteProxy)" value={config.writeProxy} onChange={updateWriteProxy} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          <MdiIcon path={mdiCheck} size={12} />
          {saving ? '保存中...' : '保存'}
        </button>
        {statusMsg.length > 0 && (
          <span className="text-xs text-[var(--color-text-muted)]">{statusMsg}</span>
        )}
      </div>
    </div>
  );
}
