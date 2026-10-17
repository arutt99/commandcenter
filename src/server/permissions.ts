export type Actor = {
  id: string;
  role: 'admin' | 'staff';
  active: boolean;
  name: string;
};
export class AccessError extends Error {
  constructor() {
    super('Administrator access is required.');
  }
}
export function assertAdmin(actor: Actor) {
  if (!actor.active || actor.role !== 'admin') throw new AccessError();
}
