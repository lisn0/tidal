# Shared compute guidance

This contract applies equally to Codex, Claude Code, Antigravity, Gemini, MiMo,
other agent clients, and humans. Agent brand does not grant permissions or select
a queue. Read this project's owning guides and use an enrolled device with its
authorized credentials.

A cloud agent needs service network access, Python/OpenSSH, and an enrolled device profile. Clients on one device share its profile; enroll each distinct device once.
Without access, prepare source for an authorized executor. Never borrow private keys; cloud GPU services are separate.

`git_submit` is the only way to run this repo's code on 191. Commit, then from
inside the repo:
`python3 -B "$COMPUTE_REPO/client/git_submit.py" --config ~/.config/production-compute/client.json --label NAME [--cpu N] [--ram XG] [--priority P] [--wait] -- COMMAND ARGS`.
It refuses uncommitted repo paths named in COMMAND, pushes the branch, checks out
that exact commit on 191 at `~/src/<repo>-runs/<sha>`, and submits with it as
`--cwd` and the short SHA in the label. Relative paths in COMMAND are relative to
the repo root. Never `scp`/`rsync`/hand-stage scripts, `git pull` in 191 trees, or
edit files on 191. Data stays on 191; only code moves through git. Plain
`submit --cwd` is only for commands that run no repo code. Canonical text:
`production-compute/COMPUTE.md`, "Running code from a repo".

For ordinary commands, tests, builds, and renders on 191, use the general Pueue client. Future ordinary projects need no adapter.
General jobs use shared workspace access and do not create immutable project
receipts. Use a deployed pinned query only when its project capability is
reported by `pc capabilities PROJECT`; a local profile or adapter source does
not establish deployment. Product acceptance remains a separate check.

Set `COMPUTE_REPO` to the actual local production-compute checkout and
`COMPUTE_CONFIG` to this device's enrolled profile. Do not assume a personal
checkout path or guess a 191 path; obtain the actual authorized worktree path.

```sh
COMPUTE_REPO=/actual/checkout/production-compute
COMPUTE_CONFIG="$HOME/.config/production-compute/client.json"
python3 -B "$COMPUTE_REPO/client/agent_compute.py" --config "$COMPUTE_CONFIG" submit --cwd ACTUAL_191_WORKDIR --cpu 2 --ram 4G -- COMMAND ARGUMENTS
python3 -B "$COMPUTE_REPO/client/agent_compute.py" --config "$COMPUTE_CONFIG" status JOB_ID
python3 -B "$COMPUTE_REPO/client/agent_compute.py" --config "$COMPUTE_CONFIG" logs JOB_ID
python3 -B "$COMPUTE_REPO/client/agent_compute.py" --config "$COMPUTE_CONFIG" watch JOB_ID
python3 -B "$COMPUTE_REPO/client/agent_compute.py" --config "$COMPUTE_CONFIG" download JOB_ID relative/output.json --destination LOCAL_OUTPUT
python3 -B "$COMPUTE_REPO/client/pc.py" --config "$COMPUTE_CONFIG" capabilities PROJECT
```

Do not grant agent root. Agents may submit, monitor, cancel, inspect logs, and
retrieve results through the authorized client. Installation, account and grant
changes, resource policy, supervisor recovery, and protected database work remain
administrator responsibilities. On interruption, inspect service status and logs;
recovery does not replay commands automatically. Logs may be provisional while a
job runs. Inspect metadata pages needed to find required artifacts; the download
client follows output pages automatically and verifies complete pinned files by
size/SHA-256; general transfers check consistency.

Keep source transfer, job execution, result verification, and product release as
separate steps. Submission neither synchronizes source nor publishes a product.
Follow the project's own checks and verify returned artifacts before acceptance.
A plain exact-job watch is the portable completion path. A timeout is not failure;
read the terminal status and retained results before reporting completion. Avoid
active polling, duplicate watches, or resubmission just because notification lags.

`--notify-thread` is a macOS Codex-only integration requiring launchd, installed
Codex CLI, and the current thread UUID. It is not a universal callback. Other
clients use plain watch and only their own verified handoff mechanisms.

See the [central compute contract](../../../../production-compute/docs/agent-client-contract.md) for full setup, limitations,
and verification evidence. This guidance grants no deployment, publication,
credential sharing, source push, or deletion authority.

## Frontier tickets and current handoff

Use the shared [Frontier skill](../../../../youtube/.agents/skills/frontier/SKILL.md) for ticketed work. From the workspace root, use `./tools/frontier` to search the live tracker before opening a ticket; update a matching ticket or create a specific one with evidence, acceptance criteria, source owner, and next action when an issue is found. Read this project's `AGENTS.md` and, when present, `docs/CURRENT-HANDOFF.md`; verify status and acceptance against the live ticket. Fix routine authorized issues directly, keep blockers tracked with a next action, and close only with verified acceptance evidence. Do not create duplicates, restore a separate tracker in standalone/cloud clones, or automatically close a project. If the shared skill or canonical tracker is unavailable, report the access blocker rather than acting on stale local state.
