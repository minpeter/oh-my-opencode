import { describe, expect, test } from "bun:test"

import { mapOmoConfigAgents } from "./omo-config-agents"

describe("MAIN-role identities in child agent mapping", () => {
  test("#given a configured sisyphus model chain #when child agents are mapped #then the MAIN identity is not a child", () => {
    const agents = mapOmoConfigAgents({
      agents: {
        sisyphus: { models: ["local/primary", "local/second"] },
        reviewer: { models: ["local/reviewer"] },
      },
      profiles: {},
    })

    expect(Object.keys(agents)).toEqual(["reviewer"])
  })

  test("#given every canonical primary name #when mapped #then none are spawnable and child-scoped names survive", () => {
    const agents = mapOmoConfigAgents({
      agents: {
        sisyphus: { model: "local/a" },
        atlas: { model: "local/b" },
        prometheus: { model: "local/c" },
        hephaestus: { model: "local/d" },
        "sisyphus-junior": { model: "local/e" },
      },
      profiles: {},
    })

    expect(Object.keys(agents)).toEqual(["sisyphus-junior"])
  })
})
