# Atlas: Claude plan → Codex code → Claude review

This is a local, on-demand pipeline, ported from CourtVision. Give it one task. It creates a separate Git worktree, installs dependencies, and records baseline checks. Claude plans the work, Codex implements it, the runner runs checks, and a fresh Claude session reviews the actual changes. Codex can address findings up to twice. The runner leaves the branch and evidence for you to inspect and merge.

There are two workflows:

- **Feature workflow** (default): setup → baseline → Claude plan → Codex code → checks → Claude review → fixes.
- **Bug workflow** (`--bug`): setup → baseline → **Codex diagnosis** → **reproduction checks** → Claude plan → Codex code → checks → Claude review → fixes. Codex tests and reviews the code to find what causes the error before anyone plans a fix.

## Start

1. Open Terminal. Run `claude` and sign in with your Claude subscription. Run `codex login` and choose ChatGPT sign-in if Codex is not signed in.
2. Check both accounts' usage and billing settings. Turn off optional paid extra usage or automatic credit purchases if you want subscription-only spending. The runner removes standard API-key environment variables and has no API fallback, but it cannot change your account billing settings.
3. Check readiness:

```bash
cd /Users/mohandixit/Documents/GitHub/Atlas
python3 .ai-workflow/pipeline.py --doctor
```

4. Commit the changes you want the pipeline to see, including the workflow files. Then run a concrete, bounded task.

Feature:

```bash
python3 .ai-workflow/pipeline.py "Add a sort-by-value toggle to the Portfolio holdings table; add regression coverage."
```

Bug:

```bash
python3 .ai-workflow/pipeline.py --bug "Market News page shows 'Invalid Date' for articles from NewsData. Expected: the publish date in local time."
```

Describe the bug as well as you can: what you did, what happened, what you expected, and any error text or stack trace.

To name the branch instead of using `ai/<timestamp>`, add `--branch`, for example `--branch feat/portfolio-sort`. The runner refuses an invalid name or one that already exists.

The runner refuses a checkout with uncommitted changes. To start at the latest commit and exclude all uncommitted changes, add `--from-head`. This flag does not stash, commit, or copy your work.

## The bug workflow in detail

After the baseline checks, Codex runs a diagnosis stage before Claude plans anything:

1. **Testing.** Codex runs the relevant tests and commands to reproduce the failure. It then adds a minimal regression test that fails now and will pass once the bug is fixed.
2. **Code review.** Codex traces the code path to find the root cause, and checks callers and similar code that may share the defect.
3. **Report.** Codex writes `diagnosis.md`: symptom and reproduction, root cause with file and line references, evidence, regression tests added, other affected places, fix options, and confidence.

Codex must not fix the bug during diagnosis. The runner enforces this: if Codex changes any file outside `test_paths` in `config.json` (`backend/tests/*`, `frontend/tests/*`), the run stops.

The runner then runs all checks again as `repro.json`. A new regression test is expected to fail here. That failure is the evidence that the test reproduces the bug.

Claude then plans from the diagnosis and checks it against the source first. If the diagnosis is wrong, the plan says so and works from the real cause. Codex implements the fix and keeps the regression tests. The reviewer treats these as findings:

- a fix that does not address the diagnosed root cause
- regression tests that did not fail in `repro.json` and do not pass now, without a stated reason

If Codex cannot reproduce the bug, it says so in the report, and the planner sees that.

## What every run does

1. Creates `Atlas-ai-runs/<timestamp>/checkout` next to the Atlas folder, on a new `ai/<timestamp>` branch from the current HEAD.
2. Runs the `setup` commands in that checkout: `npm ci --legacy-peer-deps` in `frontend/` and a fresh `backend/.venv`. Dependencies are isolated, and this needs network access. No virtual environments, ignored files, or `.env` secrets are copied from your main checkout.
3. Records baseline results for every check.
4. In bug mode, runs the diagnosis and reproduction stages above.
5. Claude reads the code and writes `plan.md` with acceptance criteria and the tests to add.
6. Codex edits the isolated checkout with the workspace-write sandbox and no approval prompts. It must add or update tests for everything it builds or changes.
7. The runner runs the checks and saves logs. Claude independently reads the diff, new files, source, plan, and check results, and returns structured findings.
8. Up to two fix and review rounds run. Success needs zero unresolved findings and every required check passing. Otherwise the run ends as `needs-attention` with exit code 2.

