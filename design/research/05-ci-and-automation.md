# CI and automation in dual-runtime plugin repos

Research date: 2026-09-26. Theme: the GitHub Actions and repo automation that
keep a Claude Code and Codex plugin repo working, clean, and current.

Local CLI versions: Claude Code 2.1.283, which is the npm `latest`, and Codex
0.154.0. The npm `latest` for `@openai/codex` is 0.157.1. Some Codex checks
were repeated on 0.157.1.

Quotes from other repos have their em dashes replaced with colons or commas
to match house style. The wording is otherwise unchanged.

## Our baseline

- `.github/workflows/daily-build.yml` is named "Verify generated skill". It
  runs on every `push`, every `pull_request`, and `workflow_dispatch`. It
  runs `node tools/sync.mjs --check`, `node tools/build.mjs --check`, and
  `node --test tests/*.test.mjs`. It pins actions by tag (`@v5`).
- `.github/workflows/upstream-bump.yml` runs daily at 06:41 UTC. It runs
  `sync.mjs --latest`, opens or updates the `upstream-bump` PR with
  `peter-evans/create-pull-request@v8`, dispatches `daily-build.yml` on that
  branch, and opens or comments on an issue when a bump fails (D18).
- D21 keeps the real-CLI tests local because they need signed-in CLIs.
- No Dependabot, no workflow lint, no version-bump check, no release tags.

## Sources

Every listed repo was shallow-cloned on 2026-09-26 under
`$S/repos/<owner>-<name>`, where `$S` is the session scratchpad.
`obra/superpowers` has a `.github/` directory but no workflows, so it
appears only in the hygiene sections. The `agentic-awesome-skills` clone
has origin `https://github.com/sickn33/agentic-awesome-skills.git`.

## 1. Workflow inventory

88 workflows across 17 repos. "CLI" means the workflow installs the real
`claude` or `codex` binary. "Model" means it runs a model session, which
needs a credential.

