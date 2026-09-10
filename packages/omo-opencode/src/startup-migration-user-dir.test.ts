import { expect, test } from "bun:test"
import { posix, resolve } from "node:path"

import { MemoryMigrationFileSystem } from "../../omo-config-core/src/migration/migration-test-support"
import { runOpenCodeStartupMigration } from "./startup-migration"

const homeDir = "/home/production"
const sourcePath = `${homeDir}/.omo/config.jsonc`

function fixture() {
  const fileSystem = new MemoryMigrationFileSystem()
  fileSystem.files.set(sourcePath, '{"[codex]":{"telemetry":{"enabled":false}}}')
  const options = {
    cwd: "/sandbox/project",
    homeDir,
    environment: { HOME: homeDir, OMO_DISABLE_PROJECT_CONFIG: "1" },
    env: { HOME: homeDir },
    fileSystem,
    discoveryFileSystem: {
      existsSync: fileSystem.existsSync.bind(fileSystem),
      readdirSync: fileSystem.readdirSync.bind(fileSystem),
      realpathSync: (path: string) => path,
    },
    pathOperations: posix,
    clock: { now: () => 1 },
    pid: 41,
    isProcessAlive: () => false,
  }
  return { fileSystem, options }
}

for (const interrupted of [false, true]) {
  test(`#given an explicit user directory and ${interrupted ? "a pending journal" : "legacy config"} #when OpenCode starts #then production-home migration state is untouched`, () => {
    // given
    const { fileSystem, options } = fixture()
    if (interrupted) {
      const crashed = runOpenCodeStartupMigration({
        ...options,
        onBoundary: (boundary) => { if (boundary === "target-recorded") throw new Error("fixture crash") },
      })
      expect(crashed.error).toBe("fixture crash")
      expect(fileSystem.existsSync(`${homeDir}/.omo/.migration-journal.json`)).toBe(true)
    }
    const files = new Map(fileSystem.files)
    const operations = [...fileSystem.operations]
    let discoveryAccesses = 0

    // when
    const result = runOpenCodeStartupMigration({
      ...options,
      environment: { ...options.environment, OMO_USER_CONFIG_DIR: resolve("/sandbox/rendered") },
      discoveryFileSystem: {
        ...options.discoveryFileSystem,
        existsSync(path) { discoveryAccesses += 1; return fileSystem.existsSync(path) },
      },
    })

    // then
    expect(fileSystem.files).toEqual(files)
    expect(fileSystem.operations).toEqual(operations)
    expect(discoveryAccesses).toBe(0)
    expect(result).toEqual({ journalResumed: false, migratedFrom: [], reloadRequired: false, results: [], skippedConflictCount: 0 })
  })
}

for (const userDir of [undefined, resolve(homeDir, ".omo", "..", ".omo")]) {
  test(`#given the default user directory ${userDir === undefined ? "implicitly" : "explicitly"} #when OpenCode starts #then legitimate legacy migration still runs`, () => {
    // given
    const { fileSystem, options } = fixture()

    // when
    const result = runOpenCodeStartupMigration({ ...options, environment: { ...options.environment, OMO_USER_CONFIG_DIR: userDir } })

    // then
    expect(result.error).toBeUndefined()
    expect(result.migratedFrom).toEqual([sourcePath])
    expect(result.reloadRequired).toBe(true)
    expect(fileSystem.existsSync(sourcePath)).toBe(false)
  })
}
