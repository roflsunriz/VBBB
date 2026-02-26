/**
 * Proxy manager service.
 * Manages read/write proxy configuration and creates HTTP agents.
 */
import type { Agent as HttpAgent } from 'node:http';
import { join } from 'node:path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { ProxyConfig, ProxyEndpointConfig, ProxyMode } from '@shared/proxy';
import { DEFAULT_PROXY_CONFIG } from '@shared/proxy';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe, readFileSafeAsync } from './file-io';

const logger = createLogger('proxy-manager');

const PROXY_INI_FILE = 'proxy.ini';

let currentConfig: ProxyConfig = DEFAULT_PROXY_CONFIG;
let readAgent: HttpAgent | undefined;
let writeAgent: HttpAgent | undefined;

/**
 * Parse proxy.ini content into ProxyConfig.
 */
export function parseProxyIni(content: string): ProxyConfig {
  const config: {
    readProxy: ProxyEndpointConfig;
    writeProxy: ProxyEndpointConfig;
  } = {
    readProxy: { ...DEFAULT_PROXY_CONFIG.readProxy },
    writeProxy: { ...DEFAULT_PROXY_CONFIG.writeProxy },
  };

  let currentSection: 'ReadProxy' | 'WriteProxy' | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';')) continue;

    const sectionMatch = /^\[(.+)]$/.exec(trimmed);
    if (sectionMatch?.[1] !== undefined) {
      const section = sectionMatch[1];
      if (section === 'ReadProxy' || section === 'WriteProxy') {
        currentSection = section;
      } else {
        currentSection = null;
      }
      continue;
    }

    if (currentSection === null) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();

    const target = currentSection === 'ReadProxy' ? 'readProxy' : 'writeProxy';

    switch (key) {
      case 'Proxy':
        config[target] = { ...config[target], enabled: value.toLowerCase() === 'true' };
        break;
      case 'Address':
        config[target] = { ...config[target], address: value };
        break;
      case 'Port': {
        const port = parseInt(value, 10);
        if (!Number.isNaN(port) && port > 0 && port <= 65535) {
          config[target] = { ...config[target], port };
        }
        break;
      }
      case 'UserID':
        config[target] = { ...config[target], userId: value };
        break;
      case 'Password':
        config[target] = { ...config[target], password: value };
        break;
    }
  }

  return config;
}

/**
 * Serialize ProxyConfig to INI format.
 */
export function serializeProxyIni(config: ProxyConfig): string {
  const lines: string[] = [];

  for (const [section, endpoint] of [
    ['ReadProxy', config.readProxy],
    ['WriteProxy', config.writeProxy],
  ] as const) {
    lines.push(`[${section}]`);
    lines.push(`Proxy=${String(endpoint.enabled)}`);
    lines.push(`Address=${endpoint.address}`);
    lines.push(`Port=${String(endpoint.port)}`);
    lines.push(`UserID=${endpoint.userId}`);
    lines.push(`Password=${endpoint.password}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build a proxy URL from endpoint configuration.
 */
function buildProxyUrl(endpoint: ProxyEndpointConfig): string {
  const auth =
    endpoint.userId.length > 0
      ? `${encodeURIComponent(endpoint.userId)}:${encodeURIComponent(endpoint.password)}@`
      : '';
  return `http://${auth}${endpoint.address}:${String(endpoint.port)}`;
}

/**
 * Create an HTTP agent for a proxy endpoint.
 */
function createAgent(endpoint: ProxyEndpointConfig): HttpAgent | undefined {
  if (!endpoint.enabled || endpoint.address.length === 0 || endpoint.port === 0) {
    return undefined;
  }

  const proxyUrl = buildProxyUrl(endpoint);
  logger.info(`Creating proxy agent for ${endpoint.address}:${String(endpoint.port)}`);
  return new HttpsProxyAgent(proxyUrl);
}

/**
 * Rebuild proxy agents from current config.
 */
function rebuildAgents(): void {
  readAgent = createAgent(currentConfig.readProxy);
  writeAgent = createAgent(currentConfig.writeProxy);
}

/**
 * Load proxy configuration from disk (sync).
 */
export function loadProxyConfig(dataDir: string): ProxyConfig {
  const filePath = join(dataDir, PROXY_INI_FILE);
  const content = readFileSafe(filePath);
  if (content === null) {
    currentConfig = DEFAULT_PROXY_CONFIG;
  } else {
    currentConfig = parseProxyIni(content.toString('utf-8'));
  }
  rebuildAgents();
  return currentConfig;
}

/**
 * Load proxy configuration from disk (async, non-blocking).
 */
export async function loadProxyConfigAsync(dataDir: string): Promise<ProxyConfig> {
  const filePath = join(dataDir, PROXY_INI_FILE);
  const content = await readFileSafeAsync(filePath);
  if (content === null) {
    currentConfig = DEFAULT_PROXY_CONFIG;
  } else {
    currentConfig = parseProxyIni(content.toString('utf-8'));
  }
  rebuildAgents();
  return currentConfig;
}

/**
 * Save proxy configuration to disk and rebuild agents.
 */
export async function saveProxyConfig(dataDir: string, config: ProxyConfig): Promise<void> {
  currentConfig = config;
  const content = serializeProxyIni(config);
  await atomicWriteFile(join(dataDir, PROXY_INI_FILE), content);
  rebuildAgents();
  logger.info('Proxy configuration saved');
}

/**
 * Get the current proxy config.
 */
export function getProxyConfig(): ProxyConfig {
  return currentConfig;
}

/**
 * Get the appropriate proxy agent for the given mode.
 */
export function getProxyAgent(mode: ProxyMode): HttpAgent | undefined {
  return mode === 'read' ? readAgent : writeAgent;
}
