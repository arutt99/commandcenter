import { describe, expect, it } from 'vitest';
import { localRequestAllowed } from '../src/server/local/request';
import { localPaths, localPort } from '../src/server/local/paths';
describe('local request boundary', () => {
  it.each([
    [{ host: '127.0.0.1:4310' }, true],
    [
      {
        host: 'localhost:4310',
        origin: 'http://localhost:4310',
        'sec-fetch-site': 'same-origin',
      },
      true,
    ],
    [{ host: '127.0.0.1:4310', 'sec-fetch-site': 'none' }, true],
    [{ host: 'attacker.example:4310' }, false],
    [{ host: '127.0.0.1.nip.io:4310' }, false],
    [{ host: '192.168.1.20:4310' }, false],
    [{ host: '127.0.0.1:9999' }, false],
    [{ host: '127.0.0.1:4310', origin: 'https://attacker.example' }, false],
    [{ host: '127.0.0.1:4310', origin: 'http://127.0.0.1:9999' }, false],
    [{ host: '127.0.0.1:4310', origin: 'null' }, false],
    [{ host: '127.0.0.1:4310', 'sec-fetch-site': 'cross-site' }, false],
    [{ host: '127.0.0.1:4310', 'sec-fetch-site': 'same-site' }, false],
    [{}, false],
  ])(
    'checks host, origin and browser request context: %j',
    (headers, expected) => {
      expect(
        localRequestAllowed(
          new Headers(headers as Record<string, string>),
          4310,
        ),
      ).toBe(expected);
    },
  );
  it('keeps database and originals together in the configured private folder', () => {
    const paths = localPaths('/tmp/wayfind-local-test');
    expect(paths.database).toBe(
      '/tmp/wayfind-local-test/store/command-center.sqlite',
    );
    expect(paths.originals).toBe('/tmp/wayfind-local-test/store/originals');
    expect(paths.backups).toBe('/tmp/wayfind-local-test/backups');
  });
  it('accepts a local port without accepting arbitrary addresses or privileged ports', () => {
    expect(localPort('4310')).toBe(4310);
    for (const value of ['', '80', '65536', '4310.5', '0.0.0.0:4310'])
      expect(() => localPort(value)).toThrow();
  });
});
