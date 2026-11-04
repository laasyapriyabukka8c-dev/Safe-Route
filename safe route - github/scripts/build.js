const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, "build");
const executable = path.join(
  outputDirectory,
  process.platform === "win32" ? "saferoute.exe" : "saferoute"
);
const outputExecutable = process.env.SAFEROUTE_BIN
  ? path.resolve(process.env.SAFEROUTE_BIN)
  : executable;
const compiler = process.env.CC || "gcc";
const sources = [
  "src/main.c",
  "src/graph.c",
  "src/min_heap.c",
  "src/priority_queue.c",
  "src/hash_table.c"
];

fs.mkdirSync(path.dirname(outputExecutable), { recursive: true });

const result = spawnSync(
  compiler,
  [
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-pedantic",
    "-I",
    path.join(root, "include"),
    ...sources.map((source) => path.join(root, source)),
    "-lm",
    "-o",
    outputExecutable
  ],
  { cwd: root, stdio: "inherit" }
);

if (result.error) {
  console.error(`Unable to run the C compiler "${compiler}": ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status || 1;
} else {
  console.log(`Built ${path.relative(root, outputExecutable)}`);
}