| Repo | File | Triggers | What it runs | CLI in CI | Secrets |
| --- | --- | --- | --- | --- | --- |
| affaan-m/everything-claude-code | ci.yml | push main, `release/**`, `v*` tags; PR main | Test matrix of 3 OS, Node 18/20/22, npm/pnpm/yarn/bun; npm pack plus packed-install lifecycle; `scripts/ci/validate-{agents,hooks,commands,skills,install-manifests,workflow-security,rules}.js`, `check-unicode-safety.js`, `validate-no-personal-paths.js`; ruff, mypy, pytest; `npm run lint` (eslint and markdownlint) | None | None |
| affaan-m/everything-claude-code | discussion-announce.yml | discussion created; dispatch | Discord announcement | None | DISCORD_ANNOUNCE_WEBHOOK_URL |
| affaan-m/everything-claude-code | generator-generic-ossf-slsa3-publish.yml | release published; dispatch | npm pack, SLSA3 provenance | None | None |
| affaan-m/everything-claude-code | maintenance.yml | weekly Mon 09:00; dispatch | `npm outdated`, `actions/stale` | None | None |
| affaan-m/everything-claude-code | monthly-metrics.yml | monthly; dispatch | Metrics snapshot via github-script | None | None |
| affaan-m/everything-claude-code | release-announce.yml | workflow_run of Release | Discord announcement | None | DISCORD_ANNOUNCE_WEBHOOK_URL |
| affaan-m/everything-claude-code | release.yml | push `v*` tags | IOC scan, tag format and tag equals package version, manifest test, npm publish with provenance, `softprops/action-gh-release` | None | NPM_TOKEN |
| affaan-m/everything-claude-code | reusable-release.yml | workflow_call; dispatch | Same as release.yml for a given tag | None | NPM_TOKEN |
| affaan-m/everything-claude-code | reusable-test.yml | workflow_call | Test matrix | None | None |
| affaan-m/everything-claude-code | reusable-validate.yml | workflow_call | The validators from ci.yml | None | None |
| affaan-m/everything-claude-code | supply-chain-watch.yml | every 6 hours; dispatch | `npm audit signatures`, IOC scan, advisory refresh, workflow-security validator | None | None |
| affaan-m/everything-claude-code | taste-skills.yml | PR and push on skill paths | Python unittest for two skills | None | None |
| DietrichGebert/ponytail | publish.yml | push `v*` tags; dispatch | `npm publish` through OIDC (`id-token: write`) | None | None |
| DietrichGebert/ponytail | test.yml | push main and `v*` tags; PR | `check-rule-copies.js`, `check-versions.js`, `npm test` | None | None |
| garrytan/gstack | actionlint.yml | push main; PR | actionlint in Docker pinned by digest | None | None |
| garrytan/gstack | ci-image.yml | weekly; push main on Dockerfile paths; dispatch | Builds the CI image, which contains `@anthropic-ai/claude-code@2.1.251` | Baked into image | GITHUB_TOKEN |
| garrytan/gstack | cso-runtime-images.yml | PR on CSO paths; dispatch | Builds, attests, and SBOMs runtime images | None | GITHUB_TOKEN |
| garrytan/gstack | cso-runtime-promote.yml | dispatch | Catalog promotion PR from attestations | None | None |
| garrytan/gstack | cso-runtime-qualification.yml | repository_dispatch | Qualification evidence | None | None |
| garrytan/gstack | cso-scanner-images.yml | dispatch | Scanner images, including semgrep | None | GITHUB_TOKEN |
| garrytan/gstack | dependency-review.yml | PR on package files | `actions/dependency-review-action` | None | None |
| garrytan/gstack | evals-periodic.yml | weekly Mon 06:00; dispatch | Paid eval shards in the CI image; opens a triage issue when red | Claude 2.1.251, model | ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY |
| garrytan/gstack | evals.yml | PR main; dispatch | Diff-selected gate-tier paid evals | Claude 2.1.251, model | Same three keys |
| garrytan/gstack | free-tests.yml | PR; push main; dispatch | 20-shard free suite, Playwright, `gen:skill-docs` | None | None |
| garrytan/gstack | make-pdf-gate.yml | PR on make-pdf paths | PDF copy-paste gate | None | None |
| garrytan/gstack | osv-scanner.yml | weekly; dispatch | Google OSV scanner reusable workflow | None | None |
| garrytan/gstack | pr-title-sync.yml | pull_request_target on `VERSION` | Rewrites PR title from `VERSION` | None | GITHUB_TOKEN |
| garrytan/gstack | quality-gate.yml | PR; push main; dispatch | `slop:diff`, `bun audit`, shellcheck, `.github/scripts/gate-secret-scan.mjs` on added lines | None | None |
| garrytan/gstack | skill-docs.yml | push main; PR | `gen:skill-docs --host all`, `git diff --exit-code`, fails on untracked strays | None | None |
| garrytan/gstack | version-gate.yml | PR on `VERSION`, `CHANGELOG.md`, `package.json` | Checks `VERSION` against the next free slot in the PR queue | None | GITHUB_TOKEN |
| garrytan/gstack | windows-free-tests.yml | PR main; dispatch | Windows test lanes | None | None |
| garrytan/gstack | windows-setup-e2e.yml | PR on setup paths; dispatch | Windows setup end to end | None | None |
| JuliusBrussee/caveman | agent-conformance.yml | daily 04:17; dispatch | Registry compile plus diff; one pinned probe per shipped profile; pinned-binary matrix of 10 agents; nightly `@latest` drift matrix that opens or updates issues | Claude 2.1.276 and Codex 0.155.0 pinned, plus `@latest`; version and help probe only | None |
| JuliusBrussee/caveman | ci.yml | push main; PR | Installer and hook tests, Python, Go, Docker | None | None |
| JuliusBrussee/caveman | engine-ci.yml | push main; PR; dispatch | Go, pnpm, Python, Playwright | None | None |
| JuliusBrussee/caveman | middleware-python.yml | push and PR on paths | pytest | None | None |
| JuliusBrussee/caveman | profiles.yml | PR on `agents/profiles/**` | Profile scope check, compile plus `git diff --exit-code` | None | None |
| JuliusBrussee/caveman | provider-catalog.yml | PR on catalog paths | Catalog validation | None | None |
| JuliusBrussee/caveman | release-binaries.yml | push `bin-v*` tags | Build, sign checksums, GitHub release | None | CAVEMAN_BINARY_SIGNING_PRIVATE_KEY_PEM |
| JuliusBrussee/caveman | release-packages.yml | push package tags | npm and PyPI publish through OIDC | None | None |
| JuliusBrussee/caveman | sync-skill.yml | push main on skill paths | Copies `SKILL.md` into `plugins/`, zips `.skill`, commits back | None | GITHUB_TOKEN |
| addyosmani/agent-skills | test-plugin-install.yml | push; PR; dispatch | Skill, version, command, link, and path validators; evals; hook tests; `claude plugin validate .`; `claude plugin marketplace add ./`; `claude plugin install agent-skills@addy-agent-skills --scope user` | Claude unpinned: validate and install | None |
| wshobson/agents | claude-code-review.yml | PR | `anthropics/claude-code-action` review | Model | CLAUDE_CODE_OAUTH_TOKEN |
| wshobson/agents | claude.yml | issue and review comments | `@claude` action | Model | CLAUDE_CODE_OAUTH_TOKEN |
| wshobson/agents | code-quality.yml | PR main; push main; dispatch | ruff, ty, markdownlint-cli2 with a narrow `.markdownlint.json` | None | None |
| wshobson/agents | eval-report.yml | weekly Mon 06:00; dispatch | Plugin eval report | None | WANDB_API_KEY |
| wshobson/agents | mlops.yml | dispatch; `model/*` tags | Lint, test, Hugging Face push | None | HF_TOKEN |
| wshobson/agents | validate.yml | PR main; push main; dispatch | JSON validity, marketplace entries resolve, name collisions, pytest, `make generate-all` plus `git status --porcelain`, `make validate STRICT=1`; real-CLI smoke job | OpenCode 1.18.30, Antigravity, Pi 0.85.1; not Claude or Codex | None |
| EveryInc/compound-engineering-plugin | ci.yml | push main; PR; dispatch | Semantic PR title; `release:validate`; cached `claude-code@2.1.220`; `claude plugin validate --strict` on `marketplace.json` and `plugin.json`; bun tests; Windows lane | Claude 2.1.220 pinned: validate | GITHUB_TOKEN |
| EveryInc/compound-engineering-plugin | pages.yml | push main; PR; dispatch | Jekyll `--strict_front_matter`, htmlproofer on internal links, deploy | None | None |
| EveryInc/compound-engineering-plugin | release-pr.yml | push main; dispatch | `googleapis/release-please-action@v4.4.0` with manifest | None | GITHUB_TOKEN |
| EveryInc/compound-engineering-plugin | release-preview.yml | dispatch | Previews the release bump | None | None |
| trailofbits/skills | claude-review.yml | PR opened, sync, reopened, ready | Gated on key presence; `claude_review.sh` posts a review | Claude `@latest`, model | ANTHROPIC_API_KEY (org) |
| trailofbits/skills | lint.yml | push main; PR main | pre-commit (ruff, shellcheck, shfmt, check-yaml/json/toml, detect-private-key, actionlint, zizmor, validators); bats; shell suites; pytest; JS suites with a "ran nothing" guard | None | None |
| trailofbits/skills | validate.yml | push main; PR main | Validator self-test; frontmatter; personal email scan; version-increment check; Claude and Codex loadability | Claude `@latest`: validate, install, list. Codex 0.146.0: `app-server` `plugin/list`, `plugin/read` | None |
| sickn33/agentic-awesome-skills | aas-agent-first-preview.yml | PR on paths; dispatch | npm pack plus installed-candidate check | None | None |
| sickn33/agentic-awesome-skills | actionlint.yml | PR and push on workflow paths; dispatch | `npm run lint:workflows` | None | None |
| sickn33/agentic-awesome-skills | ci.yml | push main; PR main; dispatch with `canonical_sync_pr` input | PR policy, validation, warning budget, references, tests, exact generated tree, PR evidence | None | None |
| sickn33/agentic-awesome-skills | codeql.yml | push; PR; weekly; dispatch | CodeQL | None | None |
| sickn33/agentic-awesome-skills | dependency-review.yml | PR main | `actions/dependency-review-action` | None | None |
| sickn33/agentic-awesome-skills | pages.yml | dispatch | Web app build, test, deploy | None | None |
| sickn33/agentic-awesome-skills | publish-npm.yml | release published | Tag equals `v` plus package version, audit, tests, `git diff --exit-code`, publish | None | NPM_TOKEN |
| sickn33/agentic-awesome-skills | repo-hygiene.yml | weekly Mon 07:00; dispatch | `sync:repo-state`, generated-files boundary, `peter-evans/create-pull-request` with GITHUB_TOKEN, merge after checks, dispatches main verification | None | None |
| sickn33/agentic-awesome-skills | skill-review.yml | PR on skill paths | Tessl semantic review, gated on token | None | TESSL_API_TOKEN, TESSL_TOKEN |
| OthmanAdi/planning-with-files | skill-optimize-apply.yml | issue_comment | Tessl optimize | None | None |
| OthmanAdi/planning-with-files | skill-review.yml | PR on `**/SKILL.md` | Tessl review | None | TESSL_API_TOKEN |
| OthmanAdi/planning-with-files | tests.yml | push master; PR; dispatch | pytest, vitest in three packages | None | None |
| stripe/ai | guard-skills.yml | PR on synced skill paths | Requests changes on PRs that hand-edit synced skills | None | GH_APP_STRIPE_AI_SYNC_CLIENT_ID, GH_APP_STRIPE_AI_SYNC_PEM |
| stripe/ai | main.yml | push main; PR main; dispatch | pnpm build, lint, prettier, test; Python | None | None |
| stripe/ai | npm_release_shared.yml | dispatch | npm publish through OIDC | None | None |
| stripe/ai | pypi_release.yml | dispatch | PyPI publish through OIDC | None | None |
| stripe/ai | sync-agent-plugin.yml | dispatch | Syncs the agent plugin branch | None | None |
| stripe/ai | sync-skills.yml | daily 00:00; dispatch | `node scripts/sync.js` from docs.stripe.com, commits to main with an App token | None | GH_APP_STRIPE_AI_SYNC_CLIENT_ID, GH_APP_STRIPE_AI_SYNC_PEM |
| expo/skills | check.yml | PR main; merge_group | Version-bump script self-test, skill limits, version-bump check, routing check, step summary, sticky PR comment | None | None |
| hashicorp/agent-skills | validate.yml | push main; PR main | `scripts/validate-structure.sh`, `scripts/check-links.py` | None | None |
| cloudflare/skills | semgrep.yml | PR; push main; monthly; dispatch | `semgrep scan --config=auto` pinned to 1.160.0 | None | None |
| android/skills | create-release.yml | dispatch with tag input | Bumps `.codex-plugin` version, zips, `gh release create` | None | ADR_GITHUB_BOT_PAT |
| android/skills | update-skills.yml | dispatch (hourly cron commented out) | Downloads `dac_skills.zip`, regenerates skill lists in both manifests, opens a PR with a PAT | None | ADR_GITHUB_BOT_PAT |
| thedotmack/claude-mem | ci.yml | PR; push main | Version-consistency test, typecheck, build, bun tests, clean-room smoke | None | None |
| thedotmack/claude-mem | claude.yml | issue and review comments | `anthropics/claude-code-action@v1` | Model | CLAUDE_CODE_OAUTH_TOKEN |
| thedotmack/claude-mem | close-tracked-issues.yml | issues closed; dispatch | github-script | None | None |
| thedotmack/claude-mem | convert-feature-requests.yml | issues labeled; dispatch | github-script | None | None |
| thedotmack/claude-mem | deploy-install-scripts.yml | push main on install paths; dispatch | Vercel deploy | None | VERCEL_ORG_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN |
| thedotmack/claude-mem | npm-publish.yml | push `v*` tags | Build, smoke, `npm publish` | None | NPM_TOKEN |
| thedotmack/claude-mem | summary.yml | issues opened | `actions/ai-inference` summary comment | None | GITHUB_TOKEN |
| thedotmack/claude-mem | windows.yml | PR on paths; push main | Windows tests | None | None |
| nyldn/claude-octopus | claude-octopus.yml | dispatch; PR; issue_comment | `scripts/orchestrate.sh` reviews | Claude 2.1.228 pinned, model | CLAUDE_CODE_OAUTH_TOKEN |
| nyldn/claude-octopus | test.yml | push main and develop; PR main; merge_group; nightly 02:00; dispatch | Change classification, vendor freshness (nightly only), `build-codex-skills.sh --check`, `sync-marketplace.sh --check`, shellcheck, portability lint, smoke, unit shards, integration | None | None |

