import type { OmoAgentDef, OmoAgentModelEntry } from "@oh-my-opencode/omo-config-core"
import { SENPI_MAIN_AGENT_NAME } from "@oh-my-opencode/senpi-task"
import type { OmoSenpiComponent, SenpiMainModelContext, SenpiSessionModelPolicy } from "../../extension/types"
import { loadSenpiOmoConfig } from "../config-resolution"

const CHILD_MARKERS = [
  "OMO_SENPI_TASK_RPC_CHILD", "SENPI_TASK_MEMBER_TASK_ID", "SENPI_MEMORY_REFLECTION", "SENPI_MEMORY_FACTS", "SENPI_MEMORY_MEMORIAN",
] as const
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const
const TUNING_FIELDS = ["model", "reasoning"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// The engine builds its extension context from getters that assert the context is still active, so
// probing cwd or sessionSettings on a context invalidated by a session replacement or reload throws.
// This runs on session_start, so letting that escape would surface an extension stack instead of a
// session: a stale context simply carries no policy surface.
function hasModelPolicyContext(value: unknown): value is SenpiMainModelContext {
  try {
    return isRecord(value)
      && (value.cwd === undefined || typeof value.cwd === "string")
      && isRecord(value.sessionSettings)
      && typeof value.sessionSettings.setModelPolicy === "function"
  } catch {
    return false
  }
}

/**
 * MAIN candidates for the Sisyphus agent policy. `models` is authoritative when present, matching
 * the OpenCode lowering that treats entry zero as primary and the rest as ordered fallbacks; the
 * legacy `model` field only applies when `models` is absent.
 */
function mainModelEntries(agent: OmoAgentDef | undefined): readonly OmoAgentModelEntry[] | undefined {
  if (agent === undefined) return undefined
  if (agent.models !== undefined && agent.models.length > 0) return agent.models
  if (agent.model === undefined) return undefined
  const reasoning = agent.reasoning ?? agent.reasoningEffort
  return [reasoning === undefined ? agent.model : { model: agent.model, reasoning }]
}

function resolvePolicy(entries: readonly OmoAgentModelEntry[]): SenpiSessionModelPolicy {
  return { models: entries.map((entry) => {
    const raw = typeof entry === "string" ? entry : entry.model
    const suffix = raw.match(/^(.*):(off|minimal|low|medium|high|xhigh|max|auto)$/)
    const model = suffix?.[1] ?? raw
    const reasoning = (typeof entry === "string" ? undefined : entry.reasoning) ?? suffix?.[2]
    const thinkingLevel = THINKING_LEVELS.find((level) => level === reasoning)
    if (reasoning !== undefined && reasoning !== "auto" && thinkingLevel === undefined) {
      throw new Error(`Unsupported Senpi main model reasoning: ${reasoning}`)
    }
    return { model, ...(thinkingLevel === undefined ? {} : { thinkingLevel }) }
  }) }
}

export function createMainModelsComponent(options: {
  env?: NodeJS.ProcessEnv
  loadConfig?: typeof loadSenpiOmoConfig
} = {}): OmoSenpiComponent {
  return {
    name: "main-models",
    register(pi, ctx) {
      const env = options.env ?? process.env
      if (CHILD_MARKERS.some((marker) => !!env[marker] && env[marker] !== "0")) return
      const loadConfig = options.loadConfig ?? loadSenpiOmoConfig
      let blocked: string | undefined
      pi.on("input", async () => {
        if (!blocked) return
        await pi.sendMessage({ customType: "omo-main-models:error", content: blocked, display: true })
        return { action: "handled" }
      })
      pi.on("session_start", async (payload, eventContext) => {
        const eventCtx = hasModelPolicyContext(eventContext) ? eventContext : undefined
        const config = loadConfig({ cwd: eventCtx?.cwd ?? pi.cwd ?? process.cwd() }).config
        const agent = config.agents?.[SENPI_MAIN_AGENT_NAME]
        const entries = mainModelEntries(agent)
        const reload = isRecord(payload) && payload.reason === "reload"
        blocked = undefined
        if (!entries && !reload) return
        const settings = eventCtx?.sessionSettings
        if (!settings) {
          if (entries) {
            blocked = `omo-senpi: agents.${SENPI_MAIN_AGENT_NAME}.models requires an engine with sessionSettings.setModelPolicy. Input is blocked; upgrade the engine or remove that policy and reload.`
            ctx.logger.error(blocked)
          }
          return
        }
        try {
          const unsupported = entries?.some((entry) => typeof entry !== "string"
            && Object.keys(entry).some((key) => !TUNING_FIELDS.some((field) => field === key)))
          if (unsupported) {
            ctx.logger.warn(`omo-senpi: agents.${SENPI_MAIN_AGENT_NAME}.models supports model and reasoning only; other tuning fields are not applied`)
          }
          await settings.setModelPolicy(entries ? resolvePolicy(entries) : undefined)
        } catch (error) {
          blocked = `omo-senpi: agents.${SENPI_MAIN_AGENT_NAME}.models could not be applied. Input is blocked; correct the model policy and reload.`
          ctx.logger.error(blocked, error)
        }
      })
    },
  }
}
