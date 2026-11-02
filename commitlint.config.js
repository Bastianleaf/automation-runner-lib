// The release rules start here: release-please derives the next version from these commit types, so a
// commit that does not parse is a commit that cannot be released correctly.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "perf", "revert", "docs", "refactor", "test", "build", "ci", "chore"]],
    "scope-enum": [2, "always", ["runner", "adapters", "outputs", "state", "cli", "examples", "release", "deps"]],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [0],
  },
};
