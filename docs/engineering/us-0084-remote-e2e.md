# US-0084 — Minimal remote sanity path (Windows → WSL or SSH Linux)

Sprint **S0069** / story **US-0084**. This is a short operator walkthrough; normative
contracts live in **`docs/engineering/architecture.md`** **`# US-0084`**,
**`docs/engineering/release-targets.json`**, and **`docs/engineering/runtime-connectivity.md`**
(**US-0064**).

## Path A — WSL (local Linux on the Windows machine)

1. Install/launch **WSL** and open a Linux shell in the repo (or clone the repo inside WSL).
2. Ensure **Node.js** and **Python 3** are available on **PATH** (same as host runbook).
3. Run **`npm pack`** / local **`its-magic`** or **`sh installer.sh --target <repo> --mode missing --create`** from the package root.
4. Run **`python tests/installer_shell_bug0004_test.py`** and your stack’s **`TEST_COMMAND`** (from merged runbook / scratchpad).
5. Evidence: set **environment label** **`WSL`** in QA handoffs; **`REMOTE_EXECUTION=0`** is typical (no **`.cursor/remote.json`** validation required).

## Path B — SSH to a Linux host

1. SSH into the Linux machine; clone or sync the repo there.
2. Copy **`.env.example`** to **`.env`** and fill in values for `SSH_HOST`,
   `SSH_USER`, `SSH_PRIVATE_KEY`, and any other relevant `REMOTE_*` vars.
   Source the file (`source .env` or equivalent) before running remote ops.
   See **`docs/engineering/runbook.md`** § Operator `.env` setup.
3. Run the same **`sh`/`dash`** installer and **`python`** tests as on native Linux.
4. For **release/QA connectivity** semantics, align with **`ssh-server`** in
   **`docs/engineering/release-targets.json`** (`hostEnv`, `userEnv`, `authEnv`, …).
5. For **Cursor/dev remote** validation, set **`REMOTE_EXECUTION=1`** and
   **`REMOTE_CONFIG=.cursor/remote.json`** on the merged scratchpad; run
   **`python scripts/remote_config_summary.py`** — stdout must list **names only**
   (no keys/passwords).
6. Evidence: cite **`ssh:<hostEnv>`** (the **env var name**, not the host value) plus
   **environment label**; never paste private key material.

## Path C — Docker-over-SSH

1. Follow **Path B** on the SSH host (including **`.env`** setup from
   **`.env.example`**); enable **`dockerOverSsh`** patterns per
   **`runtime-connectivity.md`** (**`dockerHostEnv`**, **`dockerContextEnv`**, **`composeFile`**, **`service`**).
2. Ensure **`DOCKER_HOST`** and **`DOCKER_CONTEXT`** are set in your **`.env`**;
   source before running Docker commands. Document **env names** only in handoffs.

## Related

- **`tests/run-tests.sh`** / **`tests/run-tests.ps1`** — **H1–H5** (**US-0084** / AC-10).
- **`python scripts/guard_installer_publish.py`** — publish-time LF + POSIX guard.
