.pragma library

// Fleet Lattice helpers. There is no magic fleet API.
// LOCAL is LIVE only for hostname / uname / load we actually read.
// Peers come from fleet.json or env. Missing config ships a DEMO fleet.
// DEMO peers are never online. Probes are opt-in (probe: true).

var STALE_MS = 5 * 60 * 1000
var POLL_MS = 4000
var PROBE_TIMEOUT_MS = 8000
var MAX_PEERS = 18
var CONFIG_REL = ".config/smf-fleet-lattice/fleet.json"
var ENV_KEYS = ["SMF_FLEET_LATTICE", "SMF_FLEET"]
var COLOR_LIVE = "#3DDC97"
var COLOR_ERR = "#FF4D6D"
var COLOR_STALE = "#F5A524"
var COLOR_UNKNOWN = "#8B93A7"
var COLOR_DEMO = "#7DD3FC"

var sharedSnapshot = null

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value))
}

function number(value) {
  var n = Number(value)
  return isFinite(n) ? n : 0
}

function trim(value) {
  return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
}

function emptyConfig() {
  return {
    ok: true,
    probe: false,
    probeMethod: "ping",
    staleAfterMs: STALE_MS,
    nodes: [],
    source: "",
    error: "",
    path: ""
  }
}

function emptyLocalFacts() {
  return {
    hostname: "",
    uname: "",
    loadavg: "",
    hermesHome: false
  }
}

function emptyFleet() {
  return {
    mode: "demo",
    chip: "DEMO",
    honesty: "NO CONFIG · DEMO samples, not your fleet · peers are samples, not online",
    hint: "no fleet.json · demo samples",
    error: "",
    peerSource: "demo",
    probesEnabled: false,
    probeMethod: "ping",
    staleAfterMs: STALE_MS,
    localLive: false,
    probeStale: false,
    anyReachable: false,
    allConfiguredLive: false,
    livePeerCount: 0,
    unresolvedPeerCount: 0,
    nodes: [],
    edges: [],
    selectedId: "",
    forceDemo: false,
    missingConfig: true,
    hermes: "",
    hermesScope: "local-only"
  }
}

function emptyShared() {
  return {
    chip: "DEMO",
    mode: "demo",
    count: 0,
    honesty: "DEMO · overlay not mounted yet",
    hint: "no fleet.json · demo samples"
  }
}

function writeShared(fleet) {
  fleet = fleet || emptyFleet()
  sharedSnapshot = {
    chip: String(fleet.chip || "DEMO"),
    mode: String(fleet.mode || "demo"),
    count: countNodes(fleet),
    honesty: String(fleet.honesty || ""),
    hint: String(fleet.hint || "")
  }
  return sharedSnapshot
}

function readShared() {
  if (!sharedSnapshot) return emptyShared()
  return {
    chip: String(sharedSnapshot.chip || "DEMO"),
    mode: String(sharedSnapshot.mode || "demo"),
    count: number(sharedSnapshot.count),
    honesty: String(sharedSnapshot.honesty || ""),
    hint: String(sharedSnapshot.hint || "")
  }
}

function demoPeers() {
  return [
    { id: "mikesai1", label: "mikesai1", host: "mikesai1.local" },
    { id: "mikesai6", label: "mikesai6", host: "mikesai6.local" },
    { id: "lab-edge", label: "lab-edge", host: "lab-edge.lan" },
    { id: "yard-core", label: "yard-core", host: "yard-core.lan" },
    { id: "relay-west", label: "relay-west", host: "relay-west.lan" }
  ]
}

function configPath(homeDir) {
  var home = String(homeDir || "").replace(/\/+$/, "")
  if (!home) return CONFIG_REL
  return home + "/" + CONFIG_REL
}

function clonePeer(peer) {
  if (!peer || typeof peer !== "object") return null
  return {
    id: String(peer.id || ""),
    label: String(peer.label || peer.id || ""),
    host: String(peer.host || peer.id || "")
  }
}

function normalizePeer(raw, source) {
  if (!raw) return null
  if (typeof raw === "string") {
    var host = trim(raw)
    if (!host) return null
    return { id: host, label: host, host: host, source: String(source || "config") }
  }
  if (typeof raw !== "object") return null
  var id = trim(raw.id || raw.host || raw.label)
  if (!id) return null
  return {
    id: id,
    label: trim(raw.label || raw.id || raw.host || id),
    host: trim(raw.host || raw.id || id),
    source: String(source || "config")
  }
}

