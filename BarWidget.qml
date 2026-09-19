import QtQuick
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "smf.fleet-lattice"

  property int nodeCount: 0
  property string modeChip: "DEMO"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function summonOverlay() {
    if (!root.bar) return
    root.bar.run("omarchy-shell shell toggle smf.fleet-lattice '{}'")
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.nodeCount > 0 ? String(root.nodeCount) : "FL"
    labelVisible: false
    keepSpace: true
    tooltipText: root.nodeCount > 0
      ? ("Fleet Lattice — " + root.nodeCount + " nodes · " + root.modeChip)
      : "Fleet Lattice — summon the fleet hologram"
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
          border.color: Util.alpha(Color.accent, 0.7)
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
        color: Util.alpha(Color.accent, 0.85)
      }

      Text {
        visible: root.nodeCount > 0
        anchors.bottom: parent.bottom
        anchors.horizontalCenter: parent.horizontalCenter
        text: String(root.nodeCount)
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }
  }
}