## 2. Keyless loadability checks in other repos

Four repos install a real CLI in CI without a credential. Only one of them
exercises Codex plugin loading.

- **trailofbits/skills** is the only repo that proves both runtimes load
  the plugins. `.github/workflows/validate.yml` installs Claude Code at
  `@latest` and Codex pinned at `0.146.0`, then runs two scripts.
  - `.github/scripts/check_claude_loadability.py` sets `HOME` and
    `CLAUDE_CONFIG_DIR` to a temp directory. It runs
    `claude plugin validate --strict` on the marketplace and on each
    `plugins/<name>/.claude-plugin/plugin.json`, then
    `claude plugin marketplace add <repo>`,
    `claude plugin list --available --json`,
    `claude plugin install <name>@<marketplace>`, and
    `claude plugin list --json`. It fails on missing plugins, any entry in
    a plugin's `errors`, or an MCP server set that differs from the
    manifest.
  - `.github/scripts/check_codex_loadability.py` sets `HOME` and
    `CODEX_HOME` to a temp directory and writes
    `[features] plugins = true, plugin_hooks = true` to `config.toml`. It
    starts `codex app-server --listen stdio:// --enable plugins --enable
    plugin_hooks` with
    `CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG=1`. It sends JSON-RPC
    `initialize`, `initialized`, `plugin/list` with
    `{"cwds": [repo], "marketplaceKinds": ["local"]}`, and `plugin/read`
    per plugin. It fails on `marketplaceLoadErrors`, a missing plugin, or
    a skill count that differs from the `SKILL.md` files on disk.
  - The workflow comment on the Claude install explains the choice: "a
    Claude Code release that breaks plugin loading turns every open PR red
    at once, with no commit here to explain it. That is the intended trade.
    A pin nobody remembers to bump is worse."
  - `.github/scripts/validate_plugin_metadata.py` forbids `.agents/` and
    `.codex-plugin/`: "Claude marketplace metadata is the single canonical
    source; Codex and other runtimes read it through that compatibility."