function uniquePeers(list, cap) {
  var out = []
  var seen = {}
  var limit = cap > 0 ? cap : MAX_PEERS
  var rows = list || []
  var i
  for (i = 0; i < rows.length && out.length < limit; i++) {
    var peer = rows[i]
    if (!peer || !peer.id) continue
    var key = String(peer.id).toLowerCase()
    if (seen[key]) continue
    seen[key] = true
    out.push(peer)
  }
  return out
}

function parseProbeMethod(value) {
  var raw = trim(value).toLowerCase()
  if (raw === "ssh") return "ssh"
  return "ping"
}

function parseConfigObject(obj, source) {
  var cfg = emptyConfig()
  cfg.source = String(source || "config")
  if (Array.isArray(obj)) {
    cfg.nodes = uniquePeers(obj.map(function(item) {
      return normalizePeer(item, source)
    }).filter(function(item) { return !!item }))
    return cfg
  }
  if (!obj || typeof obj !== "object") {
    cfg.ok = false
    cfg.error = "fleet.json is not an object or array"
    return cfg
  }
  if (obj.probe === true || obj.probe === "true" || obj.probe === 1)
    cfg.probe = true
  cfg.probeMethod = parseProbeMethod(obj.probeMethod || obj.method)
  if (obj.staleAfterMs !== undefined)
    cfg.staleAfterMs = clamp(Math.round(number(obj.staleAfterMs)), 15000, 60 * 60 * 1000)
  var rawNodes = obj.nodes || obj.peers || obj.fleet || []
  if (!Array.isArray(rawNodes)) {
    cfg.ok = false
    cfg.error = "nodes must be an array"
    return cfg
  }
  cfg.nodes = uniquePeers(rawNodes.map(function(item) {
    return normalizePeer(item, source)
  }).filter(function(item) { return !!item }))
  return cfg
}

function parseConfig(raw, source) {
  var text = trim(raw)
  if (!text) return emptyConfig()
  var parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    var bad = emptyConfig()
    bad.ok = false
    bad.error = "fleet.json is not valid JSON"
    bad.source = String(source || "config")
    return bad
  }
  return parseConfigObject(parsed, source || "config")
}

function parseEnvFleet(envValue) {
  var text = trim(envValue)
  if (!text) return emptyConfig()
  if (text.charAt(0) === "[" || text.charAt(0) === "{")
    return parseConfig(text, "env")
  var parts = text.split(/[,\s]+/)
  var nodes = []
  var i
  for (i = 0; i < parts.length; i++) {
    var peer = normalizePeer(parts[i], "env")
    if (peer) nodes.push(peer)
  }
  var cfg = emptyConfig()
  cfg.source = "env"
  cfg.nodes = uniquePeers(nodes)
  return cfg
}

function firstEnvFleet(envMap) {
  envMap = envMap || {}
  var i
  for (i = 0; i < ENV_KEYS.length; i++) {
    var key = ENV_KEYS[i]
    var cfg = parseEnvFleet(envMap[key])
    if (cfg && (cfg.nodes.length || !cfg.ok)) return cfg
  }
  return emptyConfig()
}

function parseHostname(raw) {
  var line = trim(String(raw || "").split(/\r?\n/)[0] || "")
  if (!line || line === "localhost" || line === "(none)") return ""
  return line
}

function parseUname(raw) {
  return trim(String(raw || "").split(/\r?\n/)[0] || "")
}

function parseLoadavg(raw) {
  var text = trim(raw)
  var out = { ok: false, one: 0, five: 0, fifteen: 0, raw: "", label: "" }
  if (!text) return out
  var parts = text.split(/\s+/)
  if (parts.length < 3) return out
  var a = Number(parts[0])
  var b = Number(parts[1])
  var c = Number(parts[2])
  if (!isFinite(a) || !isFinite(b) || !isFinite(c)) return out
  out.ok = true
  out.one = a
  out.five = b
  out.fifteen = c
  out.raw = parts.slice(0, 3).join(" ")
  out.label = a.toFixed(2) + " " + b.toFixed(2) + " " + c.toFixed(2)
  return out
}

function parseUptimeLoad(raw) {
  var text = String(raw || "")
  var match = text.match(/load averages?:\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i)
  if (!match) return parseLoadavg(raw)
  return parseLoadavg(match[1] + " " + match[2] + " " + match[3])
}

function hermesLabel(flags) {
  flags = flags || {}
  if (flags.hermesHome === true) return "DETECTED"
  return ""
}

function remoteHermesNote() {
  return "hermes · not checked (local only)"
}

