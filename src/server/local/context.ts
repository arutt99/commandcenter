import 'server-only';
import { headers } from 'next/headers';
import { initializeStore } from '../db';
import { localRequestAllowed } from './request';
import { localPort } from './paths';
import { LOCAL_OWNER } from './owner';
import { startLocalMaintenance } from './maintenance';
export async function requireLocal() {
  if (!localRequestAllowed(await headers(), localPort()))
    throw new Error(
      'This app accepts same-origin requests on this computer only.',
    );
  await initializeStore();
  startLocalMaintenance();
  return LOCAL_OWNER;
}
