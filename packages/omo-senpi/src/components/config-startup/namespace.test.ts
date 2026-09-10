import { expect, test } from "bun:test"
import type { MigrationFileSystem } from "@oh-my-opencode/omo-config-core"
import { runSenpiStartupMigration } from "./index"

test("#given a non-default config namespace #when startup migration runs #then no legacy filesystem operation is attempted", () => {
  let accesses = 0
  const fileSystem = new Proxy({} as MigrationFileSystem, {
    get() { accesses += 1; throw new Error("Legacy filesystem must not be accessed") },
  })
  const result = runSenpiStartupMigration({
    cwd: "/project", homeDir: "/home/fixture", fileSystem,
    environment: { HOME: "/home/fixture", OMO_CONFIG_NAMESPACE: ".fomo" },
  })
  expect(accesses).toBe(0)
  expect(result).toEqual({ journalResumed: false, migratedFrom: [], results: [] })
})

test("#given an invalid config namespace #when startup migration runs #then TypeError escapes before filesystem access", () => {
  let accesses = 0
  const fileSystem = new Proxy({} as MigrationFileSystem, {
    get() { accesses += 1; throw new Error("Legacy filesystem must not be accessed") },
  })
  expect(() => runSenpiStartupMigration({
    cwd: "/project", homeDir: "/home/fixture", fileSystem,
    environment: { HOME: "/home/fixture", OMO_CONFIG_NAMESPACE: "../outside" },
  })).toThrow(TypeError)
  expect(accesses).toBe(0)
})
