/**
 * Claims that a question and its twin both grade.
 *
 * The strings are the identity. A miss closes on the twin only when the same
 * line appears there, so these constants are the only copy.
 */
export const SHARED_CLAIMS = {
  retrievalEval:
    "Retrieval is evaluated separately from generation because a single end-to-end score hides which half failed",
  accessControl:
    "Access is enforced in the retrieval query so a caller never receives a chunk they are not allowed to see",
  idempotencyKey:
    "An idempotency key must be generated once per logical operation, not once per attempt",
  boundedAttempts:
    "Total attempts are bounded and terminal failure is surfaced to the caller",
  frozenSet:
    "A frozen labelled set is what makes two versions of the feature comparable",
  judgeAgreement:
    "An LLM judge is unusable until its agreement with human labels is measured",
  qualityBar:
    "A cheaper or faster model ships only after it meets the same quality bar on a frozen eval",
  costPerOutcome: "Cost is measured per successful outcome rather than per model call",
  untrustedText:
    "Text from users and documents is treated as data and is never allowed to change the instructions or permissions the system runs with",
  schemaChecked:
    "Model output is checked by deterministic code against an expected format before anything acts on it",
  promptBaseline:
    "A prompt-only baseline is measured on a labelled eval set first so any later technique has a number to beat",
  failuresDecide:
    "Failed examples are sorted into missing knowledge or inconsistent behaviour before any technique is chosen",
  requestTrace:
    "Every request is logged with its prompt version, model version, retrieved context and cost so one bad answer can be traced",
  versionedChanges:
    "Prompts, model versions and retrieval settings are versioned so any change can be compared and rolled back",
} as const;
