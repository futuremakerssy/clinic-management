const { app, BrowserWindow, Menu } = require("electron")
const path = require("node:path")

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: "نظام إدارة العيادة الطبية",
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  // Remove default browser menu bar for sleek native app feel
  Menu.setApplicationMenu(null)

  // Load the production build
  const indexPath = path.join(__dirname, "../dist/index.html")
  mainWindow.loadFile(indexPath)

  // Smooth appearance when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show()
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
