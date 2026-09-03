# ADR-012 Secret-blind orchestration

## Context

Ghaisan asked on 3 September 2026 that the Orchestrator provision the database itself and that no model thread ever see the connection string or any other secret.

## Decision

Secrets are handled by the shell and by CLIs, never by the model.

- The database is provisioned by `vercel install neon` as a Vercel-managed Neon resource connected to the application's Vercel project for Production, Preview and Development; the CLI writes its credentials into the gitignored root env file. Ghaisan supplies only `ZAI_API_KEY` through env-prep. The Orchestrator's own generated secrets (`AUTH_SECRET`, `REVIEWER_LINK_SECRET`, `CI_INGEST_TOKEN`, `ADMIN_JOB_TOKEN`, `CORPUS_DEPLOY_KEY`, the demo and Admin passwords) are written by the generator straight into that file.
- A PreToolUse hook in the root control plane denies, for every thread including the main one, any command or tool call that would print an env file or a secret variable: `cat`, `head`, `tail`, `less`, `more`, `grep`, `sed`, `awk`, `printenv`, `env`, `set`, `export -p`, `echo` of a secret name, and the Read and Grep tools on env files.
- Propagation happens only through one foundation helper script that redirects a named key from the env file into a CLI's stdin (`vercel env add`, `gh secret set`) with stdout and stderr sent to a file the model does not read, and through dotenv loading inside scripts, tests and the harness.
- The Admin password reaches Ghaisan through a root-level gitignored file whose path the Report names.

## Alternatives

- Ghaisan pastes the connection string himself: rejected, an extra click-through and a value in his clipboard for nothing.
- The model reads the env file and sets platform variables by hand: rejected, the value would sit in the model's context.

## Consequences

- The model sees exit codes and non-secret output only.
- The deny set is probed in the foundation gate (AC-FND-01), and the hook also rejects a shell command whose text merely contains one of the patterns; prose that mentions them is written through the Write tool.
- The residual exposure is a CLI that echoes a value in an error, which the helper script's redirection closes.
- The secret-value grep over `.crown/`, the Report, every evidence file and every tracked file is part of AC-NFR-20.

## Status

Accepted 2026-09-03
