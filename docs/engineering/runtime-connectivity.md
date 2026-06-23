# Runtime Connectivity

Canonical operator-facing connectivity summary for release and QA/runtime debug
contexts.

## Purpose

- Show where current targets are hosted (local vs remote).
- Provide connection instructions (domain/ip/port/protocol).
- Provide ingress/proxy metadata (for example Traefik) when configured.
- Preserve secret safety: never store secret values, only env-reference names.

## Source of truth

- `docs/engineering/release-targets.json`

## Operator summary template

For each enabled target include:

- `target_id`
- `target_type`
- `execution_mode` (`local|remote`)
- `connect_endpoint` (`protocol://domain:port` or `ip:port`)
- `ingress` (`traefik enabled/disabled`, router, entrypoint, tls)
- `docker_over_ssh` (enabled + context hints when configured)
- `release_context` (latest sprint/release note ref)
- `qa_context` (latest remote/local verification path)

## Security rules

- Do not write inline credentials/tokens/private keys.
- Only env reference names are permitted in connectivity artifacts.
- Redact auth details in handoffs and release outputs.

## `*Env` variable sourcing (US-0085 / DEC-0071)

Operators may populate `release-targets.json`-referenced `*Env` variables
(such as `SSH_HOST`, `DOCKER_TOKEN`, `AWS_PROFILE`, etc.) from a sourced
`.env` file at repository root. Values are never stored in JSON configs —
only env-reference **names** appear in committed artifacts. See
`docs/engineering/runbook.md` for the copy/source recipe and
`.env.example` for the full 20-name inventory.

## Dev/QA remote profiles vs `release-targets.json` (US-0084)

Use this table to map **where you run tests** to the **US-0064** release/QA
connectivity model (**no parallel schema**). Cursor/dev **`REMOTE_CONFIG`** is
documented in the runbook; it complements, not replaces, **`release-targets.json`**.

| Operator path | Maps in `release-targets.json` | Scratchpad / dev config |
|---------------|----------------------------------|-------------------------|
| **WSL** | Local Linux on the same machine — not a separate target row by default. | Usually **`REMOTE_EXECUTION=0`**. Cite **environment label** **`WSL`** in QA evidence. |
| **Bare SSH Linux** | **`ssh-server`**: `hostEnv`, `userEnv`, `authEnv`, `remoteCommand`, `runtime`, ingress. | **`REMOTE_EXECUTION=1`**, **`REMOTE_CONFIG=.cursor/remote.json`** (see **`.cursor/scratchpad.md`**). |
| **Docker-over-SSH** | **`ssh-server.dockerOverSsh`**: `dockerHostEnv`, `dockerContextEnv`, `composeFile`, `service`. | Same scratchpad keys; operator sets **`DOCKER_HOST`** / context using **env names** only in docs. |

### `docker_over_ssh` (operator summary)

When **`dockerOverSsh.enabled`** is true on **`ssh-server`**, connectivity flows
through SSH to a host where Docker commands run; **`dockerHostEnv`** and
**`dockerContextEnv`** name the operator env vars (values never pasted into
artifacts). **`composeFile`** and **`service`** identify the stack slice. Full
fields remain in **`docs/engineering/release-targets.json`** and **DEC-0044**.

## Optional deterministic CI routing recipe (US-0086)

This recipe is optional and applies only when automation routing is explicitly
enabled.

- Keep `AUTO_REMOTE_AUTOMATION_PROFILE=off` as the default in CI unless the
  workflow intentionally opts into automation routing.
- Use deterministic path filters to set an execution label:
  - `docker` label for container surfaces (`Dockerfile*`, `docker-compose*.yml`,
    container runtime scripts)
  - `ssh` label for ssh/deploy/runtime host scripts
  - `local` label for all other changes
- If explicit NL intent `start container <target_id>` is provided by automation,
  target-id resolution takes precedence over path filters.
- Emit names-only routing evidence:
  `target_id`, `environment_label`, `automation_profile`, `routing_source`,
  `secret_surface=names_only`.
