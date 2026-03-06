import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseProxyIni,
  serializeProxyIni,
  loadProxyConfig,
  saveProxyConfig,
  getProxyConfig,
  getProxyAgent,
} from '../../src/main/services/proxy-manager';
import { DEFAULT_PROXY_CONFIG } from '../../src/types/proxy';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vbbb-proxy-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('parseProxyIni', () => {
  it('parses a full proxy.ini with both sections', () => {
    const ini = `[ReadProxy]
Proxy=true
Address=read.proxy.com
Port=8080
UserID=readuser
Password=readpass

[WriteProxy]
Proxy=true
Address=write.proxy.com
Port=9090
UserID=writeuser
Password=writepass
`;

    const config = parseProxyIni(ini);
    expect(config.readProxy.enabled).toBe(true);
    expect(config.readProxy.address).toBe('read.proxy.com');
    expect(config.readProxy.port).toBe(8080);
    expect(config.readProxy.userId).toBe('readuser');
    expect(config.readProxy.password).toBe('readpass');

    expect(config.writeProxy.enabled).toBe(true);
    expect(config.writeProxy.address).toBe('write.proxy.com');
    expect(config.writeProxy.port).toBe(9090);
    expect(config.writeProxy.userId).toBe('writeuser');
    expect(config.writeProxy.password).toBe('writepass');
  });

  it('returns defaults for empty content', () => {
    const config = parseProxyIni('');
    expect(config).toStrictEqual(DEFAULT_PROXY_CONFIG);
  });

  it('parses partial configuration (only ReadProxy)', () => {
    const ini = `[ReadProxy]
Proxy=true
Address=proxy.example.com
Port=3128
`;

    const config = parseProxyIni(ini);
    expect(config.readProxy.enabled).toBe(true);
    expect(config.readProxy.address).toBe('proxy.example.com');
    expect(config.readProxy.port).toBe(3128);
    expect(config.readProxy.userId).toBe('');
    expect(config.readProxy.password).toBe('');
    expect(config.writeProxy).toStrictEqual(DEFAULT_PROXY_CONFIG.writeProxy);
  });

  it('handles disabled proxy', () => {
    const ini = `[ReadProxy]
Proxy=false
Address=proxy.example.com
Port=8080
`;

    const config = parseProxyIni(ini);
    expect(config.readProxy.enabled).toBe(false);
    expect(config.readProxy.address).toBe('proxy.example.com');
  });

  it('ignores unknown sections', () => {
    const ini = `[Unknown]
Proxy=true
Address=bad.proxy.com
Port=1234

[ReadProxy]
Proxy=true
Address=good.proxy.com
Port=8080
`;

    const config = parseProxyIni(ini);
    expect(config.readProxy.address).toBe('good.proxy.com');
    expect(config.writeProxy).toStrictEqual(DEFAULT_PROXY_CONFIG.writeProxy);
  });

  it('ignores comment lines', () => {
    const ini = `; This is a comment
[ReadProxy]
; Another comment
Proxy=true
Address=proxy.example.com
Port=8080
`;

    const config = parseProxyIni(ini);
    expect(config.readProxy.enabled).toBe(true);
    expect(config.readProxy.address).toBe('proxy.example.com');
  });

  it('rejects invalid port numbers', () => {
    const ini = `[ReadProxy]
Proxy=true
Address=proxy.example.com
Port=99999
`;

    const config = parseProxyIni(ini);
    expect(config.readProxy.port).toBe(0);
  });
});

describe('serializeProxyIni', () => {
  it('round-trips a full config', () => {
    const original = {
      readProxy: {
        enabled: true,
        address: 'read.proxy.com',
        port: 8080,
        userId: 'user1',
        password: 'pass1',
      },
      writeProxy: {
        enabled: false,
        address: 'write.proxy.com',
        port: 9090,
        userId: '',
        password: '',
      },
    };

    const serialized = serializeProxyIni(original);
    const parsed = parseProxyIni(serialized);
    expect(parsed).toStrictEqual(original);
  });

  it('serializes default config', () => {
    const serialized = serializeProxyIni(DEFAULT_PROXY_CONFIG);
    expect(serialized).toContain('[ReadProxy]');
    expect(serialized).toContain('[WriteProxy]');
    expect(serialized).toContain('Proxy=false');
  });
});

describe('loadProxyConfig / saveProxyConfig', () => {
  it('returns DEFAULT_PROXY_CONFIG when no file exists', () => {
    const config = loadProxyConfig(tmpDir);
    expect(config).toStrictEqual(DEFAULT_PROXY_CONFIG);
  });

  it('round-trips save and load', async () => {
    const config = {
      readProxy: {
        enabled: true,
        address: 'proxy.example.com',
        port: 8080,
        userId: 'user1',
        password: 'pass1',
      },
      writeProxy: {
        enabled: false,
        address: '',
        port: 0,
        userId: '',
        password: '',
      },
    };

    await saveProxyConfig(tmpDir, config);
    const loaded = loadProxyConfig(tmpDir);
    expect(loaded).toStrictEqual(config);
  });

  it('loaded config matches getProxyConfig after saveProxyConfig', async () => {
    const config = {
      readProxy: {
        enabled: true,
        address: '127.0.0.1',
        port: 3128,
        userId: '',
        password: '',
      },
      writeProxy: DEFAULT_PROXY_CONFIG.writeProxy,
    };

    await saveProxyConfig(tmpDir, config);
    expect(getProxyConfig()).toStrictEqual(config);
  });
});

describe('getProxyAgent', () => {
  it('returns undefined for read when read proxy is disabled', async () => {
    await saveProxyConfig(tmpDir, DEFAULT_PROXY_CONFIG);
    const agent = getProxyAgent('read');
    expect(agent).toBeUndefined();
  });

  it('returns undefined for write when write proxy is disabled', async () => {
    await saveProxyConfig(tmpDir, DEFAULT_PROXY_CONFIG);
    const agent = getProxyAgent('write');
    expect(agent).toBeUndefined();
  });

  it('returns an agent for read when read proxy is enabled', async () => {
    await saveProxyConfig(tmpDir, {
      ...DEFAULT_PROXY_CONFIG,
      readProxy: {
        enabled: true,
        address: '127.0.0.1',
        port: 8080,
        userId: '',
        password: '',
      },
    });

    const agent = getProxyAgent('read');
    expect(agent).toBeDefined();
  });

  it('returns an agent for write when write proxy is enabled', async () => {
    await saveProxyConfig(tmpDir, {
      ...DEFAULT_PROXY_CONFIG,
      writeProxy: {
        enabled: true,
        address: '127.0.0.1',
        port: 9090,
        userId: '',
        password: '',
      },
    });

    const agent = getProxyAgent('write');
    expect(agent).toBeDefined();
  });

  it('returns undefined when proxy address is empty even if enabled', async () => {
    await saveProxyConfig(tmpDir, {
      ...DEFAULT_PROXY_CONFIG,
      readProxy: {
        enabled: true,
        address: '',
        port: 8080,
        userId: '',
        password: '',
      },
    });

    const agent = getProxyAgent('read');
    expect(agent).toBeUndefined();
  });
});
