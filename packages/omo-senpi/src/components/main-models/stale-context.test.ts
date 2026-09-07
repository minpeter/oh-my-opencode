import { describe, expect, mock, test } from "bun:test"
import type { OmoConfig } from "@oh-my-opencode/omo-config-core"
import { FakeExtensionAPI } from "../../../test-support/fake-extension-api"
import { createMainModelsComponent } from "./main-models"

const STALE = "This extension ctx is stale after session replacement or reload."

function setup(config: OmoConfig) {
  const pi = new FakeExtensionAPI()
  const error = mock(() => {})
  const setModelPolicy = mock(async (_policy: unknown) => {})
  createMainModelsComponent({ env: {}, loadConfig: () => ({ config, diagnostics: [], layers: [], sources: [] }) })
    .register(pi, { config: { getFlag: (name) => pi.getFlag(name) }, logger: { debug() {}, info() {}, warn() {}, error } })
  return { pi, error, setModelPolicy }
}

const policyConfig = { agents: { sisyphus: { models: ["local/primary"] } }, profiles: {} } as OmoConfig

/** The engine context exposes cwd/sessionSettings as getters that assert the ctx is still active. */
function staleCwdContext(setModelPolicy: unknown): unknown {
  return {
    get cwd(): string { throw new Error(STALE) },
    sessionSettings: { setModelPolicy },
  }
}

function staleSettingsContext(): unknown {
  return {
    cwd: "/isolated/project",
    get sessionSettings(): unknown { throw new Error(STALE) },
  }
}

describe("main-models against a stale extension context", () => {
  test("#given a ctx whose cwd getter throws #when session_start fires #then it does not propagate", async () => {
    const h = setup(policyConfig)
    await expect(h.pi.dispatch("session_start", { reason: "startup" }, staleCwdContext(h.setModelPolicy))).resolves.toBeDefined()
  })

  test("#given a ctx whose sessionSettings getter throws #when session_start fires #then it does not propagate", async () => {
    const h = setup(policyConfig)
    await expect(h.pi.dispatch("session_start", { reason: "startup" }, staleSettingsContext())).resolves.toBeDefined()
  })

  test("#given a healthy ctx #when session_start fires #then the sisyphus chain still reaches setModelPolicy", async () => {
    const h = setup(policyConfig)
    await h.pi.dispatch("session_start", { reason: "startup" }, { cwd: "/isolated/project", sessionSettings: { setModelPolicy: h.setModelPolicy } })
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [{ model: "local/primary" }] })
  })
})
