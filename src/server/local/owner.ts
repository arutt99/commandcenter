// A provenance label for audit history, not a user account or login bypass.
export const LOCAL_OWNER = { id: 'local-owner', name: 'Owner' } as const;
export type Actor = typeof LOCAL_OWNER;
