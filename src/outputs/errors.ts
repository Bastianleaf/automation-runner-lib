/**
 * Base for "this output has no credentials configured yet". The runner reports it as
 * `not_configured` and the run itself still succeeds, instead of counting a delivery failure.
 */
export class OutputNotConfiguredError extends Error {}
