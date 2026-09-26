// The Supabase library Slate loads from the CDN (index.html), pinned.
//
// Slate runs one exact version of supabase-js, the same one package.json
// lists and the tests run against, with an integrity hash: the browser
// refuses the file unless it's byte for byte the one expected. Nothing
// changes until someone updates it on purpose:
//
//   npm run update-supabase -- 2.118.0
//                          install that version, point index.html at it
//                          and write its hash; then run npm test
//
// tests/stamps.spec.js checks that index.html and package.json agree.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const FILE = "dist/umd/supabase.js";
const TAG = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]*"[^>]*><\/script>/;

// The version package.json asks for, and the hash of that file as npm
// installed it (the CDN serves the very same bytes).
function pinned() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const version = pkg.devDependencies["@supabase/supabase-js"];
  const file = fs.readFileSync(path.join(ROOT, "node_modules/@supabase/supabase-js", FILE));
  const integrity = `sha384-${crypto.createHash("sha384").update(file).digest("base64")}`;
  return { version, integrity };
}

function tagFor({ version, integrity }) {
  return `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${version}/${FILE}" integrity="${integrity}" crossorigin="anonymous"></script>`;
}

// The tag index.html has now.
function currentTag(html = fs.readFileSync(INDEX, "utf8")) {
  return html.match(TAG)?.[0] ?? null;
}

function update(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    console.error("Which version? For example: npm run update-supabase -- 2.118.0");
    process.exit(1);
  }
  execFileSync("npm", ["install", "--save-dev", "--save-exact", `@supabase/supabase-js@${version}`], {
    cwd: ROOT,
    stdio: "inherit",
  });
  const html = fs.readFileSync(INDEX, "utf8");
  if (!currentTag(html)) throw new Error("No supabase-js <script> tag found in index.html");
  fs.writeFileSync(INDEX, html.replace(TAG, tagFor(pinned())));
  console.log(`index.html now loads supabase-js ${version}. Next: npm test`);
}

if (require.main === module) update(process.argv[2]);

module.exports = { pinned, tagFor, currentTag };
