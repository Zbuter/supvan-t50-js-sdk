import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectRoot = resolve(workspaceRoot, "miniprogram");
const app = JSON.parse(readFileSync(resolve(projectRoot, "app.json"), "utf8"));

for (const page of app.pages) {
  for (const extension of ["js", "json", "wxml", "wxss"]) {
    const file = resolve(projectRoot, `${page}.${extension}`);
    if (!existsSync(file)) throw new Error(`小程序页面文件缺失：${page}.${extension}`);
  }
}

for (const file of filesIn(projectRoot).filter((name) => name.endsWith(".json"))) {
  JSON.parse(readFileSync(file, "utf8"));
}

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = resolve(directory, name);
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

for (const file of filesIn(projectRoot).filter((name) => name.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

for (const page of app.pages) {
  const source = readFileSync(resolve(projectRoot, `${page}.js`), "utf8");
  const markup = readFileSync(resolve(projectRoot, `${page}.wxml`), "utf8");
  const handlers = new Set(Array.from(markup.matchAll(/(?:bind|catch)[a-zA-Z]+="([A-Za-z_$][\w$]*)"/g), (match) => match[1]));
  for (const handler of handlers) {
    const escaped = handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^\\s*(?:async\\s+)?${escaped}\\s*\\(`, "m").test(source)) {
      throw new Error(`WXML 事件处理器不存在：${page} -> ${handler}`);
    }
  }
}

const bundlePath = resolve(projectRoot, "vendor/t50-core.js");
if (!existsSync(bundlePath)) throw new Error("缺少微信端 T50 协议 bundle，请先运行 npm run build:miniprogram");
const bundle = require(bundlePath);
for (const name of ["BlePrinter", "PaperType", "createQrMatrix", "encodeLabelTransfer", "decodeLabelTransfer"]) {
  if (!bundle[name]) throw new Error(`微信端协议 bundle 缺少导出：${name}`);
}

for (const removedDirectory of ["domain", "miniprogram_npm"]) {
  if (existsSync(resolve(projectRoot, removedDirectory))) throw new Error(`旧小程序目录仍然存在：${removedDirectory}`);
}


for (const removedFile of ["services/canvas-renderer.js", "services/document-store.js"]) {
  if (existsSync(resolve(projectRoot, removedFile))) throw new Error(`旧小程序文件仍然存在：${removedFile}`);
}

console.log(`miniprogram verified: ${app.pages.length} pages, ${filesIn(projectRoot).length} files`);
