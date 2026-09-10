import { describe, expect, test } from "bun:test"

import { isReservedPrimaryAgentName, RESERVED_PRIMARY_AGENT_NAMES } from "./primary-agents"

describe("reserved primary agent identities", () => {
  test("#given the canonical OMO primary names #when checked #then they are reserved", () => {
    for (const name of ["sisyphus", "atlas", "prometheus", "hephaestus"]) {
      expect(isReservedPrimaryAgentName(name)).toBe(true)
      expect(RESERVED_PRIMARY_AGENT_NAMES.has(name)).toBe(true)
    }
  })

  test("#given display spellings and casing #when checked #then identity still matches", () => {
    expect(isReservedPrimaryAgentName("Sisyphus")).toBe(true)
    expect(isReservedPrimaryAgentName("  Atlas  ")).toBe(true)
    expect(isReservedPrimaryAgentName("Sisyphus - ultraworker")).toBe(true)
  })

  test("#given unrelated or child-scoped names #when checked #then they stay callable", () => {
    for (const name of ["sisyphus-junior", "plan", "explore", "librarian", "reviewer", ""]) {
      expect(isReservedPrimaryAgentName(name)).toBe(false)
    }
  })
})
