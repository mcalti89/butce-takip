import { spawnSync } from 'node:child_process';

const commands = process.env.BUDGET_DATABASE_URL ? [
  ['db:budget'],
  ['exec', 'tsx', 'scripts/verify-budget-deployment.ts'],
  ['exec', 'tsx', 'scripts/sync-fx-archive.ts'],
] : [];
commands.push(['build:pwa']);
for (const args of commands) {
  const result = spawnSync('npx', ['--yes', 'pnpm@9.12.0', ...args], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  });
  if (result.error || result.status !== 0) {
    console.error('Vercel build adımı başarısız:', args[0]);
    process.exit(result.status ?? 1);
  }
}
