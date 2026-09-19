import QtQuick
import qs.Commons
import qs.Ui
import "LatticeLogic.js" as Lattice

BarWidget {
  id: root
  moduleName: "smf.fleet-lattice"

  property int nodeCount: 0
  property string modeChip: "DEMO"
  property string honestyText: "DEMO · overlay not mounted yet"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property color chipTone: Lattice.chipColor(root.modeChip)

  function syncFromShared() {
    var snap = Lattice.readShared()
    root.modeChip = snap.chip || "DEMO"
    root.nodeCount = snap.count || 0
    root.honestyText = snap.honesty || ""
  }

  function summonOverlay() {
    if (!root.bar) return
    root.bar.run("omarchy-shell shell toggle smf.fleet-lattice '{}'")
  }

  Timer {
    interval: 1000
    running: true
    repeat: true
    onTriggered: root.syncFromShared()
  }

  Component.onCompleted: root.syncFromShared()

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.modeChip
    labelVisible: false
    keepSpace: true
    tooltipText: root.nodeCount > 0
      ? ("Fleet Lattice — " + root.modeChip + " · " + root.nodeCount + " nodes · " + root.honestyText)
      : ("Fleet Lattice — " + root.modeChip + " · " + root.honestyText)
    fixedWidth: vertical ? barSize : Style.space(44)
    fixedHeight: vertical ? Style.space(44) : barSize
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.summonOverlay()
    }

    Item {
      anchors.fill: parent
      anchors.margins: Style.spaceReal(5)

      Repeater {
        model: 6
        Rectangle {
          required property int index
          width: Style.space(5)
          height: Style.space(5)
          radius: 1
          color: "transparent"
          border.width: 1
          border.color: Util.alpha(root.chipTone, root.modeChip === "LIVE" ? 0.85 : 0.55)
          anchors.centerIn: parent
          transform: [
            Rotation { origin.x: 2.5; origin.y: 2.5; angle: index * 60 },
            Translate { x: Math.cos(index * Math.PI / 3) * 7; y: Math.sin(index * Math.PI / 3) * 7 }
          ]
        }
      }

      Rectangle {
        anchors.centerIn: parent
        width: Style.space(8)
        height: Style.space(8)
        radius: 2
        color: Util.alpha(root.chipTone, root.modeChip === "LIVE" ? 0.85 : 0.45)
      }

      Text {
        anchors.bottom: parent.bottom
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.modeChip
        color: root.chipTone
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }
  }
}
