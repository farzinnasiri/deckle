// Stop only this checkout's servers, including ones started without Portless.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const processes = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .map((line) => {
    const [, pid, parent, command] = line
      .trim()
      .match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return { pid: Number(pid), parent: Number(parent), command };
  });

function belongsToDeckle(pid) {
  try {
    const cwd = execFileSync(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
    return cwd && realpathSync(cwd) === root;
  } catch {
    return false; // The process may have exited while we inspected it.
  }
}

function isServer(command) {
  const executable = basename(command.split(/\s+/)[0]);
  if (executable === "next-server") return true;
  if (/^npm run (?:dev|start)(?:\s|$)/.test(command)) return true;
  return (
    executable === "node" &&
    (/\bnext(?:\.js)?\s+(?:dev|start)(?:\s|$)/.test(command) ||
      /\bportless(?:\/dist\/cli\.js)?\s+(?:deckle|run)(?:\s|$)/.test(command))
  );
}

const targets = new Set(
  processes
    .filter(({ pid, command }) => isServer(command) && belongsToDeckle(pid))
    .map(({ pid }) => pid),
);
// Include workers before their parent exits and they become orphaned.
let added;
do {
  added = false;
  for (const { pid, parent } of processes) {
    if (targets.has(parent) && !targets.has(pid)) {
      targets.add(pid);
      added = true;
    }
  }
} while (added);

function signal(pid, value) {
  try {
    process.kill(pid, value);
    return true;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return false;
  }
}

async function waitForExit(timeout) {
  const deadline = Date.now() + timeout;
  while (targets.size && Date.now() < deadline) {
    for (const pid of targets) if (!signal(pid, 0)) targets.delete(pid);
    if (targets.size) await delay(100);
  }
}

if (targets.size) {
  console.log(`Stopping Deckle processes: ${[...targets].join(", ")}`);
  for (const pid of targets) signal(pid, "SIGTERM");
  await waitForExit(5000);
  for (const pid of targets) signal(pid, "SIGKILL");
  await waitForExit(2000);
  if (targets.size)
    throw new Error(`Deckle processes did not exit: ${[...targets]}`);
}