function neverInventedRemoteHermes(node) {
  if (!node) return true
  if (node.role === "local") return true
  var mark = String(node.hermes || "")
  if (mark !== "") return false
  var note = String(node.hermesNote || remoteHermesNote()).toLowerCase()
  return note.indexOf("not checked") !== -1
}

function localNode(facts) {
  facts = facts || emptyLocalFacts()
  var hostname = parseHostname(facts.hostname)
  var uname = parseUname(facts.uname)
  var load = facts.loadavg && String(facts.loadavg).indexOf("load average") !== -1
    ? parseUptimeLoad(facts.loadavg)
    : parseLoadavg(facts.loadavg)
  var live = !!(hostname || uname || load.ok)
  var hermes = hermesLabel(facts)
  var details = []
  if (uname) details.push(uname)
  if (load.ok) details.push("load " + load.label)
  if (hermes) details.push("hermes " + hermes)
  if (!live) details.push("no local facts yet")
  return {
    id: "local",
    role: "local",
    label: hostname || "local-host",
    host: hostname || "localhost",
    source: "local",
    presence: live ? "live" : "unknown",
    chip: live ? "LIVE" : "UNKNOWN",
    status: live ? "LIVE local facts" : "UNKNOWN local facts",
    detail: details.join(" · "),
    load: load,
    uname: uname,
    hermes: hermes,
    lastProbeAt: 0,
    lastProbeLabel: live ? "local read" : "",
    reachable: null,
    configured: true,
    demo: false
  }
}

function peerNode(peer, opts) {
  opts = opts || {}
  var demo = String((peer && peer.source) || "") === "demo" || opts.demo === true
  var node = {
    id: String((peer && peer.id) || ""),
    role: "peer",
    label: String((peer && peer.label) || (peer && peer.id) || ""),
    host: String((peer && peer.host) || (peer && peer.id) || ""),
    source: demo ? "demo" : String((peer && peer.source) || "config"),
    presence: demo ? "demo" : "unknown",
    chip: demo ? "DEMO" : "UNKNOWN",
    status: demo ? "DEMO sample · not online" : "CONFIGURED · UNKNOWN — not offline",
    detail: demo
      ? "curated sample node — never treated as reachable"
      : "listed in fleet config · probes off · reachability not measured",
    load: { ok: false, one: 0, five: 0, fifteen: 0, raw: "", label: "" },
    uname: "",
    hermes: "",
    hermesNote: remoteHermesNote(),
    lastProbeAt: 0,
    lastProbeLabel: "",
    reachable: null,
    configured: !demo,
    demo: demo
  }
  return node
}

function cloneNode(node) {
  if (!node || typeof node !== "object") return null
  return {
    id: String(node.id || ""),
    role: String(node.role || "peer"),
    label: String(node.label || node.id || ""),
    host: String(node.host || node.id || ""),
    source: String(node.source || ""),
    presence: String(node.presence || ""),
    chip: String(node.chip || ""),
    status: String(node.status || ""),
    detail: String(node.detail || ""),
    load: node.load && typeof node.load === "object" ? {
      ok: node.load.ok === true,
      one: number(node.load.one),
      five: number(node.load.five),
      fifteen: number(node.load.fifteen),
      raw: String(node.load.raw || ""),
      label: String(node.load.label || "")
    } : { ok: false, one: 0, five: 0, fifteen: 0, raw: "", label: "" },
    uname: String(node.uname || ""),
    hermes: String(node.hermes || ""),
    hermesNote: String(node.hermesNote || ""),
    lastProbeAt: number(node.lastProbeAt),
    lastProbeLabel: String(node.lastProbeLabel || ""),
    reachable: node.reachable === true ? true : (node.reachable === false ? false : null),
    configured: node.configured === true,
    demo: node.demo === true
  }
}

function chipOf(presence) {
  if (presence === "demo") return "DEMO"
  if (presence === "live") return "LIVE"
  if (presence === "err") return "ERR"
  if (presence === "stale") return "STALE"
  if (presence === "unknown") return "UNKNOWN"
  return "UNKNOWN"
}

function modeLabel(mode) {
  if (mode === "err") return "ERR"
  if (mode === "stale") return "STALE"
  if (mode === "demo") return "DEMO"
  if (mode === "live") return "LIVE"
  if (mode === "unknown") return "UNKNOWN"
  return String(mode || "UNKNOWN").toUpperCase()
}

