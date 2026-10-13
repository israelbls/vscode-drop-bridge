const fs = require("fs");
const { execFileSync } = require("child_process");

const path = "browser-extension/manifest.json";
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));

manifest.version = process.env.npm_package_version;

fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");

execFileSync("git", ["add", path], { stdio: "inherit" });
