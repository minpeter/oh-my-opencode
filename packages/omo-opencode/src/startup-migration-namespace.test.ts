import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runOpenCodeStartupMigration } from "./startup-migration"

test("#given a non-default namespace and legacy OMO files #when OpenCode starts #then legacy files are not migrated", () => {
  // given
  const home = mkdtempSync(join(tmpdir(), "fomo-opencode-migration-"))
  const cwd = join(home, "project")
  const legacy = join(home, ".config", "opencode", "oh-my-opencode.jsonc")
  const original = JSON.stringify({ agents: { sisyphus: { model: "fixture/model" } } })
  mkdirSync(cwd, { recursive: true })
  mkdirSync(join(legacy, ".."), { recursive: true })
  writeFileSync(legacy, original)
  try {
    // when
    const result = runOpenCodeStartupMigration({
      cwd, homeDir: home, environment: { HOME: home, OMO_CONFIG_NAMESPACE: ".fomo" },
    })

    // then
    expect(result).toEqual({
      journalResumed: false, migratedFrom: [], reloadRequired: false, results: [], skippedConflictCount: 0,
    })
    expect(readFileSync(legacy, "utf8")).toBe(original)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
