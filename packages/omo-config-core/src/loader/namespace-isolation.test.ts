import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { loadOmoConfig, resolveUserOmoConfigPath, updateOmoConfig } from "../index"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "omo-namespace-"))
  roots.push(home)
  const project = join(home, "project")
  for (const root of [home, project]) {
    for (const namespace of [".omo", ".fomo"]) {
      mkdirSync(join(root, namespace), { recursive: true })
      writeFileSync(join(root, namespace, "omo.json"), JSON.stringify({
        agents: { sisyphus: { models: [`${namespace === ".omo" ? "production" : "isolated"}/model`] } },
      }))
    }
  }
  return { home, project, env: { HOME: home, OMO_CONFIG_NAMESPACE: ".fomo" } }
}

describe("isolated configuration namespaces", () => {
  test("#given project discovery disabled #when loading an isolated rendered view #then project settings cannot override it", () => {
    // given
    const { home, project, env } = fixture()
    writeFileSync(join(project, ".fomo", "omo.json"), JSON.stringify({
      agents: { sisyphus: { models: ["project/should-not-load"] } },
    }))

    // when
    const result = loadOmoConfig({
      cwd: project, env: { ...env, OMO_DISABLE_PROJECT_CONFIG: "1" }, harness: "opencode",
    })

    // then
    expect(result.config.agents?.sisyphus?.models).toEqual(["isolated/model"])
    expect(result.sources.filter((source) => source.loaded).map((source) => source.path))
      .toEqual([join(home, ".fomo", "omo.json")])
  })

  test("#given a private runtime HOME and explicit user config directory #when loading #then the user file is loaded once", () => {
    // given
    const { home, project, env } = fixture()
    const runtimeEnv = {
      ...env,
      HOME: join(home, "runtime-home"),
      OMO_USER_CONFIG_DIR: join(home, ".fomo"),
    }

    // when
    const result = loadOmoConfig({ cwd: project, env: runtimeEnv, harness: "senpi" })

    // then
    expect(result.diagnostics).toEqual([])
    expect(result.sources.filter((source) => source.loaded).map(({ path, scope }) => ({ path, scope })))
      .toEqual([
        { path: join(home, ".fomo", "omo.json"), scope: "user" },
        { path: join(project, ".fomo", "omo.json"), scope: "project" },
      ])
  })

  test("#given an explicit user config directory #when writing user settings #then the runtime HOME is not used", () => {
    // given
    const { home, env } = fixture()
    const runtimeEnv = {
      ...env,
      HOME: join(home, "runtime-home"),
      OMO_USER_CONFIG_DIR: join(home, ".fomo"),
    }

    // when
    const result = updateOmoConfig({
      env: runtimeEnv,
      scope: "user",
      edits: [{ path: ["agents", "sisyphus", "models"], value: ["isolated/replacement"] }],
    })

    // then
    expect(result.path).toBe(join(home, ".fomo", "omo.json"))
    expect(JSON.parse(readFileSync(result.path, "utf8")).agents.sisyphus.models).toEqual(["isolated/replacement"])
  })

  test.each(["", "relative/config", "../.omo"])(
    "#given relative user config directory %j #when resolving #then it is rejected",
    (directory) => {
      // given
      const env = { HOME: "/unused-home", OMO_USER_CONFIG_DIR: directory }

      // when / then
      expect(() => resolveUserOmoConfigPath(env)).toThrow(TypeError)
    },
  )

  test("#given conflicting omo and fomo files #when fomo loads #then only fomo user and project layers are read", () => {
    // given
    const { home, project, env } = fixture()

    // when
    const result = loadOmoConfig({ cwd: project, env, harness: "senpi" })

    // then
    expect(result.diagnostics).toEqual([])
    expect(result.config.agents?.sisyphus?.models).toEqual(["isolated/model"])
    expect(result.sources.filter((source) => source.loaded).map((source) => source.path)).toEqual([
      join(home, ".fomo", "omo.json"),
      join(project, ".fomo", "omo.json"),
    ])
  })

  test.each(["user", "project"] as const)(
    "#given conflicting namespace files #when fomo writes the %s scope #then production bytes remain unchanged",
    (scope) => {
      // given
      const { home, project, env } = fixture()
      const targetRoot = scope === "user" ? home : project
      const productionPath = join(targetRoot, ".omo", "omo.json")
      const productionBytes = readFileSync(productionPath, "utf8")

      // when
      const result = updateOmoConfig({
        env,
        scope,
        projectDir: project,
        edits: [{ path: ["agents", "sisyphus", "models"], value: ["isolated/replacement"] }],
      })

      // then
      expect(result.path).toBe(join(targetRoot, ".fomo", "omo.json"))
      expect(JSON.parse(readFileSync(result.path, "utf8"))).toEqual({
        agents: { sisyphus: { models: ["isolated/replacement"] } },
      })
      expect(readFileSync(productionPath, "utf8")).toBe(productionBytes)
    },
  )

  test.each(["", ".", "..", "../.omo", ".fomo/../.omo", ".fomo\\other", "/tmp", "fomo"])(
    "#given invalid namespace %j #when resolving a config path #then it is rejected before IO",
    (namespace) => {
      // given
      const env = { HOME: "/unused-home", OMO_CONFIG_NAMESPACE: namespace }

      // when / then
      expect(() => resolveUserOmoConfigPath(env)).toThrow(TypeError)
    },
  )
})