- **addyosmani/agent-skills** `.github/workflows/test-plugin-install.yml`
  runs `npm install -g @anthropic-ai/claude-code` unpinned, then
  `claude plugin validate .`, `claude plugin marketplace add ./`, and
  `claude plugin install agent-skills@addy-agent-skills --scope user`. It
  does not check Codex.
- **EveryInc/compound-engineering-plugin** `.github/workflows/ci.yml` pins
  `CLAUDE_CODE_VERSION: 2.1.220`, caches the install keyed on that version,
  and runs `bun run plugin:validate`, which is
  `claude plugin validate --strict .claude-plugin/marketplace.json && claude
  plugin validate --strict .claude-plugin/plugin.json`. `AGENTS.md` warns:
  "Do not use `claude plugin validate .`: that resolves this repo as a
  marketplace only ... and skips plugin-root checks."
- **JuliusBrussee/caveman** `.github/workflows/agent-conformance.yml`
  installs Claude and Codex, but `agents/probe-installed.mjs` checks only
  version and help output. It does not load plugins.
- **wshobson/agents** `validate.yml` runs real OpenCode, Antigravity, and
  Pi CLIs against generated artifacts. It does not install Claude or
  Codex.

The model-running workflows (gstack evals, trailofbits claude-review,
octopus, and the `claude-code-action` users) all need a key or OAuth token.
trailofbits reduces the key to a boolean in one step so the job "go[es]
quiet rather than red" when the key is missing.

## Local checks against adhd-unslop

All checks ran against `git clone --local` of this repo at `fc308bd`, in
`$S/au-copy`, so no CLI could write into the working tree. Every command
unset `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`, or `OPENAI_API_KEY`
and `CODEX_API_KEY`, and used a fresh config directory under `$S`. No
`auth.json` was copied. `git status --porcelain` on the real repo showed
only `design/idea1.md` afterwards, before this file was written.

### a. `claude plugin validate`

Command form:

```sh
env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN HOME=$T \
  CLAUDE_CONFIG_DIR=$T/claude claude plugin validate [--strict] <path> </dev/null
```

| Path | Resolved as | Default | `--strict` |
| --- | --- | --- | --- |
| repo root | `.claude-plugin/marketplace.json` | pass, exit 0 | pass, exit 0 |
| `.claude-plugin/marketplace.json` | marketplace | pass | pass |
| `plugins/adhd-unslop` | its `.claude-plugin/plugin.json` | pass | pass |
| `plugins/adhd-unslop/.claude-plugin/plugin.json` | plugin | pass | pass |
| `plugins/au-i-have-adhd/.claude-plugin/plugin.json` | plugin | pass | pass |
| `plugins/au-unslop/.claude-plugin/plugin.json` | plugin | pass | pass |

Each run printed `Validating ... manifest: <path>` and `✔ Validation
passed`. Validating the repo root checks only the marketplace, which
confirms the EveryInc warning. `validate` also has `--json`.

Negative cases on a throwaway copy show what validate catches:

| Change | Default | `--strict` |
| --- | --- | --- |
| `hooks.json` is invalid JSON | error, exit 1: "At runtime this breaks the entire plugin load." | exit 1 |
| `SKILL.md` frontmatter has no `description` | warning, exit 0 | exit 1 |
| Marketplace entry version `9.9.9`, `plugin.json` says `0.2.2` | warning, exit 0: "plugin.json wins ... the entry version is silently ignored" | exit 1 |
| Unknown key in `plugin.json` | warning, exit 0 | exit 1 |
| `CLAUDE.md` at a plugin root | warning, exit 0: "not loaded as project context" | exit 1 |
| Unknown hook event in `hooks.json` | warning, exit 0: "entry ignored at runtime" | exit 1 |
| Marketplace `source` points at a missing directory | pass, exit 0 | pass, exit 0 |
| Skill `name` is `Not_Kebab Case` | not tested in default | pass, exit 0 |

Only `--strict` turns most problems into failures. Validate does not check
that marketplace sources exist, so an install step is still needed.

trailofbits' script, copied unchanged to `$S/checks/`, also passes:

```sh
env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN TMPDIR=$S/checks \
  python3 check_claude_loadability.py $S/au-copy --claude-bin ~/.local/bin/claude
# loaded Claude marketplace adhd-unslop with 3 plugins and 0 MCP servers
# All Claude loadability checks passed
```

Installing only the composed plugin pulls in both dependencies without a
key:

