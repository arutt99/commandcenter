import { AsyncLocalStorage } from 'node:async_hooks';
const state = globalThis as typeof globalThis & {
  wayfindQueue?: {
    tail: Promise<unknown>;
    context: AsyncLocalStorage<boolean>;
  };
};
const queue = (state.wayfindQueue ??= {
  tail: Promise.resolve(),
  context: new AsyncLocalStorage<boolean>(),
});
// Serialize local transactions and backups, including asynchronous parsing/file work.
export function withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  if (queue.context.getStore()) return operation();
  const result = queue.tail.then(() => queue.context.run(true, operation));
  queue.tail = result.catch(() => undefined);
  return result;
}