function chipColor(chip) {
  if (chip === "LIVE") return COLOR_LIVE
  if (chip === "ERR") return COLOR_ERR
  if (chip === "STALE") return COLOR_STALE
  if (chip === "UNKNOWN") return COLOR_UNKNOWN
  return COLOR_DEMO
}

function relativeTime(epochMs, nowMs) {
  var ts = number(epochMs)
  if (ts <= 0) return ""
  var now = number(nowMs) || Date.now()
  var delta = Math.max(0, now - ts)
  if (delta < 2000) return "just now"
  if (delta < 60000) return Math.floor(delta / 1000) + "s ago"
  if (delta < 3600000) return Math.floor(delta / 60000) + "m ago"
  return Math.floor(delta / 3600000) + "h ago"
}

function pretendsOnline(text) {
  var s = String(text || "").toLowerCase()
  if (s.indexOf("not online") !== -1 || s.indexOf("never treated as reachable") !== -1)
    return false
  if (s.indexOf("not a green fleet") !== -1 || s.indexOf("not offline") !== -1)
    return false
  return s.indexOf(" is online") !== -1 || s.indexOf("are online") !== -1
    || s.indexOf("fleet is up") !== -1
}

function neverPretendOnline(node) {
  if (!node) return true
  if (node.demo === true || node.source === "demo" || node.presence === "demo") {
    return node.chip === "DEMO"
      && node.reachable !== true
      && node.presence !== "live"
      && !pretendsOnline(node.status)
      && !pretendsOnline(node.detail)
  }
  if (node.role !== "local" && node.presence === "unknown")
    return node.chip !== "LIVE" && node.reachable !== true
  return true
}

function honestChip(node) {
  if (!node) return "UNKNOWN"
  if (node.role === "local") return node.chip === "LIVE" ? "LIVE" : "UNKNOWN"
  if (node.demo === true || node.source === "demo" || node.presence === "demo")
    return "DEMO"
  if (node.reachable === true && node.presence === "live") return "LIVE"
  if (node.presence === "err") return "ERR"
  if (node.presence === "stale") return "STALE"
  return "UNKNOWN"
}

function clampHonestNode(node) {
  var copy = cloneNode(node)
  if (!copy) return null
  copy.chip = honestChip(copy)
  if (copy.role !== "local") {
    copy.hermes = ""
    copy.hermesNote = remoteHermesNote()
  }
  if (copy.role === "local")
    copy.reachable = null
  if (copy.chip === "DEMO") {
    copy.presence = "demo"
    copy.reachable = null
    copy.demo = true
    if (!copy.status) copy.status = "DEMO sample · not online"
  }
  if (copy.role !== "local" && copy.chip !== "LIVE")
    copy.reachable = copy.chip === "ERR" ? false : null
  return copy
}

function probeKey(id, host) {
  return String(id || "") + "\0" + String(host || "")
}

function lookupProbe(probeMap, node) {
  probeMap = probeMap || {}
  if (!node) return null
  var keyed = probeMap[probeKey(node.id, node.host)]
  if (keyed) return keyed
  var byId = probeMap[node.id]
  if (byId && (!byId.host || String(byId.host) === String(node.host)))
    return byId
  return null
}

function classifyConfigLoadError(error) {
  var raw = ""
  if (error === undefined || error === null) raw = ""
  else if (typeof error === "object")
    raw = String(error.message || error.error || error.code || error)
  else raw = String(error)
  var s = raw.toLowerCase()
  if (!s || /not found|enoent|no such file|does not exist|filenotfound|file_not_found|missing/.test(s))
    return { missing: true, ok: true, error: "" }
  return { missing: false, ok: false, error: raw || "fleet.json unreadable" }
}

function classifyProbeFailure(errorText) {
  var raw = trim(errorText)
  return raw || "opt-in probe failed"
}

