export function localRequestAllowed(
  headers: Pick<Headers, 'get'>,
  port: number,
): boolean {
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const host = headers.get('host');
  if (!host || !allowed.has(host.toLowerCase())) return false;
  const origin = headers.get('origin');
  if (origin && origin !== `http://${host.toLowerCase()}`) return false;
  const site = headers.get('sec-fetch-site');
  return !site || ['same-origin', 'none'].includes(site);
}
