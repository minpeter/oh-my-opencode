import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { resolveOmoConfigWatchTargets } from "./paths"
import { createOmoConfigValidator } from "./validate"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fomo-config-watch-"))
  roots.push(root)
  const home = join(root, "home")
  const project = join(home, "project")
  const cwd = join(project, "child")
  mkdirSync(cwd, { recursive: true })
  return {
    home, project, cwd,
    env: { HOME: home, OMO_CONFIG_NAMESPACE: ".fomo", SENPI_CODING_AGENT_DIR: join(home, ".fomo", "agent") },
  }
}

function write(path: string, contents = "{}") {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

test("#given both namespaces and a protected fomo agent home #when resolving watches #then only fomo configuration and safe creation targets are registered", () => {
  const item = fixture()
  for (const directory of [item.home, item.project]) {
    for (const namespace of [".fomo", ".omo"]) write(join(directory, namespace, "omo.jsonc"))
  }
  const targets = resolveOmoConfigWatchTargets(item)
  expect([...new Set(targets.filter((target) => target.filterGlobs.includes("/omo.jsonc")).map((target) => target.path))]).toEqual([
    join(item.home, ".fomo"), join(item.project, ".fomo"),
  ])
  const creationTargets = targets.filter((target) => target.filterGlobs.includes("/.fomo"))
  expect(creationTargets.map((target) => target.path)).toEqual([item.cwd, item.project])
  for (const target of creationTargets) expect(target.filterGlobs).toEqual(["/.fomo", "/.fomo/omo.jsonc", "/.fomo/omo.json"])
  expect(targets.some((target) => target.path.includes(`${join("", ".omo")}/`) || target.path.endsWith("/.omo") || target.filterGlobs.includes("/.omo"))).toBe(false)
})

test("#given a symlinked fomo project directory #when resolving watches #then only its parent creation target remains", () => {
  const item = fixture()
  write(join(item.home, "elsewhere", "omo.jsonc"))
  symlinkSync(join(item.home, "elsewhere"), join(item.project, ".fomo"))
  const targets = resolveOmoConfigWatchTargets(item)
  expect(targets.some((target) => target.path === join(item.project, ".fomo"))).toBe(false)
  expect(targets.some((target) => target.path === item.project && target.filterGlobs.includes("/.fomo"))).toBe(true)
})

test("#given deleting fomo JSONC exposes an invalid sibling JSON #when validating #then same-directory attribution rejects until repaired", () => {
  const item = fixture()
  const jsonc = join(item.project, ".fomo", "omo.jsonc")
  const json = join(item.project, ".fomo", "omo.json")
  write(jsonc)
  write(json, '{"task":')
  write(join(item.project, ".omo", "omo.jsonc"), '{"task":')
  const validator = createOmoConfigValidator(item)
  unlinkSync(jsonc)
  expect(validator.validate([jsonc]).ok).toBe(false)
  write(json)
  expect(validator.validate([json])).toEqual({ ok: true })
})

test("#given an invalid namespace #when preparing watch targets or validator #then TypeError is thrown", () => {
  const item = fixture()
  const options = { ...item, env: { ...item.env, OMO_CONFIG_NAMESPACE: "../outside" } }
  expect(() => resolveOmoConfigWatchTargets(options)).toThrow(TypeError)
  expect(() => createOmoConfigValidator(options)).toThrow(TypeError)
})
