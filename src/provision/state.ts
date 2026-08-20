import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type StateMap = Record<string, string>; // config key -> discord snowflake id

export function loadState(statePath: string): StateMap {
  if (!existsSync(statePath)) return {};
  return JSON.parse(readFileSync(statePath, "utf8")) as StateMap;
}

export function saveState(statePath: string, state: StateMap): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}
