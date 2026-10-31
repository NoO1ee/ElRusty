import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--experimental-transform-types', 'server/index.ts', '--dev'], {
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
children.forEach((child) => {
  child.on('exit', (code) => stop(code || 0));
  child.on('error', () => stop(1));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
