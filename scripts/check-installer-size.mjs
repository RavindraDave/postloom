// Fails if any installer is over the budget in PLAN.md §15.3.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_MB = 150;
const dir = process.argv[2] ?? 'apps/desktop/release';
const installers = readdirSync(dir).filter((name) =>
  /\.(exe|dmg|zip|AppImage|deb|msix|appx)$/.test(name),
);
if (installers.length === 0) {
  console.error(`No installers found in ${dir}`);
  process.exit(1);
}
let over = false;
for (const name of installers) {
  const mb = statSync(join(dir, name)).size / 1024 / 1024;
  const ok = mb < BUDGET_MB;
  over ||= !ok;
  process.stdout.write(
    `${ok ? 'OK  ' : 'OVER'} ${name}: ${mb.toFixed(1)} MB (budget ${String(BUDGET_MB)} MB)\n`,
  );
}
process.exit(over ? 1 : 0);
