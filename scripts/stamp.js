// Cache stamps for index.html.
//
// Browsers keep copies of CSS and JS files, so a changed file needs a new
// address or some visitors go on running the old one. Every local
// stylesheet and script in index.html therefore carries ?v=<stamp>, where
// the stamp is the first 8 hex characters of the SHA-256 of the file's
// contents: it changes exactly when the file does, and never otherwise.
//
//   npm run stamp          rewrite index.html with the current stamps
//   npm run stamp:check    change nothing; exit 1 listing any stale stamp
//                          (GitHub runs this on every push)
//   node scripts/stamp.js --staged
//                          stamp from the versions staged for the next
//                          commit rather than the files on disk — what the
//                          pre-commit hook (.githooks/pre-commit) runs

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");

// href="css/x.css?v=…" / src="js/y.js" — local CSS and JS only, with or
// without a stamp yet.
const REF = /(href|src)="((?:css|js)\/[\w./-]+\.(?:css|js))(?:\?v=([\w.-]*))?"/g;

// Where file contents come from: the disk, or (--staged) git's index, so a
// commit's stamps match the files it actually contains.
let staged = false;

function contentsOf(file) {
  if (!staged) return fs.readFileSync(path.join(ROOT, file));
  return execFileSync("git", ["show", `:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function stampOf(file) {
  return crypto.createHash("sha256").update(contentsOf(file)).digest("hex").slice(0, 8);
}

// Every reference in the page: its file, the stamp it has, the one it should.
function references(html) {
  return [...html.matchAll(REF)].map(([, , file, current]) => ({
    file,
    current: current ?? null,
    expected: stampOf(file),
  }));
}

function stale(html = fs.readFileSync(INDEX, "utf8")) {
  return references(html).filter((ref) => ref.current !== ref.expected);
}

function stamp() {
  const html = fs.readFileSync(INDEX, "utf8");
  const next = html.replace(REF, (_, attr, file) => `${attr}="${file}?v=${stampOf(file)}"`);
  if (next !== html) fs.writeFileSync(INDEX, next);
  return stale(html);
}

module.exports = { references, stale, stamp };

if (require.main === module) {
  staged = process.argv.includes("--staged");
  if (process.argv.includes("--check")) {
    const wrong = stale();
    if (!wrong.length) {
      console.log(`All ${references(fs.readFileSync(INDEX, "utf8")).length} stamps in index.html are current.`);
    } else {
      console.error("Stale cache stamps in index.html (run `npm run stamp`):");
      wrong.forEach((r) => console.error(`  ${r.file}: ?v=${r.current ?? "(none)"} → should be ?v=${r.expected}`));
      process.exit(1);
    }
  } else {
    const changed = stamp();
    console.log(changed.length ? `Restamped ${changed.length}: ${changed.map((r) => r.file).join(", ")}` : "Nothing to restamp.");
  }
}
