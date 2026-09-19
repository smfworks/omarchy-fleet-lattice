#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "LatticeLogic.js"), "utf8")
  .replace(/^\.pragma library\s*/, "");
const Lattice = { Math, Date, Number, String, Array, Object, JSON, isFinite, console };
vm.createContext(Lattice);
vm.runInContext(src, Lattice);

const now = 1_700_000_000_000;

function localFacts(extra) {
  return Object.assign({
    hostname: "mikesai6\n",
    uname: "Linux 6.12.0-omarchy\n",
    loadavg: "0.12 0.08 0.05 1/234 1888\n",
    hermesHome: false
  }, extra || {});
}

const demo = Lattice.demoPeers();
assert.ok(demo.length >= 3, "demo fleet ships several sample boxes");
assert.ok(demo.some(function(p) { return p.id === "mikesai1"; }));
assert.ok(demo.some(function(p) { return p.id === "mikesai6"; }));
assert.ok(demo.some(function(p) { return p.id === "lab-edge"; }));

const empty = Lattice.buildFleet({ now: now });
assert.strictEqual(empty.mode, "demo");
assert.strictEqual(empty.chip, "DEMO");
assert.ok(empty.honesty.indexOf("DEMO") !== -1);
assert.ok(empty.nodes.length >= 1, "never a silent empty graph");
empty.nodes.filter(function(n) { return n.role === "peer"; }).forEach(function(node) {
  assert.strictEqual(node.chip, "DEMO");
  assert.strictEqual(node.presence, "demo");
  assert.notStrictEqual(node.reachable, true);
  assert.ok(Lattice.neverPretendOnline(node));
  assert.ok(node.status.indexOf("not online") !== -1);
});

const liveLocal = Lattice.buildFleet({ now: now, localFacts: localFacts() });
const local = liveLocal.nodes.find(function(n) { return n.role === "local"; });
assert.ok(local);
assert.strictEqual(local.chip, "LIVE");
assert.strictEqual(local.label, "mikesai6");
assert.strictEqual(local.load.ok, true);
assert.ok(local.detail.indexOf("Linux") !== -1);
assert.ok(local.detail.indexOf("0.12") !== -1);
assert.strictEqual(local.hermes, "");
assert.strictEqual(liveLocal.mode, "demo", "demo peers keep the fleet chip DEMO even when local is LIVE");
assert.ok(liveLocal.honesty.indexOf("local LIVE") !== -1);
assert.ok(liveLocal.honesty.indexOf("not online") !== -1);
assert.ok(Lattice.fleetHonest(liveLocal));
assert.ok(liveLocal.edges.every(function(edge) { return edge.kind !== "live"; }));

const hermesLocal = Lattice.localNode(localFacts({ hermesHome: true }));
assert.strictEqual(hermesLocal.hermes, "DETECTED");
assert.ok(hermesLocal.detail.indexOf("hermes DETECTED") !== -1);

const remoteHermes = Lattice.peerNode({ id: "mikesai1", label: "mikesai1", host: "mikesai1", source: "config" });
assert.strictEqual(remoteHermes.hermes, "");
assert.ok(Lattice.neverInventedRemoteHermes(remoteHermes));

assert.strictEqual(Lattice.parseHostname("mikesai6\n"), "mikesai6");
assert.strictEqual(Lattice.parseHostname("localhost"), "");
assert.strictEqual(Lattice.parseUname("Linux 6.12.0\n"), "Linux 6.12.0");
const load = Lattice.parseLoadavg("1.50 0.90 0.40 2/100 9");
assert.strictEqual(load.ok, true);
assert.strictEqual(load.one, 1.5);
assert.ok(Lattice.parseUptimeLoad(" 12:01:00 up 3 days, load average: 0.20, 0.10, 0.05").ok);

const arrayCfg = Lattice.parseConfig(JSON.stringify([
  { id: "mikesai1", label: "mikesai1", host: "mikesai1.local" },
  { id: "lab-edge", host: "lab-edge.lan" }
]));
assert.strictEqual(arrayCfg.ok, true);
assert.strictEqual(arrayCfg.probe, false, "probes default off");
assert.strictEqual(arrayCfg.nodes.length, 2);