**Strict scope.** Every agent prompt tells the agent to change only what the task asks for: no refactors, cleanups, config changes, or fixes to related code the task did not mention. The planner lists related issues under "Out of scope (not planned)". The reviewer flags unrequested changes as findings to revert and never asks for out-of-scope work, and Codex skips any review finding that would go beyond the task. Name everything you want changed in the task itself.

Claude gets only the Read, Glob and Grep tools in safe mode, which disables its hooks, plugins and custom instructions. Codex is told not to commit, push, merge or deploy, and no runner step does these things. This is a personal local workflow, not a sandbox for untrusted code.

## Design specs and starting branches

Two options help with bigger UI work:

- `--spec path/to/spec.md` copies a design spec into the run folder as `spec.md`. The planner, Codex and the reviewer are all told to read it in full and treat it as authoritative. Atlas keeps its specs in `docs/superpowers/specs/`.
- `--base <branch>` starts the run from that branch or commit instead of the current `HEAD`, for example to rework an earlier run's branch. Uncommitted changes in your checkout don't matter with `--base`.

```bash
python3 .ai-workflow/pipeline.py --base feat/home-scroll-intro --branch feat/home-scroll-scenes \
  --spec docs/superpowers/specs/2026-10-10-home-scroll-scenes-design.md "Implement the design spec"
```

Codex's prompt also includes two working rules adapted from the Superpowers skills: work test-first, and never report something as done without running the command that proves it and quoting the output.

## Skills per stage

Codex can't usefully load skills on its own: it has about 1,700 skill descriptions available, overflows its skills budget and drops them all. The runner names exact skills per stage instead. In the config:

- `codex_skills` maps a stage (`diagnose`, `code`, `fix`) to a list of skill folders.
- `review_skills` lists skill folders for Claude's review.

Each folder must contain a `SKILL.md`. Before creating a run, the runner checks that every listed folder exists, and stops with the missing path if one doesn't. (Plugin version folders such as Superpowers' `6.4.2` change when the plugin updates.) It then copies each folder into `skills/` in the run folder. Every agent reads the skills from there, and the run keeps a record of exactly what it used. Prompts tell the agents that nobody is available to answer a skill's questions, and that the workflow's own rules (strict scope, no commits, no new dependencies, output format) override any skill.

`emil-design-eng` was dropped from coding to save allowance (about 700 lines in every coding prompt); put design direction in the run's spec instead.

Left out on purpose:

- `using-superpowers`, which would make Codex search every skill.
- `brainstorming`, `writing-plans` and `requesting-code-review`, because Claude plans and reviews.
- `using-git-worktrees`, `finishing-a-development-branch`, `subagent-driven-development` and `dispatching-parallel-agents`, which conflict with the runner.
- `scroll-experience`, which is built around GSAP, a library these projects don't use.

The `~/.agents/skills` folders are community-written; read a skill before adding it.

| Stage | Skills |
| --- | --- |
| Bug diagnosis | Superpowers `systematic-debugging`, `test-driven-development` |
| Coding | Superpowers `test-driven-development`, `verification-before-completion`; `fixing-motion-performance` |
| Fix rounds | Superpowers `receiving-code-review`, `verification-before-completion`; `fixing-motion-performance` |
| Claude review | `review-animations` (with its `STANDARDS.md`) |

## Browser checks

`checks/home_scroll_intro.mjs` loads the home page in headless Chromium, scrolls through the intro in 120 steps, and fails if a feature scene never appears, appears out of order, hides its button, or if a button doesn't navigate. Since version 2 of the design it also fails if transitions are too short, if two headlines overlap, if the scenes don't rotate through at least three layouts, or if a scene's interactive elements are missing, do nothing, or navigate away. It also checks the reduced-motion version and 390px phone width, and saves screenshots to `screenshots/checks-N/` in the run folder. The reviewer is given those screenshots and told to judge them.

Check scripts in `.ai-workflow/checks/` run from your main checkout (`{workflow_dir}`), not from the run's worktree, so the agents can't edit them. Check commands can use `{workflow_dir}`, `{run_dir}` and `{checkout}`, and get `AI_RUN_DIR` and `AI_CHECK_LABEL` in their environment.

Playwright lives outside the repo, so `package.json` is unchanged. Install it once:

