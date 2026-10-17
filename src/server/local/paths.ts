import os from 'node:os';
import path from 'node:path';
export function localPaths(root = process.env.WAYFIND_DATA_DIR) {
  const base =
    process.platform === 'win32'
      ? path.join(
          process.env.LOCALAPPDATA ||
            path.join(os.homedir(), 'AppData', 'Local'),
          'Wayfind Command Center',
        )
      : process.platform === 'darwin'
        ? path.join(
            os.homedir(),
            'Library',
            'Application Support',
            'Wayfind Command Center',
          )
        : path.join(
            process.env.XDG_DATA_HOME ||
              path.join(os.homedir(), '.local', 'share'),
            'wayfind-command-center',
          );
  const directory = path.resolve(/* turbopackIgnore: true */ root || base);
  return {
    root: directory,
    store: path.join(directory, 'store'),
    database: path.join(directory, 'store', 'command-center.sqlite'),
    originals: path.join(directory, 'store', 'originals'),
    backups: path.join(directory, 'backups'),
  };
}
export function localPort(value = process.env.WAYFIND_PORT) {
  const port = value === undefined ? 4310 : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('WAYFIND_PORT must be a number between 1024 and 65535.');
  return port;
}
