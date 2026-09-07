/**
 * Canonical OMO primary (MAIN-role) agent identities.
 *
 * These names describe a session's MAIN role, not a spawnable child. OpenCode already encodes the
 * same distinction in its agent factories via `mode: "primary"`, and rejects delegating to a primary
 * agent through the task tool. Senpi has no runtime mode on `OmoAgentDef`, so the role is recognized
 * internally by identity instead of adding a user-authored config field.
 */
export const RESERVED_PRIMARY_AGENT_NAMES: ReadonlySet<string> = new Set([
  "sisyphus",
  "atlas",
  "prometheus",
  "hephaestus",
])

/** The MAIN identity whose configured model chain supplies Senpi's MAIN session policy. */
export const SENPI_MAIN_AGENT_NAME = "sisyphus"

/**
 * Normalizes a requested target to its config key: display spellings such as
 * `"Sisyphus - ultraworker"` and casing/padding variants resolve to the bare identity.
 */
export function primaryAgentIdentity(name: string): string {
  const trimmed = name.trim().toLowerCase()
  const separatorIndex = trimmed.indexOf(" - ")
  return separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex).trim()
}

/**
 * True when the requested target names a MAIN-role identity. Child-scoped names that merely share a
 * prefix (for example `sisyphus-junior`) stay callable.
 */
export function isReservedPrimaryAgentName(name: string): boolean {
  return RESERVED_PRIMARY_AGENT_NAMES.has(primaryAgentIdentity(name))
}
