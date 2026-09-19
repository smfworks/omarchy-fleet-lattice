import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import "LatticeLogic.js" as Lattice

Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null
  property var pluginRegistry: null

  property bool opened: false
  property bool forceDemo: false
  property bool hermesHome: false
  property real driftPhase: 0
  property string hostnameText: ""
  property string unameText: ""
  property string loadavgText: ""
  property string configText: ""
  property string configError: ""
  property bool configMissing: true
  property string envFleetText: ""
  property string selectedId: "local"
  property var probeMap: ({})
  property var fleet: Lattice.emptyFleet()
  property var displayNodes: []
  property var displayEdges: []

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color accent: Color.accent
  property color scrim: Color.menu.scrim
  property color border: Color.menu.border
  property string fontFamily: Style.font.menuFamily || Style.font.family
  readonly property string pluginId: (root.manifest && root.manifest.id) || "smf.fleet-lattice"
  readonly property string homeDir: Quickshell.env("HOME")
  readonly property string mode: root.fleet && root.fleet.mode ? root.fleet.mode : "demo"
  readonly property string modeChip: Lattice.modeLabel(root.mode)
  readonly property string honestyText: (root.fleet && root.fleet.honesty) || "DEMO fleet"
  readonly property var selectedNode: Lattice.findNode(root.fleet.nodes, root.selectedId)

  function open(payloadJson) {
    var payload = Lattice.parsePayload(payloadJson)
    root.forceDemo = payload.forceDemo === true
    if (payload.selected) root.selectedId = payload.selected
    root.opened = true
    root.refreshFacts()
    root.rebuildFleet()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide(root.pluginId)
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function nodeCount() {
    return String(Lattice.countNodes(root.fleet))
  }

  function localFacts() {
    return {
      hostname: root.hostnameText,
      uname: root.unameText,
      loadavg: root.loadavgText,
      hermesHome: root.hermesHome
    }
  }

  function rebuildFleet() {
    var cfg = root.configText ? Lattice.parseConfig(root.configText, "config") : Lattice.emptyConfig()
    if (root.configError && !root.configText && !root.configMissing) {
      cfg = Lattice.emptyConfig()
      cfg.ok = false
      cfg.error = root.configError
      cfg.source = "config"
    }
    var env = Lattice.parseEnvFleet(root.envFleetText)
    root.fleet = Lattice.buildFleet({
      now: Date.now(),
      localFacts: root.localFacts(),
      config: cfg,
      env: env,
      probes: root.probeMap,
      forceDemo: root.forceDemo,
      selectedId: root.selectedId
    })
    if (!Lattice.findNode(root.fleet.nodes, root.selectedId))
      root.selectedId = "local"
    root.relayout()
    field.requestPaint()
    root.maybeStartProbes()
  }

  function relayout() {
    var w = field.width || panel.width || 1
    var h = field.height || panel.height || 1
    root.displayNodes = Lattice.layoutNodes(root.fleet.nodes, w, h, root.driftPhase)
    root.displayEdges = root.fleet.edges || []
  }

  function refreshFacts() {
    root.envFleetText = Quickshell.env("SMF_FLEET_LATTICE") || Quickshell.env("SMF_FLEET") || ""
    if (!hostnameProc.running) hostnameProc.running = true
    if (!unameProc.running) unameProc.running = true
    if (!loadProc.running) loadProc.running = true
    if (!configStatProc.running) configStatProc.running = true
    try { configView.reload() } catch (e) {}
  }

  function selectId(id) {
    if (!Lattice.findNode(root.fleet.nodes, id)) return
    root.selectedId = id
    root.rebuildFleet()
  }

  function selectDelta(delta) {
    var nodes = root.fleet.nodes || []
    if (!nodes.length) return
    var idx = 0
    var i
    for (i = 0; i < nodes.length; i++) {
      if (String(nodes[i].id) === String(root.selectedId)) { idx = i; break }
    }
    var next = nodes[Lattice.wrapIndex(idx, nodes.length, delta)]
    if (next) root.selectId(next.id)
  }

  function maybeStartProbes() {
    if (!root.opened || !root.fleet.probesEnabled) return
    if (probeProc.running) return
    var queue = Lattice.probeQueue(root.fleet.nodes, root.fleet.probesEnabled, root.fleet.probeMethod)
    if (!queue.length) return
    var now = Date.now()
    var next = null
    var i
    for (i = 0; i < queue.length; i++) {
      var item = queue[i]
      var node = Lattice.findNode(root.fleet.nodes, item.id)
      var hit = Lattice.lookupProbe(root.probeMap, node || item)
      if (Lattice.probeDue(node || item, hit, now, root.fleet.staleAfterMs)) {
        next = item
        break
      }
    }
    if (!next) return
    probeProc.command = next.argv
    probeProc.nodeId = next.id
    probeProc.host = next.host || ""
    probeProc.method = next.method
    probeProc.running = true
    root.ingestProbe(next.id, next.method, null, "", true, next.host)
  }

  function expireHungProbes() {
    if (!root.fleet.probesEnabled) return
    var now = Date.now()
    var changed = false
    var next = {}
    var key
    for (key in root.probeMap) next[key] = root.probeMap[key]
    for (key in next) {
      var hit = next[key]
      if (!hit || hit.pending !== true || hit.ok === true || hit.ok === false) continue
      if (now - Number(hit.at || 0) <= Lattice.PROBE_TIMEOUT_MS) continue
      next[key] = {
        ok: false,
        pending: false,
        method: hit.method || "ping",
        at: now,
        host: hit.host || "",
        error: "probe timed out · no result"
      }
      changed = true
    }
    if (changed) {
      root.probeMap = next
      if (probeProc.running && next[probeProc.nodeId] && next[probeProc.nodeId].ok === false)
        probeProc.running = false
      root.rebuildFleet()
    }
  }

  function ingestProbe(id, method, ok, errorText, pending, host) {
    if (!id) return
    var next = {}
    var key
    for (key in root.probeMap) next[key] = root.probeMap[key]
    var row = {
      method: method || "ping",
      at: Date.now(),
      error: errorText || "",
      host: host || ""
    }
    if (pending === true) {
      row.pending = true
    } else {
      row.ok = ok === true
      row.pending = false
      if (ok !== true) row.error = Lattice.classifyProbeFailure(errorText)
    }
    next[Lattice.probeKey(id, row.host)] = row
    next[id] = row
    root.probeMap = next
    root.rebuildFleet()
  }

  function cssColor(c, a) {
    if (typeof c === "string") {
      var hex = c.replace("#", "")
      if (hex.length === 6) {
        return "rgba("
          + parseInt(hex.slice(0, 2), 16) + ","
          + parseInt(hex.slice(2, 4), 16) + ","
          + parseInt(hex.slice(4, 6), 16) + ","
          + a + ")"
      }
    }
    return "rgba("
      + Math.round(c.r * 255) + ","
      + Math.round(c.g * 255) + ","
      + Math.round(c.b * 255) + ","
      + a + ")"
  }

  function nodeById(id) {
    var list = root.displayNodes || []
    var i
    for (i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i]
    }
    return null
  }

  function paintField(canvas) {
    var ctx = canvas.getContext("2d")
    if (!ctx) return
    var w = canvas.width
    var h = canvas.height
    ctx.reset()
    ctx.clearRect(0, 0, w, h)
    if (w < 8 || h < 8) return

    var i
    var j
    var phase = root.driftPhase
    ctx.lineWidth = 1
    ctx.strokeStyle = cssColor(root.accent, 0.12)
    var hexR = Math.min(w, h) * 0.055
    for (i = -2; i < 16; i++) {
      for (j = -2; j < 14; j++) {
        var hx = (j % 2 === 0 ? 0 : hexR * 0.86) + i * hexR * 1.72
        var hy = j * hexR * 1.5 + (phase * 10) % (hexR * 1.5)
        var pts = Lattice.hexPoints(hx, hy, hexR * 0.92, Math.PI / 6)
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (var p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y)
        ctx.closePath()
        ctx.stroke()
      }
    }

    var edges = root.displayEdges || []
    for (i = 0; i < edges.length; i++) {
      var edge = edges[i]
      var from = root.nodeById(edge.from)
      var to = root.nodeById(edge.to)
      if (!from || !to) continue
      var tone = edge.kind === "live" ? Lattice.chipColor("LIVE") : Lattice.chipColor(edge.chip)
      var stroke = Lattice.edgeStroke(edge.kind)
      ctx.beginPath()
      ctx.lineWidth = stroke.width
      ctx.strokeStyle = cssColor(tone, stroke.alpha)
      if (stroke.dash)
        ctx.setLineDash([7, 9])
      else
        ctx.setLineDash([])
      ctx.moveTo(from.px, from.py)
      ctx.lineTo(to.px, to.py)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  Process {
    id: configStatProc
    running: false
    command: ["bash", "-c", "p=\"$1\"; if [ ! -e \"$p\" ]; then echo MISSING; elif [ ! -r \"$p\" ]; then echo UNREADABLE; else echo OK; fi", "stat", Lattice.configPath(root.homeDir)]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var flag = String(text || "").replace(/^\s+|\s+$/g, "")
        if (flag === "MISSING") {
          root.configText = ""
          root.configError = ""
          root.configMissing = true
        } else if (flag === "UNREADABLE") {
          root.configText = ""
          root.configError = "fleet.json exists but is unreadable"
          root.configMissing = false
        }
        if (root.opened || flag === "UNREADABLE" || flag === "MISSING")
          root.rebuildFleet()
      }
    }
  }

  FileView {
    id: configView
    // ~/.config/smf-fleet-lattice/fleet.json — missing file ships the DEMO lattice
    path: Lattice.configPath(root.homeDir)
    printErrors: false
    onLoaded: {
      root.configText = configView.text()
      root.configError = ""
      root.configMissing = false
      if (root.opened) root.rebuildFleet()
    }
    onLoadFailed: function(error) {
      var classified = Lattice.classifyConfigLoadError(error)
      if (root.configError && !classified.missing) {
        classified = { missing: false, ok: false, error: root.configError }
      }
      root.configText = ""
      if (!root.configError)
        root.configError = classified.error
      if (classified.missing && !root.configError)
        root.configMissing = true
      else if (!classified.missing)
        root.configMissing = false
      if (root.opened) root.rebuildFleet()
    }
  }

  FileView {
    path: Quickshell.env("HOME") + "/.hermes/state.db"
    printErrors: false
    onLoaded: {
      root.hermesHome = true
      if (root.opened) root.rebuildFleet()
    }
    onLoadFailed: {
      hermesDirProc.running = true
    }
  }

  Process {
    id: hermesDirProc
    running: false
    command: ["bash", "-c", "test -d \"$HOME/.hermes\""]
    onExited: {
      root.hermesHome = hermesDirProc.exitCode === 0
      if (root.opened) root.rebuildFleet()
    }
  }

  Process {
    id: hostnameProc
    running: false
    command: ["hostname"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.hostnameText = String(text || "")
        if (root.opened) root.rebuildFleet()
      }
    }
  }

  Process {
    id: unameProc
    running: false
    command: ["uname", "-sr"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.unameText = String(text || "")
        if (root.opened) root.rebuildFleet()
      }
    }
  }

  Process {
    id: loadProc
    running: false
    command: ["bash", "-c", "if test -r /proc/loadavg; then cat /proc/loadavg; else uptime; fi"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.loadavgText = String(text || "")
        if (root.opened) root.rebuildFleet()
      }
    }
  }

  Process {
    id: probeProc
    running: false
    property string nodeId: ""
    property string host: ""
    property string method: "ping"
    onExited: {
      var ok = probeProc.exitCode === 0
      root.ingestProbe(
        probeProc.nodeId,
        probeProc.method,
        ok,
        ok ? "" : "probe exit " + probeProc.exitCode,
        false,
        probeProc.host
      )
      probeProc.nodeId = ""
      probeProc.host = ""
      Qt.callLater(function() { root.maybeStartProbes() })
    }
  }

  NumberAnimation on driftPhase {
    running: root.opened
    from: 0
    to: Math.PI * 2
    duration: 48000
    loops: Animation.Infinite
  }

  Timer {
    interval: 40
    running: root.opened
    repeat: true
    onTriggered: {
      root.relayout()
      field.requestPaint()
    }
  }

  Timer {
    interval: Lattice.POLL_MS
    running: root.opened
    repeat: true
    onTriggered: {
      root.refreshFacts()
      root.expireHungProbes()
      root.maybeStartProbes()
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "smf-fleet-lattice"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    Canvas {
      id: field
      anchors.fill: parent
      renderStrategy: Canvas.Cooperative
      onPaint: root.paintField(field)
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    Item {
      id: keyCatcher
      anchors.fill: parent
      focus: true

      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Escape) {
          root.dismiss()
          event.accepted = true
        } else if (event.key === Qt.Key_Left || event.key === Qt.Key_Up) {
          root.selectDelta(-1)
          event.accepted = true
        } else if (event.key === Qt.Key_Right || event.key === Qt.Key_Down) {
          root.selectDelta(1)
          event.accepted = true
        } else if (event.key === Qt.Key_Home) {
          root.selectId("local")
          event.accepted = true
        }
      }
    }

    Repeater {
      model: root.displayNodes

      Item {
        id: nodeBody
        required property var modelData
        readonly property bool on: String(modelData.id) === String(root.selectedId)
        readonly property real size: Style.space(modelData.role === "local" ? 118 : 86) * Number(modelData.scale || 1)
        readonly property color tone: Lattice.chipColor(Lattice.honestChip(modelData))

        width: nodeBody.size
        height: nodeBody.size + Style.space(28)
        x: Number(modelData.px || 0) - width / 2
        y: Number(modelData.py || 0) - nodeBody.size / 2
        z: nodeBody.on ? 18 : (modelData.role === "local" ? 12 : 8)

        Rectangle {
          id: glow
          width: nodeBody.size
          height: nodeBody.size
          anchors.horizontalCenter: parent.horizontalCenter
          radius: width / 2
          color: Util.alpha(nodeBody.tone, nodeBody.on ? 0.16 : 0.08)
          border.width: nodeBody.on ? 2 : 1
          border.color: Util.alpha(nodeBody.tone, nodeBody.on ? 0.95 : 0.45)
          scale: nodeBody.on ? 1.06 : 1

          Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

          Canvas {
            anchors.fill: parent
            anchors.margins: Style.space(10)
            renderStrategy: Canvas.Cooperative
            onPaint: {
              var ctx = getContext("2d")
              if (!ctx) return
              var w = width
              var h = height
              ctx.reset()
              var pts = Lattice.hexPoints(w / 2, h / 2, Math.min(w, h) * 0.46, Math.PI / 6)
              ctx.beginPath()
              ctx.moveTo(pts[0].x, pts[0].y)
              for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
              ctx.closePath()
              ctx.lineWidth = modelData.role === "local" ? 2.6 : 1.6
              ctx.strokeStyle = root.cssColor(nodeBody.tone, modelData.role === "local" ? 0.95 : 0.7)
              ctx.stroke()
            }
          }

          Text {
            anchors.centerIn: parent
            textFormat: Text.PlainText
            text: String(modelData.chip || "")
            color: nodeBody.tone
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.2
          }
        }

        Text {
          anchors.top: glow.bottom
          anchors.topMargin: Style.space(4)
          anchors.horizontalCenter: parent.horizontalCenter
          width: Style.space(140)
          textFormat: Text.PlainText
          text: String(modelData.label || modelData.id || "")
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: modelData.role === "local"
          horizontalAlignment: Text.AlignHCenter
          elide: Text.ElideRight
        }

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: {
            root.selectId(modelData.id)
          }
        }
      }
    }

    Rectangle {
      id: honesty
      anchors.top: parent.top
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.topMargin: Style.space(22)
      width: honestyRow.implicitWidth + Style.space(28)
      height: Style.space(38)
      radius: height / 2
      color: Util.alpha(root.background, 0.8)
      border.width: 1
      border.color: Util.alpha(Lattice.chipColor(root.modeChip), 0.62)
      z: 30

      Row {
        id: honestyRow
        anchors.centerIn: parent
        spacing: Style.space(10)

        Rectangle {
          width: chipLabel.implicitWidth + Style.space(16)
          height: Style.space(22)
          radius: height / 2
          color: Util.alpha(Lattice.chipColor(root.modeChip), root.mode === "live" ? 0.28 : 0.16)
          border.width: 1
          border.color: Util.alpha(Lattice.chipColor(root.modeChip), 0.75)

          Text {
            id: chipLabel
            anchors.centerIn: parent
            text: root.modeChip
            color: Lattice.chipColor(root.modeChip)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.6
          }
        }

        Text {
          text: root.honestyText
          color: root.foreground
          opacity: 0.68
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          anchors.verticalCenter: parent.verticalCenter
        }
      }
    }

    Rectangle {
      id: rail
      width: Math.min(Style.space(320), panel.width * 0.3)
      height: Math.min(panel.height - Style.space(72), Style.space(560))
      radius: Style.space(22)
      anchors.verticalCenter: parent.verticalCenter
      anchors.right: parent.right
      anchors.rightMargin: Style.space(28)
      color: Util.alpha(root.background, 0.78)
      border.width: 1
      border.color: Util.alpha(root.selectedNode ? Lattice.chipColor(root.selectedNode.chip) : root.accent, 0.45)
      z: 20

      MouseArea { anchors.fill: parent; onClicked: {} }

      Column {
        anchors.fill: parent
        anchors.margins: Style.space(22)
        spacing: Style.space(10)

        Text {
          width: parent.width
          text: "FLEET LATTICE"
          color: root.accent
          opacity: 0.82
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.letterSpacing: 2.4
          font.bold: true
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: String((root.selectedNode && (root.selectedNode.label || root.selectedNode.id)) || "no node")
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.heading
          font.bold: true
          wrapMode: Text.WordWrap
        }

        Rectangle {
          width: railChip.implicitWidth + Style.space(16)
          height: Style.space(24)
          radius: height / 2
          color: Util.alpha(root.selectedNode ? Lattice.chipColor(root.selectedNode.chip) : root.accent, 0.16)
          border.width: 1
          border.color: Util.alpha(root.selectedNode ? Lattice.chipColor(root.selectedNode.chip) : root.accent, 0.7)

          Text {
            id: railChip
            anchors.centerIn: parent
            text: String((root.selectedNode && root.selectedNode.chip) || "UNKNOWN")
            color: root.selectedNode ? Lattice.chipColor(root.selectedNode.chip) : root.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.3
          }
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: "host · " + String((root.selectedNode && root.selectedNode.host) || "—")
          color: root.foreground
          opacity: 0.72
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: String((root.selectedNode && root.selectedNode.status) || "")
          color: root.foreground
          opacity: 0.78
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: String((root.selectedNode && root.selectedNode.detail) || "")
          color: root.foreground
          opacity: 0.58
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          visible: !!(root.selectedNode && root.selectedNode.lastProbeLabel)
          textFormat: Text.PlainText
          text: "last probe · " + String((root.selectedNode && root.selectedNode.lastProbeLabel) || "")
          color: root.foreground
          opacity: 0.5
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Text {
          width: parent.width
          visible: !!(root.selectedNode && root.selectedNode.role === "local" && root.selectedNode.hermes)
          textFormat: Text.PlainText
          text: "hermes · DETECTED — local home only, no remote agent status"
          color: root.foreground
          opacity: 0.5
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          visible: !!(root.selectedNode && root.selectedNode.role === "peer")
          textFormat: Text.PlainText
          text: String((root.selectedNode && root.selectedNode.hermesNote) || Lattice.remoteHermesNote())
          color: root.foreground
          opacity: 0.5
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          text: root.fleet && root.fleet.hint ? root.fleet.hint : ""
          color: root.accent
          opacity: 0.55
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }
      }
    }

    Text {
      anchors.bottom: parent.bottom
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.bottomMargin: Style.space(28)
      z: 30
      text: "ESC close · ← → select node · click a node for detail"
      color: root.foreground
      opacity: 0.48
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.letterSpacing: 1.1
    }
  }

  Component.onCompleted: {
    root.envFleetText = Quickshell.env("SMF_FLEET_LATTICE") || Quickshell.env("SMF_FLEET") || ""
    root.refreshFacts()
    root.rebuildFleet()
  }
}