function applyProbe(node, result, now, staleAfterMs) {
  var copy = cloneNode(node)
  if (!copy) return null
  if (copy.demo || copy.source === "demo" || copy.role === "local")
    return copy
  result = result || {}
  var at = number(result.at) || number(now) || Date.now()
  var age = Math.max(0, number(now || at) - at)
  var staleLimit = staleAfterMs > 0 ? staleAfterMs : STALE_MS
  var timeoutMs = PROBE_TIMEOUT_MS
  if (result.host && String(result.host) !== String(copy.host)) {
    copy.presence = "unknown"
    copy.chip = "UNKNOWN"
    copy.status = "CONFIGURED · UNKNOWN — not offline"
    copy.detail = "listed in fleet config · leftover probe was for a different host"
    copy.reachable = null
    copy.lastProbeAt = 0
    copy.lastProbeLabel = ""
    return copy
  }
  copy.lastProbeAt = at
  copy.lastProbeLabel = relativeTime(at, now || at)
  if (result.pending === true && result.ok !== true && result.ok !== false) {
    if (age > timeoutMs) {
      copy.presence = "err"
      copy.chip = "ERR"
      copy.status = "ERR · probe timed out"
      copy.detail = "opt-in probe launched · no result · treated as failure"
      copy.reachable = false
      return copy
    }
    copy.presence = "unknown"
    copy.chip = "UNKNOWN"
    copy.status = "CONFIGURED · UNKNOWN — probe in flight"
    copy.detail = "opt-in " + String(result.method || "ping") + " launched · not offline yet"
    copy.reachable = null
    return copy
  }
  if (result.ok === true) {
    if (age > staleLimit) {
      copy.presence = "stale"
      copy.chip = "STALE"
      copy.status = "STALE · last probe " + (copy.lastProbeLabel || "earlier")
      copy.detail = "probe succeeded earlier · not a current reachability claim"
      copy.reachable = null
    } else {
      copy.presence = "live"
      copy.chip = "LIVE"
      copy.status = "LIVE · probe " + String(result.method || "ping")
      copy.detail = "opt-in " + String(result.method || "ping") + " succeeded"
      copy.reachable = true
    }
    return copy
  }
  if (result.ok === false) {
    if (age > staleLimit) {
      copy.presence = "stale"
      copy.chip = "STALE"
      copy.status = "STALE · last failed probe " + (copy.lastProbeLabel || "")
      copy.detail = String(result.error || "probe failed") + " · result is old"
      copy.reachable = false
    } else {
      copy.presence = "err"
      copy.chip = "ERR"
      copy.status = "ERR · probe failed"
      copy.detail = String(result.error || "opt-in probe failed")
      copy.reachable = false
    }
    return copy
  }
  copy.presence = "unknown"
  copy.chip = "UNKNOWN"
  copy.status = "CONFIGURED · UNKNOWN reachability"
  copy.detail = "listed in fleet config · no probe result yet"
  copy.reachable = null
  return copy
}

function probeArgv(host, method) {
  var target = trim(host)
  if (!target) return []
  if (parseProbeMethod(method) === "ssh")
    return ["ssh", "-oBatchMode=yes", "-oConnectTimeout=1", "-oStrictHostKeyChecking=no", target, "true"]
  return ["ping", "-c1", "-W1", target]
}

function shouldProbe(node, probesEnabled) {
  if (!probesEnabled) return false
  if (!node || node.role === "local") return false
  if (node.demo || node.source === "demo") return false
  return !!trim(node.host)
}

function probeDue(node, hit, now, staleAfterMs) {
  if (!shouldProbe(node, true)) return false
  if (!hit) return true
  if (hit.host && node && String(hit.host) !== String(node.host)) return true
  var at = number(hit.at)
  var age = Math.max(0, number(now) - at)
  var staleLimit = staleAfterMs > 0 ? staleAfterMs : STALE_MS
  if (hit.pending === true && hit.ok !== true && hit.ok !== false)
    return age > PROBE_TIMEOUT_MS
  if (hit.ok === true) return age > Math.max(Math.floor(staleLimit / 2), 15000)
  if (hit.ok === false) return age > Math.max(POLL_MS * 2, 8000)
  return true
}

function probeQueue(nodes, probesEnabled, method) {
  var out = []
  var list = nodes || []
  var i
  for (i = 0; i < list.length; i++) {
    var node = list[i]
    if (!shouldProbe(node, probesEnabled)) continue
    var argv = probeArgv(node.host, method)
    if (!argv.length) continue
    out.push({ id: node.id, host: node.host, method: parseProbeMethod(method), argv: argv })
  }
  return out
}