```sh
claude plugin marketplace add $S/au-copy
# ✔ Successfully added marketplace: adhd-unslop (declared in user settings)
claude plugin install adhd-unslop@adhd-unslop
# ✔ Successfully installed plugin: adhd-unslop@adhd-unslop (scope: user)
#   (+ 2 dependencies: au-i-have-adhd, au-unslop)
claude plugin list --json
# three entries, versions 0.2.2, 0.1.0, 0.1.1, each with
# "installPath": "<CLAUDE_CONFIG_DIR>/plugins/cache/adhd-unslop/<plugin>/<version>"
claude plugin details adhd-unslop@adhd-unslop
# Skills (1)  adhd-unslop
# Hooks (1)  SessionStart  (harness-only, no model context cost)
# Always-on:   ~79 tok
```

The cache directory for `adhd-unslop/0.2.2` held real copies of all 16
shipped files. This local-path install copied files into the cache. D21 and
the platform facts table say a local path loads plugins in place. See
"Claims to test". `plugin details` has no `--json` option.

GitHub mode also works without a key:
`claude plugin marketplace add rubenvarela/adhd-unslop#main` cloned over
HTTPS, and `claude plugin install adhd-unslop@adhd-unslop` installed three
plugins into the cache.

### b. `codex app-server` plugin list

`$S/checks/codex_probe.py` follows trailofbits' protocol and saves the raw
JSON. It runs with `cwd` set to the clone:

```sh
env -u OPENAI_API_KEY -u CODEX_API_KEY python3 codex_probe.py $S/au-copy codex out/
# $ codex app-server --listen stdio:// --enable plugins --enable plugin_hooks
# initialize -> ok
# marketplaceLoadErrors: []
# marketplace name='adhd-unslop' path='au-copy/.agents/plugins/marketplace.json'
#   plugins=['au-i-have-adhd', 'au-unslop', 'adhd-unslop']
```

Results on Codex 0.154.0, repeated on 0.157.1:

- `plugin/list` returns exactly one `adhd-unslop` marketplace, from
  `.agents/plugins/marketplace.json`. The `.claude-plugin` file does not
  appear as a second marketplace.
- `plugin/read` succeeds with either marketplace path. Skills come back as
  `au-i-have-adhd:i-have-adhd`, `au-unslop:unslop`, and
  `adhd-unslop:adhd-unslop`.
- `adhd-unslop` reports four hooks with keys
  `adhd-unslop@adhd-unslop:hooks/hooks.json:session_start:0:0`, `0:1`,
  `0:2`, and `1:0`. These match the three chunk handlers and the
  dependency check in `hooks.json`.
- The plugin summary carries `localVersion: "0.2.2"`,
  `interface.displayName: "ADHD Unslop"`, and the `defaultPrompt` from
  `.codex-plugin/plugin.json`.
- The request and response fields that trailofbits' script uses work from
  its CI pin (0.146.0) through 0.157.1. 0.146.0 was not run here. Between
  0.154.0 and 0.157.1, the only visible change was a new `onboardingSkill`
  key in `plugin/read`.
- trailofbits' `check_codex_loadability.py`, unchanged, passes on both
  versions: "loaded marketplace adhd-unslop with 3 plugins, 3 skills, and 0
  MCP servers".

A second copy with `.agents/` and every `plugins/*/.codex-plugin/` removed
and committed:

- `plugin/list` found `adhd-unslop` at `.claude-plugin/marketplace.json`
  with all three plugins.
- `plugin/read` returned the same three skills and the same four hooks.
- The plugin-level interface came back empty: `displayName`,
  `shortDescription`, `defaultPrompt`, and `brandColor` were `null`, and
  `keywords` was `[]`. The skill-level interface from `agents/openai.yaml`
  was unchanged.

GitHub mode also works without a key or `auth.json`:

```sh
codex plugin marketplace add rubenvarela/adhd-unslop --ref main </dev/null
# Added marketplace `adhd-unslop` from https://github.com/rubenvarela/adhd-unslop.git#main.
codex plugin add adhd-unslop@adhd-unslop </dev/null
# Installed plugin root: <CODEX_HOME>/plugins/cache/adhd-unslop/adhd-unslop/0.2.2
codex plugin list </dev/null
# au-i-have-adhd@adhd-unslop  not installed
# au-unslop@adhd-unslop       not installed
# adhd-unslop@adhd-unslop     installed, enabled  0.2.2
```

This matches D15: Codex installs no dependencies.

### c. Gaps in our own checks

- A stray file added to `plugins/adhd-unslop/stray.md` and
  `plugins/adhd-unslop/skills/adhd-unslop/extra.md` passes
  `node tools/build.mjs --check` ("generated files are current") and
  `node --test` (64 tests, 63 pass, 0 fail). `tests/build.test.mjs` checks
  only the top-level directory names under `plugins/`. D10 says `plugins/`
  holds only shipped files, and nothing enforces it below the top level.
- Nothing checks D17's rule that a hand edit to shipped text needs a hand
  version bump.
- Hook output caps are already tested for both runtimes.
  `tests/hook.test.mjs` lines 50 to 59 render each chunk and require it to
  be under 9,000 characters and within its `additionalContextLimit`.
  `renderChunk()` in `plugins/adhd-unslop/hooks/lib.mjs` also refuses any
  chunk over `MAX_CHARS = 10000`.

## 3. Dependency and version hygiene

### Dependabot and Renovate

No repo uses Renovate. Six repos have `.github/dependabot.yml`.

| Repo | Ecosystems | Notes |
| --- | --- | --- |
| trailofbits/skills | `uv` (5 dirs), `github-actions` | Weekly, `cooldown: default-days: 7`, minor and patch grouped, majors separate |
| affaan-m/everything-claude-code | `npm`, `github-actions`, `pip` (2), `cargo` | Weekly Monday, security updates in their own group |
| garrytan/gstack | `bun`, `github-actions` | Weekly, all actions in one group, 2 open PRs max |
| nyldn/claude-octopus | `npm`, `github-actions`, `gitsubmodule` | Weekly Monday |
| wshobson/agents | `uv` (2) | No `github-actions` entry, though every action is SHA-pinned |
| stripe/ai | `npm` (`/tools`) | Monthly |

