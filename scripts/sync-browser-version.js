const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const manifestPaths = ["chrome-extension/manifest.json", "firefox-extension/manifest.json"];

const version = process.env.npm_package_version;

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

execFileSync("git", ["add", ...manifestPaths], { stdio: "inherit" });