function resolvePeerSource(opts) {
  opts = opts || {}
  if (opts.forceDemo === true)
    return { source: "demo", nodes: demoPeers().map(function(p) { return normalizePeer(p, "demo") }), error: "", probe: false, probeMethod: "ping", staleAfterMs: STALE_MS, missing: false, forced: true }
  var cfg = opts.config && opts.config.ok !== false && (opts.config.nodes || []).length
    ? opts.config
    : null
  var env = opts.env && opts.env.ok !== false && (opts.env.nodes || []).length
    ? opts.env
    : null
  var chosen = cfg || env
  if (opts.config && opts.config.ok === false && !env)
    return { source: "err", nodes: demoPeers().map(function(p) { return normalizePeer(p, "demo") }), error: opts.config.error || "fleet.json unreadable", probe: false, probeMethod: "ping", staleAfterMs: STALE_MS, missing: false, forced: false }
  if (!chosen)
    return { source: "demo", nodes: demoPeers().map(function(p) { return normalizePeer(p, "demo") }), error: "", probe: false, probeMethod: "ping", staleAfterMs: STALE_MS, missing: true, forced: false }
  return {
    source: chosen.source || "config",
    nodes: (chosen.nodes || []).slice(),
    error: "",
    probe: chosen.probe === true,
    probeMethod: parseProbeMethod(chosen.probeMethod),
    staleAfterMs: chosen.staleAfterMs || STALE_MS,
    missing: false,
    forced: false
  }
}

function edgesFor(nodes) {
  var list = nodes || []
  var local = null
  var i
  for (i = 0; i < list.length; i++) {
    if (list[i].role === "local") { local = list[i]; break }
  }
  var edges = []
  if (!local) return edges
  for (i = 0; i < list.length; i++) {
    var peer = list[i]
    if (peer.role === "local") continue
    var kind = edgeKind(peer)
    edges.push({
      from: local.id,
      to: peer.id,
      kind: kind,
      chip: peer.chip
    })
  }
  return edges
}

function edgeKind(peer) {
  if (!peer) return "unknown"
  if (peer.demo || peer.source === "demo" || peer.chip === "DEMO") return "demo"
  if (peer.reachable === true && peer.chip === "LIVE" && peer.presence === "live") return "live"
  if (peer.chip === "ERR" || peer.presence === "err") return "err"
  if (peer.chip === "STALE" || peer.presence === "stale") return "stale"
  if (peer.configured) return "configured"
  return "unknown"
}

function edgeStroke(kind) {
  if (kind === "live") return { dash: false, alpha: 0.72, width: 2.4 }
  if (kind === "stale") return { dash: true, alpha: 0.22, width: 1.2 }
  if (kind === "err") return { dash: true, alpha: 0.28, width: 1.3 }
  if (kind === "demo") return { dash: true, alpha: 0.22, width: 1.1 }
  return { dash: true, alpha: 0.2, width: 1.2 }
}

function hexPoints(cx, cy, radius, rotation) {
  var pts = []
  var i
  for (i = 0; i < 6; i++) {
    var a = (rotation || 0) + i * Math.PI / 3
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) })
  }
  return pts
}

function layoutNodes(nodes, width, height, phase) {
  var list = nodes || []
  var w = number(width) || 1
  var h = number(height) || 1
  var cx = 0.46
  var cy = 0.52
  var peers = []
  var local = null
  var i
  for (i = 0; i < list.length; i++) {
    if (list[i].role === "local") local = list[i]
    else peers.push(list[i])
  }
  var out = []
  function place(node, nx, ny, scale) {
    var copy = cloneNode(node)
    if (!copy) return
    var drift = (phase || 0)
    copy.nx = nx + Math.sin(drift * 0.7 + out.length) * 0.012
    copy.ny = ny + Math.cos(drift * 0.55 + out.length * 1.3) * 0.01
    copy.scale = scale
    copy.px = copy.nx * w
    copy.py = copy.ny * h
    out.push(copy)
  }
  if (local) place(local, cx, cy, 1.28)
  var rings = [6, 12]
  var index = 0
  var ring = 0
  var slot = 0
  while (index < peers.length) {
    var cap = rings[Math.min(ring, rings.length - 1)]
    var radius = 0.22 + ring * 0.16
    var angle = (slot / cap) * Math.PI * 2 - Math.PI / 2 + (phase || 0) * 0.04
    place(peers[index], cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.86, ring === 0 ? 1 : 0.88)
    index++
    slot++
    if (slot >= cap) {
      slot = 0
      ring++
    }
  }
  return out
}

function fleetMode(fleet) {
  fleet = fleet || emptyFleet()
  if (fleet.forceDemo === true) return "demo"
  if (fleet.peerSource === "err") return "err"
  if (fleet.peerSource === "demo") return "demo"
  if (fleet.probesEnabled && fleet.probeStale) return "stale"
  if (fleet.probesEnabled && fleet.error && !fleet.anyReachable) return "err"
  if (fleet.probesEnabled && fleet.anyReachable && fleet.allConfiguredLive)
    return "live"
  if (fleet.peerSource === "config" || fleet.peerSource === "env")
    return "unknown"
  return "demo"
}

