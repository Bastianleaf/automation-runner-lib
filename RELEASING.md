# Releasing

Versions are not chosen by hand: they are computed from commit messages. The rules below are enforced
by [commitlint](commitlint.config.js) (locally and in CI) and applied by
[release-please](release-please-config.json).

## The rules

| Commit | Effect on the version | In the changelog |
|---|---|---|
| `feat: ...` | minor (`0.1.0` → `0.2.0`) | Features |
| `fix: ...` | patch (`0.1.0` → `0.1.1`) | Bug fixes |
| `perf: ...` | patch | Performance |
| `revert: ...` | patch | Reverts |
| any type with `!` (`feat!: ...`) or a `BREAKING CHANGE:` footer | major (before `1.0.0`: minor) | Features / Bug fixes, flagged as breaking |
| `docs`, `refactor`, `test`, `build`, `ci`, `chore` | no release on their own | hidden |

Allowed scopes: `runner`, `adapters`, `outputs`, `state`, `cli`, `examples`, `release`, `deps`.
The header is at most 72 characters and the subject does not start with a capital letter.

While the version is below `1.0.0` (`bump-minor-pre-major`), a breaking change bumps the minor, not the
major, so `0.x` can still evolve its API without jumping to `1.0.0` by accident. The `1.0.0` release
is a deliberate decision: add `Release-As: 1.0.0` as a footer of a commit.

## The flow

1. Work on a branch with Conventional Commits and open a PR. CI checks types, tests, build, every
   commit message, the PR title and secrets (`gitleaks`).
2. Merge to `main` (use the PR title as the squash message, it is linted for this reason).
3. release-please opens or updates a PR named `chore(main): release X.Y.Z` with the bump and the
   `CHANGELOG.md` entry. Nothing is released yet: review the changelog there.
4. Merge that PR. release-please creates the `vX.Y.Z` tag and the GitHub Release.
5. Consumers pin the tag: `"automation-runner-lib": "github:Bastianleaf/automation-runner-lib#vX.Y.Z"`.
   The package builds itself on install (`prepare`), so no `dist/` is committed.

## Local guard (optional)

```sh
git config core.hooksPath .githooks   # rejects a bad commit message before it is created
npx commitlint --from origin/main     # lint everything you have not pushed yet
```

## Why a git tag and not npm

Nothing here needs a registry: the repository is public, so a tag installs without credentials. If a
registry page ever becomes useful, add a publish step to the release workflow (`if: release_created`);
the versioning rules above do not change.