trailofbits exempts Dependabot PRs from its version-bump check by PR author,
"not `github.actor`", because a human push to a Dependabot branch would
otherwise re-arm the check. Its `dependabot.yml` notes that "the pinned
Codex CLI in .github/workflows/validate.yml" stays manual, because
Dependabot does not track CLIs installed with `npm install -g` in a run
step.

### Action pinning

Counts of `uses:` lines across each repo's workflows:

| Repo | `uses:` | SHA | Tag | Local action |
| --- | --- | --- | --- | --- |
| affaan-m/everything-claude-code | 62 | 62 | 0 | 0 |
| JuliusBrussee/caveman | 56 | 56 | 0 | 0 |
| sickn33/agentic-awesome-skills | 58 | 58 | 0 | 0 |
| wshobson/agents | 32 | 32 | 0 | 0 |
| stripe/ai | 23 | 23 | 0 | 0 |
| trailofbits/skills | 10 | 10 | 0 | 0 |
| expo/skills | 3 | 3 | 0 | 0 |
| hashicorp/agent-skills | 2 | 2 | 0 | 0 |
| android/skills | 2 | 2 | 0 | 0 |
| garrytan/gstack | 149 | 122 | 17 | 10 |
| nyldn/claude-octopus | 30 | 14 | 16 | 0 |
| OthmanAdi/planning-with-files | 12 | 2 | 10 | 0 |
| EveryInc/compound-engineering-plugin | 16 | 0 | 16 | 0 |
| thedotmack/claude-mem | 36 | 0 | 36 | 0 |
| addyosmani/agent-skills | 9 | 0 | 9 | 0 |
| DietrichGebert/ponytail | 5 | 0 | 5 | 0 |
| cloudflare/skills | 2 | 0 | 2 | 0 |

Nine of 17 repos pin every action by SHA with a `# vX` comment. The
SHA-pinning repos also tend to set `persist-credentials: false` on
checkout (trailofbits 3 of 3 workflows, ecc 11 of 12, wshobson 6 of 6) and a
top-level `permissions:` block.

### CLI version strategy

Three patterns, each deliberate:

1. **Float Claude, pin Codex** (trailofbits `validate.yml`). The check
   should prove the version users run. `claude --version` logs what ran.
2. **Pin and cache Claude** (EveryInc `ci.yml`, octopus 2.1.228, gstack
   image 2.1.251). "Bump the pin intentionally to adopt new `claude plugin
   validate` rules."
3. **Pin in the required check, probe `@latest` nightly** (caveman
   `agent-conformance.yml`). The `latest-drift-probe` job is
   `continue-on-error: true`, uploads a JSON result, and
   `latest-drift-report` opens or updates one issue per agent. A guard step
   fails when a shipped profile lacks a pinned probe.

No repo runs a scheduled plugin-loadability check against the newest CLI.
caveman's nightly drift probe checks version and help output only.
octopus's nightly `vendor-freshness` job exits 2 when a vendored dependency
has a newer upstream tag.

## 4. Release automation

| Repo | Mechanism |
| --- | --- |
| EveryInc/compound-engineering-plugin | `release-please` with `.github/release-please-config.json` and a manifest. Separate components for the plugin (`.`) and `.claude-plugin` marketplace, `include-component-in-tag: true`, and `extra-files` that write the version into `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and five other manifests. PR titles are linted by `amannn/action-semantic-pull-request`. |
| affaan-m/everything-claude-code | Tag `v*` triggers `release.yml`, which checks the tag matches `package.json`, publishes with provenance, and creates a release. `.github/release.yml` groups generated notes by label. |
| JuliusBrussee/caveman | Per-package tag prefixes (`bin-v*`, `sdk-ts-v*`, `agent-v*`); releases verify the tag ref and sign checksums. |
| DietrichGebert/ponytail | Tag `v*` runs `test.yml` and `publish.yml`. `scripts/check-versions.js` requires all seven version files to agree and, on a tag run, to equal the tag. |
| android/skills | Manual `create-release.yml`: takes a tag, bumps `.codex-plugin/plugin.json`, commits to main, zips with `git archive`, runs `gh release create`. |
| sickn33/agentic-awesome-skills, thedotmack/claude-mem | Release or tag triggers npm publish. |
| garrytan/gstack | `VERSION` plus `CHANGELOG.md`; `version-gate.yml` checks the PR version against the queue. |
| obra/superpowers | No CI. `scripts/bump-version.sh` with `.version-bump.json` writes 11 version fields and has `--check` for drift and `--audit` for stale strings. |

Version checks on PRs:

- **trailofbits** `validate_plugin_metadata.py --base-ref`: for each
  plugin with a changed file under `plugins/<name>/`, the version must be
  greater than the version at the merge base. It uses the merge base, not
  the base branch head, so a PR is not failed "for not out-bumping a
  sibling it never saw". A `no-version-bump` label or Dependabot
  authorship skips it. The workflow needs `fetch-depth: 0`.
- **expo** `scripts/check-plugin-version-bump.ts origin/main`: when any
  versioned path changes, all four runtime manifests must be bumped
  together, to the same version, above the base. A test of the script runs
  first.
- **ponytail**, **addyosmani** `scripts/validate-versions.js`, and
  **claude-mem** `tests/infrastructure/version-consistency.test.ts` check
  that manifests agree. ponytail's comment explains why agreement alone
  is not enough: "every manifest stayed stale at 4.7.0 *together* while
  the release moved on, so they 'agreed' and the test passed."

`claude plugin tag [path]` creates a `{name}--v{version}` git tag after
"validating that plugin.json and any enclosing marketplace entry agree". It
has `--dry-run` and `--push`. No studied repo uses it yet.

## 5. Hygiene checks