function honestyLine(fleet) {
  fleet = fleet || emptyFleet()
  var mode = fleetMode(fleet)
  var peers = 0
  var i
  var nodes = fleet.nodes || []
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].role !== "local") peers++
  }
  if (mode === "err")
    return "ERR · " + (fleet.error || "fleet.json unreadable") + " · DEMO peers, not online"
  if (mode === "demo") {
    if (fleet.forceDemo === true)
      return "DEMO forced · local " + (fleet.localLive ? "LIVE" : "UNKNOWN") + " · peers are samples, not online"
    return "NO CONFIG · DEMO samples, not your fleet · local " + (fleet.localLive ? "LIVE" : "UNKNOWN") + " · peers are samples, not online"
  }
  if (mode === "stale")
    return "STALE · last opt-in probe aged out · last-seen only, not a current link"
  if (mode === "unknown") {
    if (fleet.probesEnabled && fleet.anyReachable)
      return (fleet.livePeerCount || 0) + " LIVE probe · " + (fleet.unresolvedPeerCount || 0) + " still UNKNOWN/ERR — not a green fleet · local " + (fleet.localLive ? "LIVE" : "UNKNOWN")
    return fleet.probesEnabled
      ? "UNKNOWN — not offline · " + peers + " CONFIGURED · waiting on opt-in probes · local " + (fleet.localLive ? "LIVE" : "UNKNOWN")
      : "UNKNOWN — not offline · " + peers + " CONFIGURED · probes off · local " + (fleet.localLive ? "LIVE" : "UNKNOWN")
  }
  if (fleet.probesEnabled && fleet.allConfiguredLive)
    return "LIVE probes · " + peers + " configured current · local " + (fleet.localLive ? "LIVE" : "UNKNOWN")
  return "UNKNOWN — not a green fleet · " + peers + " CONFIGURED"
}

function fleetHonest(fleet) {
  fleet = fleet || emptyFleet()
  var mode = fleetMode(fleet)
  var nodes = fleet.nodes || []
  var edges = fleet.edges || []
  var i
  if (chipColor("UNKNOWN") === chipColor("STALE")) return false
  if (chipColor("UNKNOWN") === chipColor("LIVE")) return false
  if (chipColor("DEMO") === chipColor("LIVE")) return false
  if (mode === "live" && fleet.allConfiguredLive !== true) return false
  if (mode === "live" && !fleet.probesEnabled) return false
  if (fleet.localLive === true && mode === "demo" && fleet.chip === "LIVE") return false
  if (fleet.localLive === true && mode === "unknown" && fleet.chip === "LIVE") return false
  if (pretendsOnline(fleet.honesty)) return false
  for (i = 0; i < nodes.length; i++) {
    var node = nodes[i]
    if (node.role === "local") {
      if (node.reachable === true) return false
      continue
    }
    if (!neverPretendOnline(node)) return false
    if (!neverInventedRemoteHermes(node)) return false
    if (honestChip(node) !== node.chip) return false
    if (mode === "demo" && node.chip === "LIVE") return false
    if (mode === "demo" && node.reachable === true) return false
    if (mode === "unknown" && node.reachable === true && node.chip === "LIVE") {
      /* mixed probes stay on UNKNOWN fleet chip; a single live peer is ok */
    } else if (mode === "unknown" && node.chip === "LIVE" && fleet.allConfiguredLive === true) {
      return false
    }
    if (mode === "unknown" && node.reachable === true && fleet.chip === "LIVE") return false
    if (mode === "demo" && node.chip !== "DEMO") return false
  }
  for (i = 0; i < edges.length; i++) {
    if ((mode === "demo") && edges[i].kind === "live") return false
    if (mode !== "live" && edges[i].kind === "live" && fleet.allConfiguredLive === true)
      return false
    if (edges[i].kind === "stale" && edges[i].kind === "live") return false
    if (String(edges[i].chip) === "STALE" && edges[i].kind !== "stale") return false
    if (String(edges[i].chip) === "DEMO" && edges[i].kind === "live") return false
  }
  if (mode === "demo" && fleet.chip !== "DEMO") return false
  if (mode === "unknown" && fleet.chip !== "UNKNOWN") return false
  return true
}

function catalogHint(fleet) {
  fleet = fleet || emptyFleet()
  var mode = fleetMode(fleet)
  if (mode === "demo") {
    if (fleet.forceDemo === true) return "demo forced · samples only"
    return "no fleet.json · demo samples"
  }
  if (mode === "err") return "config error · demo lattice"
  if (mode === "stale") return "stale probes · last-seen only · not a current link"
  if (mode === "unknown") {
    if (fleet.probesEnabled && fleet.anyReachable)
      return "mixed probes · not a green fleet"
    return fleet.probesEnabled
      ? "configured lattice · waiting on probes"
      : "configured lattice · probes off · not offline"
  }
  return fleet.probesEnabled ? "opt-in probes current" : "configured lattice"
}

