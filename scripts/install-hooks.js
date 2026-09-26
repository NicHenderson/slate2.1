// Run by `npm install` (package.json "prepare"): points git at the hooks
// in .githooks/, so the pre-commit hook restamps index.html on its own.
// Quietly does nothing outside a git checkout.
const { execFileSync } = require("child_process");

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("Git hooks enabled (.githooks/): cache stamps update on each commit.");
} catch {
  // Not a git checkout (or no git): nothing to set up.
}
