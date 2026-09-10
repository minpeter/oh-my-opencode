import { describe, expect, test } from "bun:test"

import { createTaskChildPlanner } from "./planner"

const omoConfig = { profiles: {}, categories: { sisyphus: { models: ["local/category"] } } } as never

describe("MAIN-role identities in the task planner", () => {
  test("#given an explicit model #when a MAIN identity is targeted #then it is rejected before the explicit path", () => {
    const plan = createTaskChildPlanner(omoConfig, {}, () => undefined)({
      subagent_type: "sisyphus",
      model: "local/explicit",
    } as never)

    expect(plan.kind).toBe("error")
    expect(plan.kind === "error" && plan.error.code).toBe("unknown_target")
  })

  test("#given a same-named category #when a MAIN identity is targeted #then category fallthrough is refused", () => {
    const plan = createTaskChildPlanner(omoConfig, {}, () => undefined)({
      subagent_type: "Sisyphus - ultraworker",
    } as never)

    expect(plan.kind).toBe("error")
    expect(plan.kind === "error" && plan.error.code).toBe("unknown_target")
  })

  test("#given an unrelated child target with an explicit model #when planned #then it still resolves", () => {
    const plan = createTaskChildPlanner(omoConfig, {}, () => undefined)({
      model: "local/explicit",
    } as never)

    expect(plan.kind).toBe("resolved")
  })
})
