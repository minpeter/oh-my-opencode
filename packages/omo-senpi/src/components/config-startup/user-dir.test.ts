import { expect, test } from "bun:test"
import { posix, resolve, win32 } from "node:path"

import { MemoryMigrationFileSystem } from "../../../../omo-config-core/src/migration/migration-test-support"
import { FakeExtensionAPI } from "../../../test-support/fake-extension-api"
import { loadSenpiOmoConfig } from "../config-resolution"
import { createConfigStartupComponent, runSenpiStartupMigration } from "./index"

const homeDir = "/home/production"
const sourcePath = `${homeDir}/.omo/config.jsonc`

function fixture(userDir = resolve("/sandbox/rendered")) {
  const fileSystem = new MemoryMigrationFileSystem()
  fileSystem.files.set(sourcePath, '{"[codex]":{"telemetry":{"enabled":false}}}')
  fileSystem.writeFileSync(`${userDir}/omo.jsonc`, '{"task":{"default_concurrency":7}}', "utf-8")
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
  return { fileSystem, options, userDir }
}

test("#given a Windows rendered user directory #when seeding the startup fixture #then its config is readable through the filesystem port", () => {
  const userDir = win32.resolve("C:/sandbox/rendered")
  const { fileSystem } = fixture(userDir)
  const configPath = win32.join(userDir, "omo.jsonc")

  expect(fileSystem.existsSync(configPath)).toBe(true)
  expect(JSON.parse(fileSystem.readFileSync(configPath, "utf-8")).task.default_concurrency).toBe(7)
})

for (const interrupted of [false, true]) {
  test(`#given an explicit user directory and ${interrupted ? "a pending journal" : "legacy config"} #when the Senpi startup component registers #then production-home migration state is untouched`, () => {
    // given
    const { fileSystem, options, userDir } = fixture()
    if (interrupted) {
      const crashed = runSenpiStartupMigration({
        ...options,
        onBoundary: (boundary) => { if (boundary === "target-recorded") throw new Error("fixture crash") },
      })
      expect(crashed.error).toBe("fixture crash")
      expect(fileSystem.existsSync(`${homeDir}/.omo/.migration-journal.json`)).toBe(true)
    }
    const files = new Map(fileSystem.files)
    const operations = [...fileSystem.operations]
    let discoveryAccesses = 0
    const environment = { ...options.environment, OMO_USER_CONFIG_DIR: userDir }
    // The production component passes only cwd, so exercise the process-env fallback.
    const originalEnvironment = { ...process.env }
    Object.assign(process.env, environment)
    delete process.env.OMO_CONFIG_NAMESPACE
    const { environment: _environment, ...runtimeOptions } = options
    try {
      // when
      createConfigStartupComponent({
        resolveCwd: () => options.cwd,
        runMigration: ({ cwd }) => runSenpiStartupMigration({
          ...runtimeOptions, cwd,
          discoveryFileSystem: {
            ...options.discoveryFileSystem,
            existsSync(path) { discoveryAccesses += 1; return fileSystem.existsSync(path) },
          },
        }),
        loadConfig: ({ cwd } = {}) => {
          const loaded = loadSenpiOmoConfig({ cwd, env: environment, fileSystem })
          expect(loaded.config.task?.default_concurrency).toBe(7)
          expect(loaded.diagnostics).toEqual([])
          return loaded
        },
      }).register(new FakeExtensionAPI(), {
        config: { getFlag: () => undefined },
        logger: { error() {}, warn() {}, info() {} },
      })

      // then
      expect(fileSystem.files).toEqual(files)
      expect(fileSystem.operations).toEqual(operations)
      expect(discoveryAccesses).toBe(0)
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]
      Object.assign(process.env, originalEnvironment)
    }
  })
}

for (const userDir of [undefined, resolve(homeDir, ".omo", "..", ".omo")]) {
  test(`#given the default user directory ${userDir === undefined ? "implicitly" : "explicitly"} #when Senpi starts #then legitimate legacy migration still runs`, () => {
    // given
    const { fileSystem, options } = fixture()

    // when
    const result = runSenpiStartupMigration({ ...options, environment: { ...options.environment, OMO_USER_CONFIG_DIR: userDir } })

    // then
    expect(result.error).toBeUndefined()
    expect(result.migratedFrom).toEqual([sourcePath])
    expect(fileSystem.existsSync(sourcePath)).toBe(false)
  })
}