```bash
mkdir -p ~/.cache/ai-workflow/playwright && cd ~/.cache/ai-workflow/playwright && npm init -y && npm install playwright@1.60.0 && npx playwright install chromium
```

Run the check by hand against any checkout:

```bash
node .ai-workflow/checks/home_scroll_intro.mjs /path/to/checkout
```

## Atlas checks

`config.json` runs these checks:

| Check | Command | Required |
| --- | --- | --- |
| Frontend regression tests | `node --test frontend/tests/*.test.mjs` | Yes |
| Production build | `npm --prefix frontend run build` | Yes |
| Backend tests | `.venv/bin/python -m unittest discover -s tests`, run in `backend/` | Yes |
| Home scroll intro (browser) | `node {workflow_dir}/checks/home_scroll_intro.mjs {checkout}` | Yes |
| Frontend lint | `npm --prefix frontend run lint` | No |

The required checks pass on the current code, so a failing required check after a run means the run broke something. Lint already has 18 errors, so it is informational. Agents are told not to add lint errors in files they touch. Once lint is clean, set `"required": true` on it.

Backend tests are offline. They do not cover NewsData, NVIDIA, Alpha Vantage, Redpanda or MongoDB, and the agents are told not to call or start them. An AI review is useful evidence, not a guarantee.

Each check can set `cwd`, a folder relative to the checkout root. Commands are argument arrays, not shell strings, and the runner expands wildcards relative to `cwd`.

## Run folder

The terminal prints the run folder. It contains:

- `state.json`: task, mode (`feature` or `bug`), config snapshot, base commit, branch and stage.
- `diagnosis.md`, `diagnosis.log`, `diff-diagnosis.patch`, `diff-diagnosis-new-files.txt`: bug mode only.
- `repro.json`, `repro-*.log`: bug mode only. Checks after the regression tests were added.
- `plan.md`: Claude's plan.
- `baseline*.log` and `checks-*.log`: check evidence.
- `code.log`, `code.md`, `fix-*.log`: implementation output.
- `diff-*.patch` and `diff-*-new-files.txt`: changes and new files.
- `review-*.result.json`: review verdict and findings.

A timeout, CLI error, malformed review, empty diagnosis, out-of-scope diagnosis edit, or usage-limit error stops the run. There is no retry, account switching or API fallback. Fix the problem, then resume:

```bash
python3 .ai-workflow/pipeline.py --resume /absolute/path/to/Atlas-ai-runs/RUN_FOLDER
```

Check partial edits before resuming. Resuming repeats the interrupted stage. If the diagnosis stage stopped because Codex edited application code, revert that edit in the checkout before you resume, or start a new run. After the two fix rounds, `needs-attention` is final: fix it yourself or start a new, narrower task.

Review the checkout before committing or merging. To remove a finished checkout, save any work you need, then run `git worktree remove /absolute/path/to/checkout`. Logs are kept separately. Nothing is cleaned up automatically.

## Maintenance

Run the offline controller tests after changing `pipeline.py` or upgrading either CLI:

```bash
python3 .ai-workflow/test_pipeline.py
python3 .ai-workflow/pipeline.py --doctor
```

The tests use fake AI CLIs and real temporary Git worktrees. They cover isolation, the fix-loop limit, failing-check gating, invalid reviews, dirty checkouts, resuming, per-check `cwd`, and the bug workflow: diagnosis before planning, the diagnosis report reaching the planner, the test-paths guard, and empty reports. They test the runner, not model quality.

`claude_model` is `opus`. Codex uses `codex_model` `gpt-6-astra`, with high reasoning effort for diagnosis and coding and medium for fix rounds. `codex_reasoning_effort` can be one value for every stage or a map per stage; both repos use `{"diagnose": "high", "code": "high", "fix": "medium"}`, because fix rounds address specific review findings and medium effort saves plan allowance. The runner starts Codex with `--ignore-user-config`, so `~/.codex/config.toml` is not read; set the model and effort here. Leaving either `null` falls back to the Codex CLI default, which is a different model with no reasoning. Larger models and higher effort use more of your plan allowance.

This setup uses `claude -p` without `--bare`, because bare mode does not read subscription login. CLI flags can change; re-run the doctor and tests after upgrades.

## References

- [Codex with ChatGPT plans](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [Claude Code with Pro or Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Claude scripted runs](https://code.claude.com/docs/en/headless)
- [Codex CLI](https://developers.openai.com/codex/cli/)
