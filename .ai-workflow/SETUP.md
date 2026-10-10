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

## Atlas checks

`config.json` runs these checks:

| Check | Command | Required |
| --- | --- | --- |
| Frontend regression tests | `node --test frontend/tests/*.test.mjs` | Yes |
| Production build | `npm --prefix frontend run build` | Yes |
| Backend tests | `.venv/bin/python -m unittest discover -s tests`, run in `backend/` | Yes |
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

`claude_model` is `opus`; `codex_model` is `null`, which uses the Codex CLI default. Larger models use more of your plan allowance.

This setup uses `claude -p` without `--bare`, because bare mode does not read subscription login. CLI flags can change; re-run the doctor and tests after upgrades.

## References

- [Codex with ChatGPT plans](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [Claude Code with Pro or Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Claude scripted runs](https://code.claude.com/docs/en/headless)
- [Codex CLI](https://developers.openai.com/codex/cli/)
