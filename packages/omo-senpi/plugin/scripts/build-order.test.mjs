import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { builtinModules } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SENPI_LOADER_ALIASES } from "./build-extension.mjs"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))

test("task bundle bytes are independent of package barrel completion order", () => {
  const builtins = builtinModules.filter((name) => !name.startsWith("_")).sort()
  const version = JSON.parse(readFileSync(resolve(repoRoot, "packages/omo-senpi/package.json"), "utf8")).version
  const results = []
  // Hold the root until its consumers are parsed, or hold the late consumers until
  // the agents barrel is parsed. Deferring the agents barrel itself does not control
  // which export requests arrive first and can give a false green with sideEffects:false.
  for (const schedule of ["root-last", "consumers-last"]) {
    const config = {
      entrypoints: [resolve(repoRoot, "packages/omo-senpi/src/extension/omo-task.ts")],
      target: "node",
      format: "esm",
      minify: { syntax: true, whitespace: true, identifiers: false },
      define: { OMO_SENPI_PACKAGE_VERSION: JSON.stringify(version), OMO_SENPI_BUNDLED: "true" },
      external: ["#omo-task-runtime", ...SENPI_LOADER_ALIASES, ...builtins, ...builtins.map((name) => `node:${name}`)],
      metafile: true,
    }
    // A fresh compiler per schedule must not inherit the test preload's resolver cache.
    const child = spawnSync(process.execPath, ["--eval", `(${scheduledBuild.toString()})(${JSON.stringify(config)}, ${JSON.stringify(schedule)})`], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 25_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    expect({ status: child.status, error: child.error, stderr: child.stderr }).toEqual({ status: 0, error: undefined, stderr: "" })
    results.push(JSON.parse(child.stdout))
  }
  expect(results[0].inputs).toEqual(results[1].inputs)
  // Compare exact bytes, not hashes or normalized declarations. Include graph evidence
  // in the assertion diagnostic without dumping the megabyte-sized emitted bodies.
  expect({ equalBytes: results[0].body === results[1].body, graphs: results.map((result) => result.agentsImports) })
    .toMatchObject({ equalBytes: true })
}, 60_000)

async function scheduledBuild(config, schedule) {
  const { readFileSync } = await import("node:fs")
  const { createHash } = await import("node:crypto")
  const { relative, resolve } = await import("node:path")
  const root = "packages/senpi-task/src/index.ts"
  const agents = "packages/senpi-task/src/agents/index.ts"
  const consumers = ["engine-runners", "planner"].map((name) => `packages/omo-senpi/src/components/task/${name}.ts`)
  const delayed = schedule === "root-last" ? [root] : consumers
  const parsedBeforeResume = schedule === "root-last" ? consumers : [agents]
  const loaded = new Set()
  const resumed = []
  const events = []
  const result = await Bun.build({
    ...config,
    plugins: [{
      name: "controlled-barrel-completion",
      setup(build) {
        build.onLoad({ filter: /[\\/]senpi-task[\\/]src[\\/](agents[\\/])?index\.ts$|[\\/]omo-senpi[\\/]src[\\/]components[\\/]task[\\/](engine-runners|planner)\.ts$/ }, async (args) => {
          const path = relative(process.cwd(), args.path).replaceAll("\\", "/")
          loaded.add(path)
          events.push({ event: "load", path })
          if (!delayed.includes(path)) return
          // Bun resolves defer only when all other pending modules have been parsed.
          await args.defer()
          for (const required of parsedBeforeResume) {
            if (!loaded.has(required)) throw new Error(`Schedule ${schedule} did not parse ${required} before ${path}`)
          }
          resumed.push(path)
          events.push({ event: "resume", path })
          return { contents: readFileSync(args.path, "utf8"), loader: "ts" }
        })
      },
    }],
  })
  if (!result.success) throw new Error(JSON.stringify(result.logs))
  if (resumed.length !== delayed.length || delayed.some((path) => !resumed.includes(path))) {
    throw new Error(`Incomplete schedule ${schedule}: ${JSON.stringify(events)}`)
  }
  const inputs = Object.keys(result.metafile.inputs).sort().map((path) => ({
    path: path.replaceAll("\\", "/"),
    sha256: createHash("sha256").update(readFileSync(resolve(path))).digest("hex"),
  }))
  const body = await result.outputs[0].text()
  const agentsImports = result.metafile.inputs[agents].imports
  console.log(JSON.stringify({ body, inputs, agentsImports, events }))
}