- **Workflow lint.** actionlint runs in gstack (Docker image pinned by
  digest), agentic-awesome-skills, and trailofbits pre-commit. zizmor runs
  only in trailofbits pre-commit, with inline `# zizmor: ignore[...]`
  comments where a finding is accepted. ecc has its own
  `scripts/ci/validate-workflow-security.js` that rejects checkouts of
  untrusted refs under `workflow_run` and `pull_request_target`.
- **Generated-output freshness.** gstack `skill-docs.yml` runs the
  generator, then `git diff --exit-code`, then fails on untracked files:
  "git diff misses NEW untracked files". wshobson runs
  `make generate-all` and fails on any `git status --porcelain` output.
  caveman and octopus (`--check` scripts) do the same.
- **Markdown lint.** wshobson runs markdownlint-cli2 with MD013 and nine
  other rules off. ecc runs markdownlint in `npm run lint`. trailofbits
  left it out on purpose: markdownlint reported "~12,400 violations ... so
  it would land either permanently red or with so many rules disabled
  that it checks nothing."
- **Link check.** hashicorp `scripts/check-links.py` checks local targets
  and external URLs, treating 401, 403, and 429 as reachable. EveryInc runs
  htmlproofer with `--disable-external`. No repo uses lychee.
- **Frontmatter and size caps.** trailofbits requires `name` and
  `description` and warns above 500 lines. expo fails on descriptions over
  1024 characters or bodies over 500 lines. trailofbits
  `validate_skill_interfaces.py` requires `interface.display_name` and
  `interface.short_description` in each `agents/openai.yaml`.
- **Secrets and personal data.** trailofbits uses pre-commit
  `detect-private-key` and a grep for personal `@trailofbits.com` emails.
  ecc has `validate-no-personal-paths.js` and `check-unicode-safety.js`.
  trailofbits folds a hardcoded-path scan into its metadata validator.
  gstack scans added diff lines with its own redactor. No repo runs
  gitleaks or trufflehog. GitHub secret scanning is a repository setting
  and is not visible in the files.
- **Supply chain.** Dependency review (gstack, agentic-awesome-skills),
  OSV scanner (gstack), CodeQL (agentic-awesome-skills), semgrep
  (cloudflare), and `npm audit signatures` every six hours (ecc).
- **Checker self-tests.** trailofbits runs `--self-test` first because "a
  checker that has stopped detecting its target would otherwise report a
  clean build forever." Its discovery loops fail on zero matches. expo
  tests its version-bump script before running it.
- **Workflow shape.** trailofbits and octopus use `concurrency` with
  `cancel-in-progress` on PRs. gstack limits `push` to main because "the
  unrestricted push trigger double-ran every PR commit."

## 6. Recommended CI set for adhd-unslop

The set stays small, uses Node only, and needs no secrets.

| # | Workflow or file | What it does | Source |
| --- | --- | --- | --- |
| 1 | `verify.yml`, renamed from `daily-build.yml` | Triggers: push to main, `pull_request`, `workflow_dispatch`. Top-level `permissions: contents: read`, `concurrency` cancelling superseded PR runs, `timeout-minutes`, `persist-credentials: false`. Update the `gh workflow run` call in `upstream-bump.yml` and D18. | gstack `skill-docs.yml`, trailofbits `validate.yml` |
| 1a | job `unit` | Current steps, plus a stray-file check and a version-bump check (below). `fetch-depth: 0`. | ours, gstack, trailofbits |
| 1b | job `workflows` | actionlint and zizmor over `.github/workflows/`. | trailofbits `.pre-commit-config.yaml`, gstack `actionlint.yml` |
| 1c | job `load` | Installs pinned `@anthropic-ai/claude-code` and `@openai/codex` into `$RUNNER_TEMP`, then runs a Node port of trailofbits' two scripts (below). | trailofbits `validate.yml`, EveryInc `ci.yml` |
| 2 | `upstream-bump.yml` | Keep D18 as is. The dispatched verify run now includes `load`, so bump PRs are tested against real CLIs. Pin actions by SHA. | agentic-awesome-skills `repo-hygiene.yml` uses the same GITHUB_TOKEN PR plus dispatch pattern |
| 3 | `cli-drift.yml` | Daily or weekly schedule and dispatch. Runs the `load` check with both CLIs at `@latest`. On failure, opens or updates one "CLI drift" issue, reusing the issue step from `upstream-bump.yml`. On success with a newer version, writes it to the step summary so the pin can be raised. | caveman `agent-conformance.yml` |
| 4 | `release.yml` | On push to main when `tools/plugins.json` changes: for each plugin whose version rose, run `claude plugin tag plugins/<name> --push` and `gh release create <name>--v<version>` with the bump report or commit list as notes. Needs `contents: write`. | ecc `release.yml`, android `create-release.yml`, EveryInc per-component tags |
| 5 | `.github/dependabot.yml` | `github-actions` only, weekly, one group for minor and patch, `cooldown: default-days: 7`, labels `dependencies`. We have no npm dependencies. | trailofbits `.github/dependabot.yml` |
| 6 | All workflows | Pin actions by full SHA with a `# vX.Y.Z` comment. Dependabot updates both. | 9 of 17 repos, including trailofbits and caveman |

What `load` should assert, using the local results as the baseline:

- `claude plugin validate --strict` passes on `.claude-plugin/marketplace.json`
  and on each `plugins/<name>/.claude-plugin/plugin.json`. Never validate
  only the root, which checks just the marketplace.
- `claude plugin marketplace add <checkout>` and
  `claude plugin install adhd-unslop@adhd-unslop` succeed, and
  `claude plugin list --json` shows all three plugins with the versions in
  `tools/plugins.json`. Installing only `adhd-unslop` tests D15's
  auto-install.
- `codex app-server` `plugin/list` returns exactly one marketplace named
  `adhd-unslop` with the three plugins and no `marketplaceLoadErrors`.