function countNodes(fleet) {
  return ((fleet && fleet.nodes) || []).length
}

function findNode(nodes, id) {
  var list = nodes || []
  var i
  for (i = 0; i < list.length; i++) {
    if (String(list[i].id) === String(id)) return list[i]
  }
  return null
}

function wrapIndex(index, count, delta) {
  var n = count | 0
  if (n <= 0) return 0
  var i = index | 0
  var d = delta | 0
  return ((i + d) % n + n) % n
}

function parsePayload(raw) {
  var payload = {}
  try {
    payload = JSON.parse(raw || "{}") || {}
  } catch (e) {
    payload = {}
  }
  return {
    forceDemo: payload.demo === true || payload.forceDemo === true,
    selected: payload.selected !== undefined ? String(payload.selected) : ""
  }
}

function buildFleet(opts) {
  opts = opts || {}
  var now = number(opts.now) || Date.now()
  var local = localNode(opts.localFacts || emptyLocalFacts())
  var resolved = resolvePeerSource(opts)
  var peers = []
  var i
  for (i = 0; i < resolved.nodes.length; i++) {
    var raw = resolved.nodes[i]
    if (!raw) continue
    if (local.host && String(raw.host).toLowerCase() === String(local.host).toLowerCase())
      continue
    if (local.label && String(raw.id).toLowerCase() === String(local.label).toLowerCase())
      continue
    var demo = resolved.source === "demo" || resolved.source === "err"
    var node = peerNode(raw, { demo: demo })
    if (!demo && resolved.probe === true) {
      var probeMap = opts.probes || {}
      var hit = lookupProbe(probeMap, node)
      if (hit) node = applyProbe(node, hit, now, resolved.staleAfterMs)
      else {
        node.status = "CONFIGURED · UNKNOWN — not offline"
        node.detail = "opt-in probes enabled · no result yet · not a down claim"
      }
    }
    peers.push(clampHonestNode(node))
  }
  var nodes = [clampHonestNode(local)].concat(peers)
  var anyReachable = false
  var probeStale = false
  var probeSeen = false
  var livePeerCount = 0
  var unresolvedPeerCount = 0
  var configuredPeers = 0
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].role === "local") continue
    configuredPeers++
    if (nodes[i].reachable === true && nodes[i].chip === "LIVE") {
      anyReachable = true
      livePeerCount++
    } else {
      unresolvedPeerCount++
    }
    if (nodes[i].chip === "STALE")
      probeStale = true
    if (nodes[i].lastProbeAt > 0)
      probeSeen = true
  }
  var fleet = emptyFleet()
  fleet.forceDemo = opts.forceDemo === true
  fleet.missingConfig = resolved.missing === true && opts.forceDemo !== true
  fleet.peerSource = resolved.source
  fleet.error = resolved.error || ""
  fleet.probesEnabled = resolved.probe === true && resolved.source !== "demo" && resolved.source !== "err"
  fleet.probeMethod = resolved.probeMethod
  fleet.staleAfterMs = resolved.staleAfterMs
  fleet.localLive = local.chip === "LIVE"
  fleet.anyReachable = anyReachable
  fleet.livePeerCount = livePeerCount
  fleet.unresolvedPeerCount = unresolvedPeerCount
  fleet.allConfiguredLive = fleet.probesEnabled && configuredPeers > 0 && unresolvedPeerCount === 0 && livePeerCount === configuredPeers
  fleet.probeStale = probeStale && !anyReachable
  fleet.nodes = nodes
  fleet.edges = edgesFor(nodes)
  fleet.hermes = local.hermes
  fleet.hermesScope = "local-only"
  fleet.selectedId = opts.selectedId || "local"
  if (!findNode(nodes, fleet.selectedId)) fleet.selectedId = "local"
  fleet.mode = fleetMode(fleet)
  fleet.chip = modeLabel(fleet.mode)
  fleet.honesty = honestyLine(fleet)
  fleet.hint = catalogHint(fleet)
  if (probeSeen && fleet.probesEnabled && !anyReachable && !probeStale && fleet.mode === "unknown")
    fleet.hint = "configured lattice · waiting on probes"
  writeShared(fleet)
  return fleet
}
