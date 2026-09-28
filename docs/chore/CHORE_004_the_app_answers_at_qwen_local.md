# CHORE_004 — The app answers at qwen.local

**Status:** Done (2026-09-28)
**Relates to:** STORY_016 (the app container on port 3100)

## Summary

The owner opens the app at `http://qwen.local` instead of `http://192.168.1.28:3100`, the way their other machines are reached (`machines.local`).

What is on the network today (read on 2026-09-28):

- **`machines.local` is its own machine,** at 192.168.1.30. Its name is the hostname that machine announces over mDNS (Bonjour). The Spark announces itself as `spark-1.local`, which resolves to 192.168.1.28.
- **So a second name for the Spark needs an mDNS alias.** The host's `avahi-daemon` is running and can publish an extra address record for `qwen.local`, pointing at 192.168.1.28, for as long as the process that asked for it stays up.
- **Dropping `:3100` from the URL needs something on port 80.** Nothing on the Spark listens on 80 or 443 today. `spike001-review` binds 80 inside its container, but it is published only on 192.168.1.33:8790.

## Why

A name is easier than an IP address and a port, and it survives the Spark's IP changing if the alias is published from the Spark's current address.

## Changes

- [x] ~~**The `qwen-mdns` service** (in `spark/compose.yaml`) publishes the alias. It is a tiny Alpine image with `avahi-tools` and host networking. It mounts the host's D-Bus socket read-only and runs `avahi-publish -a -R qwen.local <the Spark's current LAN address>`. The address is read at start from `ip route get 1.1.1.1`, never written as a literal. It has `restart: unless-stopped`. Nothing is installed on the host.~~ **Corrected while implementing, 2026-09-28:** this could not work. The kernel log showed AppArmor refusing D-Bus to the `docker-default` profile (`apparmor="DENIED" operation="dbus_method_call" ... label="docker-default"`). Loosening the container's confinement, or adding the name in the host's avahi config, would both change the host. What shipped instead is the **`lan-name` service** (`qwen-lan-name`, in the root `compose.yaml`, beside the app):
  - It is a small mDNS responder (`tools/lan-name/src/`) that answers only for `qwen.local`. It uses host networking and shares port 5353 with avahi.
  - The address is the host's routed source address, read with no literal. If it changes, the service restarts.
  - Nothing is installed on the host, and no confinement is loosened.
- [x] **The `qwen-proxy` service** (in the root `compose.yaml`) is a Caddy container on host port 80. For `Host: qwen.local`, it proxies to `qwen-app:3100` on the project's default network. Any other host answers 404, so it claims only our own name. The Caddyfile is committed. Port 3100 stays as it is, so `192.168.1.28:3100` keeps working.
- [x] ~~**`spark/up.sh`** starts both services and prints `http://qwen.local`.~~ **Corrected:** `spark/up.sh` starts only the model, and these two services front the app. So they live in the root `compose.yaml`, and the README's Deployment gains step 3: `docker compose up -d --build proxy lan-name`.
- [x] **The README** (Running the app) documents the URL and the fallback `http://spark-1.local:3100`.

## Testing

- **Unit:**
  - A test over the committed Caddyfile checks that it routes only `qwen.local` to `qwen-app:3100` and that its fallback answers 404.
  - ~~The alias script's address pick (parsing `ip route get` output) is a pure function with its own test.~~ **Corrected:** the responder is tested instead. `tools/lan-name/src/mdns.test.ts` covers:
    - A queries (answered by multicast, with cache-flush) and case-insensitive names;
    - no reply for other names;
    - AAAA answered with an NSEC;
    - the unicast bit, and legacy resolvers (id echoed, 10 s TTL);
    - compressed names, and malformed or looping input;
    - the announcement and the goodbye.
- **Integration:** N/A. There is no app route or handler change, and the app's own tests don't see the proxy.
- **E2E:** N/A for the gate. The name only exists on the LAN, and the gate must not depend on the Spark ([CLAUDE.md §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)).
- **Manual verification:** check each of these from the Spark and from the Mac:
  - `avahi-resolve -n qwen.local` gives 192.168.1.28;
  - `curl -sI http://qwen.local` gives 200 from the app;
  - Safari on the Mac loads `http://qwen.local`.

## Notes for the owner

- **Port 80 on the Spark becomes this proxy's.** It routes by name, so a future `minimax.local` could be added to the same Caddyfile rather than fighting over the port.
- **The Dock app is tied to its address.** One saved from `192.168.1.28:3100` stays pointed there. To use the new name, remove it and add it again from `http://qwen.local`. History lives on the server, so nothing is lost.
- **A name without port 80:** `http://qwen.local:3100` would need only the alias service, with no proxy.

## Done (2026-09-28)

- **Tests:** `lan-name` has 12 cases (9 mDNS, 3 Caddyfile). Typecheck and lint are clean. The gate is green (see the commit).
- **Manual verification, on the Spark:**
  - `avahi-resolve -n qwen.local` and `getent hosts qwen.local` both give 192.168.1.28, and `spark-1.local` still resolves beside it;
  - through the proxy, `http://qwen.local` gives 200, and so do `/api/history`, the logo, `apple-icon.png` and the manifest;
  - any other `Host` gets a 404, and `:3100` still answers 200.
- **Not checked by the assistant:** resolving from the Mac. The owner does that step in Safari.