const objectCfg = Lattice.parseConfig(JSON.stringify({
  probe: true,
  probeMethod: "ssh",
  nodes: [
    { id: "mikesai1", label: "mikesai1", host: "mikesai1.local" },
    { id: "mikesai1", label: "dup", host: "dup" }
  ]
}));
assert.strictEqual(objectCfg.probe, true);
assert.strictEqual(objectCfg.probeMethod, "ssh");
assert.strictEqual(objectCfg.nodes.length, 1, "duplicate ids collapse");

const badJson = Lattice.parseConfig("{nope");
assert.strictEqual(badJson.ok, false);
assert.ok(badJson.error.indexOf("JSON") !== -1);

const envJson = Lattice.parseEnvFleet(JSON.stringify([
  { id: "yard", label: "yard-core", host: "yard.lan" }
]));
assert.strictEqual(envJson.source, "env");
assert.strictEqual(envJson.nodes[0].id, "yard");

const envCsv = Lattice.parseEnvFleet("alpha.local, bravo.lan");
assert.strictEqual(envCsv.nodes.length, 2);
assert.strictEqual(envCsv.source, "env");

const firstEnv = Lattice.firstEnvFleet({ SMF_FLEET: "edge-one" });
assert.strictEqual(firstEnv.nodes[0].id, "edge-one");

const configured = Lattice.buildFleet({
  now: now,
  localFacts: localFacts(),
  config: objectCfg
});
assert.strictEqual(configured.peerSource, "config");
assert.strictEqual(configured.probesEnabled, true);
assert.strictEqual(configured.mode, "unknown", "probes on with no hits is UNKNOWN, not a green fleet");
assert.strictEqual(configured.chip, "UNKNOWN");
assert.ok(configured.honesty.indexOf("waiting on opt-in probes") !== -1);
assert.ok(configured.honesty.indexOf("probes off") === -1);
assert.ok(Lattice.fleetHonest(configured));
const cfgPeer = configured.nodes.find(function(n) { return n.id === "mikesai1"; });
assert.ok(cfgPeer);
assert.strictEqual(cfgPeer.chip, "UNKNOWN");
assert.notStrictEqual(cfgPeer.reachable, true);
assert.ok(cfgPeer.status.indexOf("UNKNOWN") !== -1);
assert.ok(Lattice.neverPretendOnline(cfgPeer));
assert.strictEqual(Lattice.honestChip(cfgPeer), "UNKNOWN");

const noProbe = Lattice.buildFleet({
  now: now,
  localFacts: localFacts(),
  config: arrayCfg
});
assert.strictEqual(noProbe.mode, "unknown");
assert.strictEqual(noProbe.chip, "UNKNOWN");
assert.ok(noProbe.honesty.indexOf("probes off") !== -1);
noProbe.nodes.filter(function(n) { return n.role === "peer"; }).forEach(function(node) {
  assert.strictEqual(node.chip, "UNKNOWN");
  assert.ok(node.status.indexOf("CONFIGURED") !== -1);
  assert.ok(Lattice.neverPretendOnline(node));
  assert.strictEqual(Lattice.honestChip(node), "UNKNOWN");
});
assert.ok(Lattice.fleetHonest(noProbe));
assert.ok(noProbe.edges.every(function(edge) { return edge.kind !== "live"; }));

const probed = Lattice.buildFleet({
  now: now,
  localFacts: localFacts(),
  config: objectCfg,
  probes: {
    mikesai1: { ok: true, method: "ssh", at: now }
  }
});
const livePeer = probed.nodes.find(function(n) { return n.id === "mikesai1"; });
assert.strictEqual(livePeer.chip, "LIVE");
assert.strictEqual(livePeer.reachable, true);
assert.strictEqual(probed.mode, "live");
assert.ok(probed.anyReachable);

const failedProbe = Lattice.applyProbe(cfgPeer, { ok: false, method: "ping", error: "1 timeout", at: now }, now, 300000);
assert.strictEqual(failedProbe.chip, "ERR");
assert.strictEqual(failedProbe.reachable, false);

