import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"

const digest = (value, encoding = "hex") => createHash("sha256").update(value).digest(encoding)

function artifactDigests(text) {
  const offset = text.startsWith("#!") ? text.indexOf("\n") + 1 : 0
  const end = text.indexOf("\n", offset)
  const marker = /^\/\/ omo:([A-Za-z0-9_-]{43}):([A-Za-z0-9_-]{43})$/.exec(text.slice(offset, end))
  const body = marker === null ? text : text.slice(0, offset) + text.slice(end + 1)
  return {
    fileSha256: digest(text),
    sourceDigest: marker?.[1] ?? null,
    declaredBodyDigest: marker?.[2] ?? null,
    computedBodyDigest: digest(body, "base64url"),
  }
}

export async function writeBuildFailureDiagnostics({ directory, repoRoot, mismatches, metadata, buildSettings }) {
  await mkdir(directory, { recursive: true })
  const bun = spawnSync(process.platform === "win32" ? "bun.exe" : "bun", ["--revision"], { encoding: "utf8" })
  if (bun.error !== undefined) throw bun.error
  if (bun.status !== 0) throw new Error(`Bun revision probe exited ${bun.status}`)
  const artifacts = []
  for (const { output, rebuilt, current, expected } of mismatches) {
    const name = basename(output)
    const target = join(directory, name)
    await mkdir(target, { recursive: true })
    const { metafile, entry, buildDefines } = metadata.get(rebuilt)
    const inputs = []
    for (const input of Object.keys(metafile.inputs).sort()) {
      const path = resolve(repoRoot, input)
      inputs.push({ path: relative(repoRoot, path).replaceAll("\\", "/"), sha256: digest(await readFile(path)) })
    }
    await Promise.all([
      writeFile(join(target, "current.js"), current),
      writeFile(join(target, "rebuilt.js"), expected),
      writeFile(join(target, "metafile.json"), JSON.stringify(metafile, null, 2) + "\n"),
      writeFile(join(target, "inputs.json"), JSON.stringify(inputs, null, 2) + "\n"),
    ])
    artifacts.push({
      name,
      current: artifactDigests(current),
      rebuilt: artifactDigests(expected),
      inputCount: inputs.length,
      entry: relative(repoRoot, entry).replaceAll("\\", "/"),
      buildDefines,
    })
  }
  const scripts = []
  for (const name of ["build-extension.mjs", "build-artifact.mjs"]) {
    const path = `packages/omo-senpi/plugin/scripts/${name}`
    scripts.push({ path, sha256: digest(await readFile(join(repoRoot, path))) })
  }
  await writeFile(join(directory, "comparison.json"), JSON.stringify({
    version: 1,
    reason: "stale-output",
    node: process.version,
    bun: bun.stdout.trim(),
    platform: process.platform,
    arch: process.arch,
    buildSettings: JSON.parse(buildSettings),
    scripts,
    artifacts,
  }, null, 2) + "\n")
}
