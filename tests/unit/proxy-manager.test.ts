import { describe, it, expect } from 'vitest';
import { parseProxyIni, serializeProxyIni } from '../../src/main/services/proxy-manager';
import { DEFAULT_PROXY_CONFIG } from '../../src/types/proxy';

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