const staleProbe = Lattice.applyProbe(cfgPeer, { ok: true, method: "ping", at: now - 400000 }, now, 300000);
assert.strictEqual(staleProbe.chip, "STALE");
assert.notStrictEqual(staleProbe.reachable, true);

const demoImmune = Lattice.applyProbe(
  Lattice.peerNode({ id: "lab-edge", label: "lab-edge", host: "lab-edge.lan", source: "demo" }),
  { ok: true, method: "ping", at: now },
  now,
  300000
);
assert.strictEqual(demoImmune.chip, "DEMO", "a successful probe never promotes a DEMO peer");
assert.notStrictEqual(demoImmune.reachable, true);

const broken = Lattice.buildFleet({
  now: now,
  localFacts: localFacts(),
  config: badJson
});
assert.strictEqual(broken.mode, "err");
assert.strictEqual(broken.chip, "ERR");
assert.ok(broken.nodes.some(function(n) { return n.chip === "DEMO"; }));
assert.ok(broken.honesty.indexOf("DEMO peers") !== -1);

const leakedProbes = Lattice.buildFleet({
  now: now,
  localFacts: localFacts(),
  forceDemo: true,
  config: objectCfg,
  probes: { mikesai1: { ok: true, method: "ssh", at: now } }
});
assert.strictEqual(leakedProbes.mode, "demo");
assert.strictEqual(leakedProbes.chip, "DEMO");
assert.ok(Lattice.fleetHonest(leakedProbes));
leakedProbes.nodes.filter(function(n) { return n.role === "peer"; }).forEach(function(node) {
  assert.strictEqual(node.chip, "DEMO");
  assert.notStrictEqual(node.reachable, true);
  assert.ok(Lattice.neverPretendOnline(node));
});

const forced = Lattice.buildFleet({
  now: now,
  localFacts: localFacts(),
  config: arrayCfg,
  forceDemo: true
});
assert.strictEqual(forced.mode, "demo");
assert.ok(Lattice.fleetHonest(forced));
assert.ok(Lattice.fleetHonest(empty));
assert.ok(Lattice.fleetHonest(probed));
assert.strictEqual(Lattice.chipColor(Lattice.honestChip({ demo: true, chip: "LIVE", presence: "live", reachable: true })), "#7DD3FC");
assert.strictEqual(Lattice.parsePayload('{"demo":true}').forceDemo, true);
assert.strictEqual(Lattice.parsePayload("not-json").forceDemo, false);
assert.strictEqual(Lattice.parsePayload('{"selected":"mikesai1"}').selected, "mikesai1");

assert.strictEqual(Lattice.probeArgv("mikesai1.local", "ping").join(" "), "ping -c1 -W1 mikesai1.local");
assert.strictEqual(
  Lattice.probeArgv("mikesai6", "ssh").slice(0, 4).join(" "),
  "ssh -oBatchMode=yes -oConnectTimeout=1 -oStrictHostKeyChecking=no"
);
assert.strictEqual(Lattice.probeArgv("", "ping").length, 0);

const queue = Lattice.probeQueue(configured.nodes, true, "ping");
assert.ok(queue.every(function(item) { return item.id !== "local"; }));
assert.strictEqual(Lattice.probeQueue(liveLocal.nodes, true, "ping").length, 0, "DEMO peers are never probed");
assert.strictEqual(Lattice.shouldProbe(local, true), false);

const hex = Lattice.hexPoints(0, 0, 10, 0);
assert.strictEqual(hex.length, 6);
const laid = Lattice.layoutNodes(liveLocal.nodes, 1200, 800, 0.4);
assert.strictEqual(laid.length, liveLocal.nodes.length);
const laidLocal = laid.find(function(n) { return n.role === "local"; });
assert.ok(laidLocal.scale > 1, "local node is larger");
assert.ok(laid.every(function(n) {
  return typeof n.nx === "number" && typeof n.ny === "number";
}));

assert.ok(Lattice.edgesFor(noProbe.nodes).every(function(edge) {
  return edge.kind !== "live";
}), "no-probe edges are not live/online");
assert.ok(Lattice.edgesFor(liveLocal.nodes).every(function(edge) {
  return edge.kind === "demo";
}));

