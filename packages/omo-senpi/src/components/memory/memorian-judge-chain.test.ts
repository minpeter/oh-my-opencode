import { describe, expect, test } from "bun:test"

import { memorianJudgeChain } from "./memorian-judge-chain"

describe("memorianJudgeChain", () => {
  test("#given a resolved quick chain #when converted #then the primary selector and the in-category fallback records are produced", () => {
    // given / when
    const chain = memorianJudgeChain({
      kind: "resolved",
      category: "quick",
      model: "omo-mock/mock-1",
      thinking: "low",
      fallbacks: [{ model: "omo-mock/mock-2" }, { model: "apitopia/z-ai/glm-5.3", thinking: "high" }],
    })

    // then: the chain key is the bare primary selector; a nested-slash model id keeps its provider split
    // at the first slash, and a candidate's thinking level rides on the canonical `reasoning` field.
    expect(chain).toEqual({
      selectedModel: "omo-mock/mock-1",
      fallbackModels: [
        { provider: "omo-mock", model_id: "mock-2", display: "omo-mock/mock-2", source: "category" },
        { provider: "apitopia", model_id: "z-ai/glm-5.3", display: "apitopia/z-ai/glm-5.3", reasoning: "high", source: "category" },
      ],
    })
  })

  test("#given a single-model quick category #when converted #then the fallback list is empty", () => {
    expect(memorianJudgeChain({ kind: "resolved", category: "quick", model: "omo-mock/mock-1", fallbacks: [] }))
      .toEqual({ selectedModel: "omo-mock/mock-1", fallbackModels: [] })
  })
})
