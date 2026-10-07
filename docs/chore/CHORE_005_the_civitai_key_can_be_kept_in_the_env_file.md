# CHORE_005 — The Civitai key can be kept in the .env file

**Status:** Done (2026-10-07). Approved by the owner the same day

## Summary

`spark/fetch-loras.sh` reads the Civitai key only from `~/.config/civitai/token`. The owner wants to keep it in the repo's `.env` beside `compose.yaml` instead, the place the README already names for the app's settings. Let the fetch read `CIVITAI_TOKEN` from `.env`, with the token file still working.

## Why

One place for the workstation's settings is easier to manage than a dotfile per service. `.env` is already gitignored (`.gitignore`: `.env`, `.env.*`, with only `.env.example` allowed), so the key cannot be committed by accident.

## Changes

- [x] `spark/fetch-loras.sh` mounts `<repo>/.env`, when present, read-only into the container (`ENV_FILE`). The shell never reads or `source`s it, so the value never passes through the shell, the environment or the process list.
- [x] `fetch-loras-cli.ts` reads `CIVITAI_TOKEN` from that file with a tested parser that looks at that one line only. `.env` wins when it has the key; otherwise the token file (`CIVITAI_TOKEN_PATH`) is used.
- [x] `.env.example` is created with `CIVITAI_TOKEN=` (empty) and the app's existing variables, so the file's shape is documented in git without a secret.
- [x] README (the env vars paragraph and the add-on row) and `spark/README.md` (the fetch bullet) name `CIVITAI_TOKEN` in `.env` as the place for the key.
- [x] The value is never printed. The script reports only "Civitai key: found in .env", "found in ~/.config/civitai/token" or "none".

## Testing

- **Unit:** `fetch-loras.test.ts` gains a case for the CLI's token choice: the env value when no path is given, the file when a path is given, none when both are unset. The `.env` line parser is tested: `CIVITAI_TOKEN=abc` gives `abc`; quotes are stripped; a commented-out line, an empty value and a missing key give none; other variables are ignored.
- **Integration:** none new. The existing fake-source tests already prove a token reaches Civitai as a bearer, and that one is never sent to Hugging Face.
- **E2E:** none. The app does not change.
- **Manual, on the Spark:** with the key in `.env`, `spark/fetch-loras.sh` fetches `erect-friendofmale` and `flaccid-lonelycoyote` with matching sha256, and the run's output and `ps` during it never show the value.

## Done (2026-10-07)

- The gate ran by hand, all six steps green; the model server's tests went from 90 to 93 (the `.env` parser and file reader).
- On the Spark, with the key copied by the owner into `.env` (mode 600, gitignored): the fetch reported "Civitai key: found in .env" and fetched `erect-friendofmale` (318.8 MB) and `flaccid-lonelycoyote` (159.4 MB), both sha256 ok; `verify` reports all seven ok. The key never appeared in the output.