assert.strictEqual(Lattice.modeLabel("demo"), "DEMO");
assert.strictEqual(Lattice.modeLabel("live"), "LIVE");
assert.strictEqual(Lattice.modeLabel("unknown"), "UNKNOWN");
assert.strictEqual(Lattice.modeLabel("err"), "ERR");
assert.strictEqual(Lattice.modeLabel("stale"), "STALE");
assert.strictEqual(Lattice.chipColor("LIVE"), "#3DDC97");
assert.notStrictEqual(Lattice.chipColor("DEMO"), "#3DDC97");
assert.strictEqual(Lattice.relativeTime(now, now), "just now");
assert.strictEqual(Lattice.relativeTime(now - 15000, now), "15s ago");
assert.strictEqual(Lattice.wrapIndex(0, 5, -1), 4);
assert.ok(Lattice.configPath("/home/ada").indexOf("/.config/smf-fleet-lattice/fleet.json") !== -1);

const overlay = fs.readFileSync(path.join(__dirname, "..", "Overlay.qml"), "utf8");
assert.ok(overlay.includes("function open(payloadJson)"));
assert.ok(overlay.includes("function close()"));
assert.ok(overlay.includes("WlrLayershell.namespace: \"smf-fleet-lattice\""));
assert.ok(overlay.includes("Qt.Key_Escape"));
assert.ok(overlay.includes("fleet.json"));
assert.ok(!overlay.includes("omarchy.fleet"));
assert.ok(!overlay.includes("online by default"));

const bar = fs.readFileSync(path.join(__dirname, "..", "BarWidget.qml"), "utf8");
assert.ok(bar.includes("moduleName: \"smf.fleet-lattice\""));
assert.ok(bar.includes("omarchy-shell shell toggle smf.fleet-lattice '{}'"));

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
assert.strictEqual(manifest.id, "smf.fleet-lattice");
assert.ok(!String(manifest.id).startsWith("omarchy."));
assert.deepStrictEqual(manifest.kinds, ["overlay", "bar-widget"]);
assert.strictEqual(manifest.entryPoints.overlay, "Overlay.qml");
assert.strictEqual(manifest.entryPoints.barWidget, "BarWidget.qml");
assert.strictEqual(manifest.keepLoaded, true);
assert.strictEqual(manifest.author, "SMF Works");
assert.strictEqual(manifest.license, "MIT");

const files = [
  "Overlay.qml",
  "BarWidget.qml",
  "LatticeLogic.js",
  "manifest.json",
  "fleet.example.json",
  "LICENSE",
  "README.md",
  "preview/index.html"
];
files.forEach(function(rel) {
  const full = path.join(__dirname, "..", rel);
  assert.ok(fs.existsSync(full), rel + " exists");
  assert.ok(!fs.lstatSync(full).isSymbolicLink(), rel + " is not a symlink");
});

const example = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fleet.example.json"), "utf8"));
assert.strictEqual(example.probe, false);
assert.ok(Array.isArray(example.nodes));

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
assert.ok(readme.includes("omarchy plugin add https://github.com/smfworks/omarchy-fleet-lattice.git --enable"));
assert.ok(readme.includes("omarchy-shell shell summon smf.fleet-lattice '{}'"));
assert.ok(readme.includes("unsandboxed"));
assert.ok(readme.includes("DEMO"));
assert.ok(readme.includes("LIVE"));
assert.ok(readme.includes("UNKNOWN"));
assert.ok(readme.includes("probe"));
assert.ok(readme.includes("fleet.json"));
assert.ok(readme.includes("omarchy-orbit-dock"));
assert.ok(readme.includes("omarchy-aegis-gate"));
assert.ok(readme.includes("omarchy-ghost-trace"));
assert.ok(readme.includes("runner-up") || readme.includes("runners-up") || readme.includes("shortlist"));

assert.ok(!src.includes("pgrep"));
assert.ok(!src.includes("online: true"));

console.log("ok - LatticeLogic helpers");