- `plugin/read` returns skill names of the form `<plugin>:<skill>`, four
  `sessionStart` hooks for `adhd-unslop` with the keys listed above, and a
  non-null `interface.displayName`. The last assertion catches a lost
  `.codex-plugin/plugin.json`, which Codex tolerates silently.
- Use throwaway `HOME`, `CLAUDE_CONFIG_DIR`, and `CODEX_HOME` under
  `$RUNNER_TEMP`, `CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG=1`, and `stdin`
  pipes or `</dev/null` for every CLI call.
- Fail when discovery finds zero plugins or zero skills.

The version-bump check, as `node tools/check-version-bump.mjs --base <ref>`:

- For each plugin with a changed file under `plugins/<name>/`, require the
  version in `tools/plugins.json` to be greater than at the base. Keying on
  generated output catches overlay, hook, and upstream changes alike.
- Compute the base as the merge base of `HEAD` and `origin/main`, not
  `github.event.pull_request.base.sha`. The bump PR's verify run is a
  `workflow_dispatch` on `upstream-bump`, which has no PR base. `sync.mjs`
  already raises the versions there, so the check passes.
- Dependabot PRs touch only `.github/`, so they need no exemption.
- Add a unit test with a fixture repo that must fail, following
  trailofbits' `--self-test` and expo's script test.

The stray-file check: extend `build.mjs --check` to list every file under
`plugins/` and fail on any file that is neither generated nor in the
hand-written allowlist (`hooks/hooks.json` and `hooks/*.mjs`). This enforces
D10. It would pass today: of the 28 files under `plugins/`, `expectedFiles()`
generates 24, and the other four are exactly
`plugins/adhd-unslop/hooks/{always-on.mjs,check-deps.mjs,hooks.json,lib.mjs}`.

Small additions to the unit tests:

- Scan `plugins/` for personal paths such as `/Users/` and `/home/`, after
  ecc `validate-no-personal-paths.js` and trailofbits
  `find_hardcoded_paths()`.
- Require `interface.display_name` and `interface.short_description` in
  each `agents/openai.yaml`, after trailofbits
  `validate_skill_interfaces.py`.

Not recommended:

- Markdown lint. Vendored upstream text must stay verbatim (D2), and
  `tests/overlay.test.mjs` already enforces our own prose rules.
  trailofbits made the same call.
- Model-driven e2e in CI. D21 keeps it local. If it is ever added, use
  trailofbits' key-presence gate on a `workflow_dispatch` job so a missing
  key skips the job.
- Committing directly to main from the bump job, as stripe does. A person
  must review each bump for new conflicts (D18).
- Dropping `.agents/` and `.codex-plugin/` to match trailofbits. Codex
  loads the plugins without them, but it loses the plugin-level
  interface, including `defaultPrompt`.

## Implications for adhd-unslop

- Both runtimes can be tested for loadability in CI with no secrets. The
  commands and assertions above pass today on Claude Code 2.1.283 and
  Codex 0.154.0 and 0.157.1. That narrows D21: only the model-driven part
  needs signed-in CLIs.
- `claude plugin validate --strict` passes on every manifest now, so it
  can gate merges immediately.
- Codex prefers `.agents/plugins/marketplace.json` when both marketplace
  files exist and shows one marketplace, so the two-file layout causes no
  duplicate the way the D20 symlink did.
- Codex falls back to `.claude-plugin/marketplace.json` and plugin
  directories without `.codex-plugin/`. The Codex sidecars only add
  display metadata. That is a structure option for the restructure, with
  the metadata cost recorded above.
- The Claude Code local-path install copied files into the cache on
  2.1.283. If that holds for sessions too, the D21 reason for GitHub mode
  and the "Marketplace copy" row in the platform facts need re-checking.
- D17's hand-bump rule and D10's shipped-files rule are unenforced below
  the top level. Two small checks close both.
- D18 needs no change. agentic-awesome-skills runs the same GITHUB_TOKEN
  PR plus dispatch pattern. stripe's GitHub App token is the alternative
  if the `action_required` state on the PR's own run becomes a problem.
- The CLI pin question is a decision for us. caveman's pinned-plus-drift
  model fits best, because DECISIONS.md already records the versions its
  facts were verified on and says to re-check after upgrades. The drift
  job would do that re-check.

## Claims to test

1. Claude Code 2.1.283 loads a local-directory marketplace plugin from
   `plugins/cache/<mkt>/<plugin>/<version>/`, not in place. Test: install
   from a local path, edit the source `SKILL.md`, start a session, and see
   which text the Skill tool loads.
2. Codex installs and runs a plugin with no `.codex-plugin/plugin.json`
   from a git marketplace that has only `.claude-plugin/marketplace.json`.
   Test with `codex plugin marketplace add <repo> --ref <branch>` and
   `codex plugin add`, then check the TUI `/plugins` display.
3. When both marketplace files exist, no Codex surface shows the
   marketplace twice. Verified only through `app-server` `plugin/list`.
4. `peter-evans/create-pull-request` works after a checkout with
   `persist-credentials: false`. agentic-awesome-skills does this with
   GITHUB_TOKEN. Test on the `upstream-bump` job.
5. A keyless `npm install -g @anthropic-ai/claude-code` followed by
   `claude plugin install` works on `ubuntu-latest`. trailofbits runs this
   in CI. It was verified here only on macOS.
6. The merge-base version check passes on the dispatched bump run and fails
   on a hand overlay edit without a bump.
7. The Codex hook keys (`session_start:<group>:<index>`) match what hook
   trust stores. If so, a `load` assertion on those keys would catch a
   reordering that forces users to re-trust hooks.
8. `claude plugin tag plugins/<name> --push` works from a clean CI
   checkout for a plugin inside a multi-plugin marketplace.
9. Dependabot cannot update a CLI version written in a workflow `run`
   step, as trailofbits states. If it can, the pins could live in the
   workflow without a drift job.
