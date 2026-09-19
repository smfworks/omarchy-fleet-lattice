# Fleet Lattice

Fullscreen sci-fi **multi-machine node graph** for [Omarchy](https://omarchy.org)
Quattro. Glowing nodes for the local host plus peer boxes (mikesai1, mikesai6,
other Omarchy machines), neon edges for reachability / last-seen, click a node
for detail. A fleet command hologram.

Plugin id: `smf.fleet-lattice`. Overlay plus a tiny bar-widget summoner /
fleet-count chip. From [SMF Works](https://github.com/smfworks); destined for
mikesai6 Omarchy installs, and useful on any Omarchy host.

There is **no magic fleet API**. The HUD is honest about what it actually read.

Sibling plugins from the main shortlist:
[Orbit Dock](https://github.com/smfworks/omarchy-orbit-dock),
[Aegis Gate](https://github.com/smfworks/omarchy-aegis-gate),
[Ghost Trace](https://github.com/smfworks/omarchy-ghost-trace)
(plus [Neural Pulse](https://github.com/smfworks/omarchy-neural-pulse) and
[Cron Constellation](https://github.com/smfworks/omarchy-cron-constellation)).
Fleet Lattice is a runner-up after that shortlist.

## Install

```sh
omarchy plugin add https://github.com/smfworks/omarchy-fleet-lattice.git --enable
```

Plugins run **unsandboxed** inside the long-lived `omarchy-shell` process, with
your user permissions. Review this repo before enabling. Opt-in probes can
`ping` or `ssh` hosts you list — leave `probe` off unless you want that.

Optional bar chip (right section by default):

```sh
omarchy bar move smf.fleet-lattice --section right
```

## Summon

Fullscreen `overlay`, same contract as first-party pickers and
`smf.orbit-dock` / `smf.aegis-gate`:

```sh
omarchy-shell shell summon smf.fleet-lattice '{}'
omarchy-shell shell hide smf.fleet-lattice
omarchy-shell shell toggle smf.fleet-lattice '{}'
```

```
bind = SUPER, F, exec, omarchy-shell shell toggle smf.fleet-lattice '{}'
```

Force the DEMO lattice even when `fleet.json` exists:

```sh
omarchy-shell shell summon smf.fleet-lattice '{"demo":true}'
```

Click the bar chip to toggle the same overlay. Escape dismisses it. Click the
dimmed backdrop to dismiss.

## fleet.json

Copy the sample and edit hosts you actually have:

```sh
mkdir -p ~/.config/smf-fleet-lattice
cp fleet.example.json ~/.config/smf-fleet-lattice/fleet.json
```

```json
{
  "probe": false,
  "probeMethod": "ping",
  "nodes": [
    { "id": "mikesai1", "label": "mikesai1", "host": "mikesai1.local" },
    { "id": "mikesai6", "label": "mikesai6", "host": "mikesai6.local" }
  ]
}
```

A bare array of `{id,label,host}` is also valid. Or set env
`SMF_FLEET_LATTICE` / `SMF_FLEET` to the same JSON (or a comma-separated host
list). Config file wins over env when it lists nodes.

**Probes are opt-in.** Default `probe: false` does **not** ping or SSH anyone.
When you set `"probe": true`, Fleet Lattice may run `ping -c1 -W1` or
`ssh -oBatchMode=yes -oConnectTimeout=1` against configured hosts only.
DEMO sample nodes are never probed.

## DEMO vs LIVE

The honesty chip is labeled so a screenshot is self-describing:

- **DEMO** — no `fleet.json` / env peers (or `{"demo":true}`). A curated sample
  lattice still fills the HUD (`mikesai1` / `mikesai6` / `lab-edge` / …).
  DEMO peers are **never** treated as online
- **LIVE** — a node-level LIVE is local facts we actually read, or a fresh
  opt-in probe hit. The fleet chip stays **UNKNOWN** until a probe succeeds;
  LIVE on the local node does **not** make DEMO or unprobed peers green
- **UNKNOWN** — peers from config/env with probes off. Status is
  **CONFIGURED / UNKNOWN**, not online
- **ERR** — `fleet.json` is unreadable, or an opt-in probe failed. The HUD
  still paints a lattice (DEMO peers if the file is broken)
- **STALE** — last opt-in probe aged out; last-seen only, not a current map

The local node is always built from cheap local facts (`hostname`, `uname -sr`,
`/proc/loadavg` or `uptime`). That node is **LIVE** only for facts we actually
read. The HUD never fails as a silent empty graph.

## Agents

Local Hermes is marked **DETECTED** only when `~/.hermes` exists (same honesty
as Ghost Trace: `state.db` or the directory). Fleet Lattice does **not** invent
Hermes/agent status on remote nodes.

## Usage

- Dimmed fullscreen hexagonal lattice, neon edges, idle slow drift
- Local node is larger / brighter
- Click a node (or `←` `→`) for the side panel: label, host, status, last probe
- `Escape` closes
- Theme colors come from Omarchy `Style` / `Color` vars

## Contract

- `schemaVersion: 1`, id `smf.fleet-lattice` (not `omarchy.*`)
- `kinds: ["overlay", "bar-widget"]`
- `entryPoints.overlay: "Overlay.qml"`, `entryPoints.barWidget: "BarWidget.qml"`
- `open(payloadJson)` / `close()` for `shell summon` / `shell hide`
- `keepLoaded: true` so the layer-shell window and last probe map survive
  between summons
- Bar click runs `omarchy-shell shell toggle smf.fleet-lattice '{}'`
- Imports `qs.Ui` / `qs.Commons`; no symlinks

```sh
omarchy plugin validate .
```

## Tests

```sh
node tests/test_lattice_logic.js
```

Optional HTML preview (screenshot bait, DEMO labeled):

```sh
xdg-open preview/index.html
```

## Remove

```sh
omarchy plugin remove smf.fleet-lattice
```

## License

MIT. Copyright (c) 2026 SMF Works.
