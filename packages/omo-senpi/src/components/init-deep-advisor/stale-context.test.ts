/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import type { ExtensionContext } from "@code-yeongyu/senpi"

import { runAdvisor } from "./component"
import {
  AdvisorFakeExtensionAPI,
  componentContext,
  makeCoverageRepo,
  resetTestHome,
  setTestHome,
} from "./component.test-support"

const STALE = "This extension ctx is stale after session replacement or reload."

beforeEach(() => setTestHome())
afterEach(() => {
  mock.restore()
  resetTestHome()
})

/**
 * The advisor reads eventCtx.ui AFTER an await, and the engine exposes `ui` as a getter that
 * asserts the context is still active. A reload landing in that window therefore throws out of the
 * session_start handler instead of simply skipping the prompt.
 */
describe("init-deep advisor against a stale extension context", () => {
  test("#given a ctx whose ui getter throws #when startup runs #then it does not propagate", async () => {
    const root = makeCoverageRepo()
    const pi = new AdvisorFakeExtensionAPI()
    const eventCtx = {
      cwd: root,
      hasUI: true,
      get ui(): unknown { throw new Error(STALE) },
    } as unknown as ExtensionContext

    await expect(runAdvisor(pi, componentContext, eventCtx)).resolves.toBeUndefined()
    expect(pi.messages).toEqual([])
  })
})
