// Fails if any installer is over the budget in PLAN.md §15.3.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_MB = 150;
// The Store package holds the same app, but AppX compresses each file on its own
// where NSIS compresses the lot together, so it is bigger for the same payload.
// People get it from the Store, not as a direct download, so it has its own
// ceiling rather than loosening the one for downloads (PLAN.md §15.3).
const STORE_BUDGET_MB = 190;
const budgetFor = (name) => (/\.(msix|appx)$/.test(name) ? STORE_BUDGET_MB : BUDGET_MB);
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
  const budget = budgetFor(name);
  const ok = mb < budget;
  over ||= !ok;
  process.stdout.write(
    `${ok ? 'OK  ' : 'OVER'} ${name}: ${mb.toFixed(1)} MB (budget ${String(budget)} MB)\n`,
  );
}
process.exit(over ? 1 : 0);
