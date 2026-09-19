# Opposition: do not trust the node-graph HUD as fleet status yet

Adversarial review of `smfworks/omarchy-fleet-lattice` at `b9b63c2`
(`smf.fleet-lattice` v0.1.0, plugin #1). Evidence is from `LatticeLogic.js`,
`Overlay.qml`, `BarWidget.qml`, `preview/index.html`, `manifest.json`,
`README.md`, `fleet.example.json`, and `tests/test_lattice_logic.js` **as they
shipped on `main`**.

## Addressed in honest-lattice

The follow-up product PR (`Honest lattice — OPPOSITION + trust fixes`) changes
the trust contract this review asked for. The analysis below is the **pre-fix
evidence**. What that PR closes is listed in §6; leftover P1/P2 items stay
open.

Method: assume a user screenshots the overlay (or the HTML preview, or the
bar chip) and believes the glowing nodes are their Omarchy fleet. Argue
against that trust. Example inputs are concrete.

v0.1 already has a real honesty spine: `fleetHonest`, DEMO peers that cannot
inherit leftover probes, fleet chip UNKNOWN until an opt-in probe hits, local
Hermes only. That is necessary. It is not sufficient. A screenshot of a
hex lattice still reads as a command hologram.

---

## 1. Executive opposition

Fleet Lattice sells a sci-fi “fleet command hologram.” What it actually
paints is **one local fact node** (`hostname` / `uname` / load) plus either
a curated DEMO roster or a list of names from `fleet.json` / env. There is
no fleet API. There is no last-seen bus. Reachability exists only if the
user opts into `ping` / `ssh`, and even then the first failure can vanish
into UNKNOWN.

The honesty chip can say DEMO or UNKNOWN while the field still looks
online:

- Missing `fleet.json` fills the HUD with `mikesai1`, `mikesai6`,
  `lab-edge`, `yard-core`, `relay-west` — the same boxes the README
  presents as the real yard. Local is a large **green LIVE** disc in the
  center. Edges run from that green disc to every sample. The chip says
  DEMO. The picture says fleet.
- Configured peers with probes off chip **UNKNOWN** in the **same amber
  as STALE**. Amber is a verdict. UNKNOWN is the absence of one. A
  screenshot cannot tell “we never pinged” from “last ping aged out” from
  “that box is down.”
- `FileView.onLoadFailed` clears `configError`. An unreadable
  `fleet.json` (`chmod 000`, parse later, path wrong) is
  indistinguishable from “no file.” Both ship the DEMO roster with no
  ERR.
- Opt-in probes are one-shot. `maybeStartProbes` skips any id already in
  `probeMap`. A hung `ping`, a process that never emits `onExited`, or a
  start failure that never calls `ingestProbe` leaves the node
  **UNKNOWN · no result yet**. Failure is silent. The graph stays pretty.
- `catalogHint("unknown")` hard-codes `configured lattice · probes off`
  even when `probesEnabled` is true and we are waiting on the first ping.
  The rail lies about the opt-in.
- One successful probe paints the **fleet** chip LIVE (green). Other
  peers may still be UNKNOWN or ERR. Local LIVE is already green and
  larger than everything else. The lattice reads as a healthy fleet.
- Remote Hermes is a blank string. Blank reads as “no agent,” not “we
  did not look.” The live preview scene prints `hermes DETECTED` on the
  local node in a fleet that still has an ERR peer — easy to screenshot
  as yard-wide agent status.
- The bar widget never reads the fleet. Face is decorative hexes in
  `Color.accent`. Tooltip is “summon the fleet hologram.” Overlay can be
  DEMO / UNKNOWN / ERR; the chip the user looks at all day looks
  installed and live.

Until DEMO cannot pass for a yard, UNKNOWN cannot pass for offline,
probe misses cannot stay pretty, local LIVE cannot greenwash edges or
the fleet chip, missing config cannot impersonate a roster, and the bar
cannot drift from the overlay, this is a mood light, not fleet status.

---

## 2. P0 — trust breakers (must-fix)

### P0.1 DEMO peers look online

README: “DEMO peers are **never** treated as online.” The logic mostly
honors that (`presence: "demo"`, `reachable !== true`, leftover probes
ignored). The **picture** does not.

`demoPeers()` ships production names:

```javascript
{ id: "mikesai1", host: "mikesai1.local" }
{ id: "mikesai6", host: "mikesai6.local" }
{ id: "lab-edge", host: "lab-edge.lan" }
```

Those are the same tokens as `fleet.example.json` and the README yard.
`buildFleet()` with no config still places a **LIVE** local node
(`chipColor` `#3DDC97`) at 1.28× scale and draws an edge from that green
disc to every DEMO peer. Overlay `paintField` dashes DEMO edges but still
colors them from the peer chip (cyan) against a green center. Preview
goes further — the stage always has a green wash:

```css
radial-gradient(circle at 70% 20%, rgba(61, 220, 151, 0.08), transparent 28%)
```

| Input | What is true | What the screenshot implies |
| --- | --- | --- |
| Fresh install, no `~/.config/smf-fleet-lattice/fleet.json` | Curated samples, `peerSource: "demo"` | mikesai1 / mikesai6 / lab-edge are on the lattice |
| `{"demo":true}` while a real `fleet.json` exists | Forced samples; real peers hidden | Same named boxes as the live yard |
| Local `hostname` / load succeeded | Local facts only | A green fleet command graph |
| HTML preview default scene | Hard-coded DEMO + local LIVE | Marketing still of “the fleet” |

Node discs glow. Hex strokes glow. The honesty pill is a 13px caption.
Nobody reads the caption first.

`neverPretendOnline` rejects the strings `is online` / `are online`. It
does not reject a green-centered constellation of real hostnames.

### P0.2 Local LIVE paints the lattice green

v0.1 stopped the worst version of this: `fleetMode` stays `"demo"` /
`"unknown"` when only the local node is LIVE, and `fleetHonest` rejects
peer `chip === "LIVE"` in those modes. The remaining greenwash is
visual and fleet-level.

```javascript
if (fleet.probesEnabled && fleet.anyReachable) return "live"
```

`anyReachable` is “at least one peer has a fresh ok probe.” One hit
paints the **HUD chip** LIVE (`#3DDC97`). Overlay honesty pill, rail
border, and preview mode token all go green. Other peers may still be
UNKNOWN or ERR.

Local itself is `reachable: true` whenever hostname / uname / load
succeeded. That is not a ping. `edgesFor` uses peer reachability, but
anything that treats `reachable` as “this node is up” will count the
box you are sitting on as a fleet online.

| Input | Fleet chip | Picture |
| --- | --- | --- |
| DEMO, local facts ok | DEMO (cyan pill) | Huge green local + cyan “connected” samples |
| 3 configured peers, probes off | UNKNOWN | Same huge green local; amber peers |
| 3 configured peers, probes on, 1 ping ok, 2 no result | **LIVE** | Green pill + one green peer + two amber peers = “fleet is up” |
| Preview any scene | local chip LIVE | Green wash behind the whole stage |

Local LIVE is an honest local fact. It is not permission to color the
hologram like a healthy mesh.

### P0.3 UNKNOWN vs offline (and STALE) confusion

UNKNOWN is the correct epistemic state for “configured, not measured.”
The HUD does not say that in a way a screenshot can survive.

```javascript
function chipColor(chip) {
  if (chip === "LIVE") return "#3DDC97"
  if (chip === "ERR") return "#FF4D6D"
  if (chip === "STALE") return "#F5A524"
  if (chip === "UNKNOWN") return "#F5A524"  // same amber
  return "#7DD3FC"
}
```

UNKNOWN and STALE are the same paint. Preview copies the map.
`catalogHint` for unknown is `configured lattice · probes off` — a
process note, not “this is not a down claim.”

Peer copy:

```
status: "CONFIGURED · UNKNOWN reachability"
detail: "listed in fleet config · probes off"
```

There is no “not offline.” There is no “we did not measure.” Amber in
every other SMF HUD means warning / aged / problem. A user who has used
Ghost Trace STALE or Neural Pulse ERR will read these discs as down.

ERR is overloaded: broken `fleet.json` **and** a failed ping both chip
ERR. A failed ping is closer to “offline-as-of-this-probe” than to
“config unreadable,” but the glyph cannot say which. A missing probe
result is neither.

| Input | Chip / color | Easy misread |
| --- | --- | --- |
| `fleet.json` listed, `probe: false` | UNKNOWN amber | Host is down |
| `probe: true`, no `onExited` yet | UNKNOWN amber | Host is down |
| Probe ok 8 minutes ago (`staleAfterMs` 5m) | STALE amber | Same as UNKNOWN; or “still linked” because the edge is solid |
| Probe exit 1 just now | ERR red | Config is broken |
| Broken JSON (real ERR) | ERR red + DEMO peers | Same red as a down box |

UNKNOWN is not offline. The HUD lets you believe it is.

### P0.4 Silent probe failures

Probes are opt-in. Once opted in, a miss must be loud. It is not.

`Overlay.qml` `maybeStartProbes`:

```qml
if (!root.probeMap[queue[i].id]) { next = queue[i]; break }
if (!next) return
probeProc.command = next.argv
probeProc.nodeId = next.id
probeProc.running = true
```

No pending marker. No timeout. No `onStartFailed`. No retry. The
`Process` has no stdout/stderr collector. The poll timer only calls
`refreshFacts()` (hostname / uname / load / FileView reload). It does
not re-queue probes.

`buildFleet` if `probe === true` and no hit:

```javascript
node.status = "CONFIGURED · UNKNOWN reachability"
node.detail = "opt-in probes enabled · no result yet"
```

That is the same face as “probes off” except the detail string. Chip
stays UNKNOWN. `fleetMode` stays `"unknown"`. `catalogHint` still says
`probes off`.

| Input | What happens | Face |
| --- | --- | --- |
| `ping` missing (`exit 127`) and `onExited` fires | `ingestProbe(..., false, "probe exit 127")` | ERR — the one honest path |
| `Process` start fails (no `onStartFailed`) | `probeMap` never written | UNKNOWN forever |
| `ping` hangs despite `-W1` (capability drop, weird resolver) | `running` stays true; queue stuck | UNKNOWN · no result yet |
| First probe recorded, later the host dies | id is in `probeMap`; never probed again | LIVE until `staleAfterMs`, then STALE last-seen — no new ERR |
| `keepLoaded` overlay hidden, process killed mid-flight | pending never ingested | UNKNOWN |

A probe that did not come back is a failure. Painting it as “we just
haven’t heard” after the command was launched is a silent miss.

### P0.5 Inventing Hermes remote status (including by omission)

v0.1 does **not** copy `~/.hermes` onto peers. `peerNode.hermes` is
`""`. `neverInventedRemoteHermes` only checks that the string is empty.
Empty is not a status. Empty is a hole.

Local DETECTED is already a weak claim (readable `~/.hermes/state.db` or
a directory named `.hermes` — same family Ghost Trace burned). The
overlay rail prints a hardcoded caption when local is selected:

```qml
text: "hermes · DETECTED — no remote agent status"
```

When a **peer** is selected, that line is hidden. The rail then shows
label, host, UNKNOWN/LIVE/ERR, and no Hermes row at all. A screenshot
of mikesai1 with no Hermes line reads “mikesai1 has no agent,” not
“we refuse to guess.”

Preview live scene:

```javascript
{ id: "local", ..., detail: "... · hermes DETECTED", hermes: true }
{ id: "mikesai1", chip: "LIVE", ... }   // no hermes field
{ id: "lab-edge", chip: "ERR", ... }
```

Local DETECTED + a LIVE peer in the same hologram is how a yard-wide
agent story gets invented without a single remote read.

`fleet.hermes = local.hermes` is a fleet-level field. Nothing in v0.1
renders it as a fleet chip, but anything that later prints
`fleet.hermes` will advertise DETECTED for the lattice.

### P0.6 Config missing vs DEMO (FileView swallows ERR)

Two different worlds share one costume.

```qml
onLoadFailed: {
  root.configText = ""
  root.configError = ""
  if (root.opened) root.rebuildFleet()
}
```

`rebuildFleet` then sees empty text and empty error → `emptyConfig()` →
`resolvePeerSource` → `source: "demo"` + `demoPeers()`.

| Input | `peerSource` | Face |
| --- | --- | --- |
| No file (normal first run) | `demo` | Named DEMO roster, chip DEMO |
| File exists, `chmod 000` / EACCES | `demo` | Same. No ERR. |
| Path is a directory or unreadable symlink | `demo` | Same |
| Invalid JSON (FileView still `onLoaded`) | `err` | ERR chip + the **same** DEMO roster |
| `{"demo":true}` with a valid file | `demo` | Same roster; real peers hidden |

Missing config is a DEMO. Unreadable config is an ERR. v0.1 paints both
as a populated yard. `catalogHint("demo")` is `demo lattice · no
fleet.json` even when the file is present and we simply could not read
it, and even when demo was forced.

`forceDemo` and “no peers configured” are also the same `mode: "demo"`.
A screenshot cannot tell “I asked for samples” from “I have no fleet
file” from “I have a fleet file this process cannot read.”

### P0.7 Probe opt-in bypassed (hint + leftover face)

Logic default is honest: `emptyConfig().probe === false`; only
`true` / `"true"` / `1` enable probes; DEMO / ERR sources force
`probesEnabled` false; `shouldProbe` refuses local and demo.

The HUD still bypasses the *story* of opt-in:

```javascript
if (mode === "unknown") return "configured lattice · probes off"
```

That runs before the later patch that rewrites the hint when a probe
has already been seen. **Probes on, zero results** → rail says probes
off. The user who set `"probe": true` is told the HUD is not probing.
The user who did not set it sees the same words. Opt-in is
undistinguishable from opt-out on the face that is actually visible.

`maybeStartProbes(..., true, ...)` hard-codes the enabled flag after a
single `probesEnabled` guard. If `rebuildFleet` races (config reload
flips probe off while `probeProc` is running), `onExited` still
`ingestProbe`s into `probeMap`. The next rebuild with `probe: false`
ignores the map (good) — unless a later `"probe": true` on a **different
host list** reuses the same id and applies a leftover hit without
running a new command. That is a status bypass: an old ping for
`mikesai1` can green a newly edited `mikesai1` after the user turned
probes back on, without a fresh probe.

Env `SMF_FLEET_LATTICE='{"probe":true,"nodes":[...]}'` is documented
opt-in. Fine. The hint lying about it is not.

### P0.8 STALE edges look like links

`edgesFor`:

```javascript
else if (peer.chip === "STALE") kind = "stale"
```

`paintField`:

```qml
var alpha = edge.kind === "live" ? 0.72 : (edge.kind === "demo" ? 0.28 : 0.2)
ctx.lineWidth = edge.kind === "live" ? 2.4 : 1.3
if (edge.kind === "configured" || edge.kind === "unknown" || edge.kind === "demo")
  ctx.setLineDash([7, 9])
else
  ctx.setLineDash([])
```

STALE is **solid**. LIVE is solid. ERR is solid. Only demo / configured
/ unknown dash. A stale last-seen is drawn more “connected” than an
honest UNKNOWN. Color is the same amber as UNKNOWN, so the only
difference is the stroke that makes STALE look healthier.

`clampHonestNode` then **drops** `reachable: false` on STALE:

```javascript
if (copy.role !== "local" && copy.chip !== "LIVE")
  copy.reachable = copy.chip === "ERR" ? false : null
```

A failed probe that aged out loses the down bit. The edge is a solid
amber link with `reachable: null`. That is a last-seen costume, not a
last-seen claim.

`fleetHonest` rejects `kind === "live"` in demo/unknown modes. It does
not require STALE edges to be `kind: "stale"`, dashed, or non-green.
Preview dashes anything that is not LIVE — the QML overlay is the
liar here.

---

## 3. P1 — gaps / correctness (high ones in this PR)

- **Bar chip vs overlay drift (high).** `BarWidget.qml` does not import
  `LatticeLogic.js`. `nodeCount` / `modeChip` stay `0` / `"DEMO"` and
  are never written. Face is accent hexes. Manifest promises “Count is
  nodes on the lattice, not invented online hosts.” The count is not
  wired. Overlay DEMO / UNKNOWN / ERR cannot appear on the chip the
  user actually stares at. Same class as Ghost Trace’s mute `GT`.
- **Mixed probes green the fleet (high).** One LIVE peer + N UNKNOWN
  is `fleetMode === "live"`. Honesty line becomes `LIVE local · probe
  hits · N configured`. That invents a green fleet. High because it is
  the remaining “invent online” after v0.1 locked the zero-hit case.
- **`catalogHint` vs `honestyLine` disagreement (high).** Probes on +
  no hits: honesty says “waiting on opt-in probes”; hint says “probes
  off.” Rail shows both.
- **Local `reachable: true` (high).** Local LIVE is facts, not a
  probe. The field name is a lie waiting for a caller.
- **Remote Hermes blank vs “not checked” (high).** Omission invents
  “no agent.” Peers need an explicit refusal.
- **FileView missing vs unreadable (high / also P0.6).** Need a
  classifier. Empty `onLoadFailed` error should stay DEMO (ENOENT is
  the common case). Permission / “access” / “unreadable” must be ERR.
- **Probe map reuse across host edits (high / also P0.7).** Hits must
  be keyed by id **and** host, or dropped when the host string
  changes.
- **UNKNOWN copy does not say “not offline.”** Status/detail need the
  negation, not just the word UNKNOWN.
- **ERR overload.** Config ERR and probe ERR share a chip. Acceptable
  if the honesty line names which; today mixed graphs cannot.
- **`hostname` / `uname` / load `Process` have no failure path.** A
  failed local read stays “no local facts yet” / UNKNOWN — acceptable
  — but a hang leaves the last text in place across summons
  (`keepLoaded`). Stale local facts are not marked STALE.
- **Preview is a second HUD.** Hard-coded scenes can drift from
  `buildFleet`. The default scene is the marketing still (P0.1).
- **`ssh -oStrictHostKeyChecking=no`.** Not an honesty bug; it is a
  trust bug of a different kind. Do not silently accept new hosts
  forever. P1 for a later probe-hardening PR.
- **No CI workflow.** `node tests/test_lattice_logic.js` is local only.
- **Tests the current file avoids.** Mixed LIVE+UNKNOWN must not fleet
  chip LIVE. UNKNOWN color ≠ STALE color. `onLoadFailed` classifier.
  Pending/timeout probe → ERR. STALE edges not solid-live. Remote
  hermes refused in copy. `catalogHint` when probes are on. Bar shared
  snapshot. Local `reachable !== true`.
- **QML contract leftovers.** Overlay `open` / `close` / `toggle`
  exist; bar only `exec`s `omarchy-shell shell toggle`. No
  `preview.png`. README says `omarchy plugin validate .` and not
  `qmllint`.

---

## 4. P2 — improvements

- Persist last-good probe results across `omarchy-shell` restart with
  an on-disk cache that ages into STALE, so a reboot is not a silent
  UNKNOWN wipe — **and** so a reboot cannot resurrect a green fleet
  from a file older than `staleAfterMs`.
- Per-edge last-seen labels on the canvas, not only in the rail.
- Distinct probe-ERR vs config-ERR chips (or a sublabel) so a down box
  and a broken `fleet.json` cannot share a glyph.
- Official `qmllint -I "$OMARCHY_PATH/shell"`; GitHub Actions for
  `node tests/test_lattice_logic.js`; pin a plugin tag instead of git
  HEAD.
- Theme tokens for chip colors (`Color.accent` / warning / error)
  instead of hex literals that the preview must duplicate.
- Stop the 4s local-fact poll while the overlay is hidden; probe only
  while opened (already mostly true) and back off after consecutive
  ERR.
- Do not grow a remote Hermes/agent session strip here. Neural Pulse
  owns sessions. This plugin may only say “local home visible, remotes
  not checked.”
- Replace production yard names in `demoPeers()` with obviously fake
  tokens (`sample-alpha`) so a DEMO screenshot cannot be forwarded as
  mikesai6’s fleet. That is a product choice; the honesty PR can
  refuse the implication without renaming the yard lore.

---

## 5. Quick wins (≤ 1 day)

1. **Distinct paint for UNKNOWN vs STALE vs DEMO vs LIVE.** UNKNOWN is
   slate, not amber. STALE stays amber. LIVE green only for a current
   probe hit (peers) or current local facts (local). DEMO cyan, never
   green.
2. **Copy that survives a screenshot.** UNKNOWN: “not offline ·
   reachability not measured.” DEMO: “NO CONFIG · samples, not your
   fleet” vs “DEMO forced.” STALE: “last-seen only · not a current
   link.”
3. **Never silent probe miss.** Mark pending on launch. `onStartFailed`
   / timeout / non-zero exit → ERR (or STALE if the result aged).
   Re-queue when due. Hint says “waiting on probes” when probes are on.
4. **Local LIVE does not greenwash.** Fleet chip LIVE only when every
   configured peer is a current LIVE probe. Mixed stays UNKNOWN (or
   equivalent non-green) with “N LIVE · M still UNKNOWN/ERR — not a
   green fleet.” Local `reachable` is not `true`. DEMO/UNKNOWN edges
   never `kind: "live"`. Preview drops the green wash.
5. **Missing ≠ unreadable ≠ forced.** Classifier on FileView failure.
   Unreadable `fleet.json` is ERR. Missing is DEMO with `missingConfig`.
   `{"demo":true}` is forced DEMO. Honesty line names which.
6. **Refuse remote Hermes.** Clamp peer `hermes` to empty. Rail: 
   `hermes · not checked (local only)`. `fleet.hermes` stays local-only
   and is never painted as a fleet chip.
7. **STALE edges are last-seen, not links.** `kind: "stale"`, dashed,
   amber, low alpha. Never solid. `fleetHonest` rejects a live-looking
   stale edge.
8. **Share fleet snapshot in `LatticeLogic.js`.** Overlay writes; bar
   reads the same chip / count / honesty. Bar face names DEMO /
   UNKNOWN / ERR / STALE / LIVE. No mute accent hex.
9. **README + tests for (1)–(8).** Link this file. State outright: do
   not trust the node graph as fleet status yet.
10. **Probe hits bind id+host.** Leftover `mikesai1` ping does not
    green a rewritten host.

---

## 6. Suggested next ship (one concrete fix PR)

**Title:** Honest lattice — OPPOSITION + trust fixes.

**Do not** restyle the hologram. Change the trust contract:

1. Chips exhaustive and visually distinct: DEMO / LIVE / UNKNOWN /
   ERR / STALE on overlay, nodes, edges, preview, and bar. UNKNOWN ≠
   STALE paint. LIVE green is never inherited.
2. Fleet chip is LIVE only for a fully probed-live configured set.
   Local LIVE cannot move the fleet chip. Mixed probes stay non-green
   and say so.
3. Probe launch is pending; start-fail / timeout / exit ≠ 0 are ERR
   (STALE once aged). Hint and honesty never say “probes off” while
   probes are on. Hits key on id+host.
4. FileView miss vs unreadable vs `{"demo":true}` are three faces.
5. Remote Hermes is an explicit “not checked.” No blank, no DETECTED
   on peers, no fleet-wide DETECTED.
6. STALE edges dashed last-seen. DEMO edges cannot look live.
7. Tests + README + this file.

That single PR makes a screenshot of the lattice *disprovable*. Visual
polish, on-disk probe cache, and fake demo names can follow.

---

## 7. What already holds (do not redo)

- **`fleetHonest` / `honestChip` / `neverPretendOnline` exist.** They
  already block DEMO peers from `reachable: true` and block leftover
  probes under `forceDemo`. Keep them; tighten the holes above.
- **Fleet chip already stays UNKNOWN when probes are on and no hit
  has been ingested.** Do not regress that. The hole is mixed hits
  and the hint that still says “probes off.”
- **DEMO peers are never queued** (`shouldProbe` / `probeQueue`).
  Keep it. The hole is the picture, the names, and missing-vs-ERR.
- **`neverInventedRemoteHermes` already requires an empty remote
  string.** Keep the refuse. Add the explicit “not checked” copy so
  emptiness cannot be read as a finding.
- **Local Hermes DETECTED only from `~/.hermes`.** Do not add
  `command -v hermes` or `pgrep`. Neural Pulse already burned PATH /
  process-name detection.
- **Probes default off.** `parseConfig` requires an explicit true.
  Do not “helpfully” ping `*.local` because a name looks like a host.
- **Quattro overlay + bar-widget shape is largely correct:**
  `schemaVersion: 1`, id `smf.fleet-lattice` (not `omarchy.*`),
  `kinds: ["overlay", "bar-widget"]`, `keepLoaded: true`, `open` /
  `close` / `toggle`, `qs.Ui` / `qs.Commons`, no repo symlinks.
- **Unsandboxed warning** is already in the README.
- **Node helper tests exist** and cover the happy path v0.1 believed
  (DEMO never online, UNKNOWN until a hit, local LIVE ≠ DEMO fleet
  chip). They are not a screenshot-acceptance suite.

None of that makes a node-graph screenshot safe. It means this PR can
stay small: honest chips, honest misses, honest edges, honest missing
config, shared bar state, tests.
