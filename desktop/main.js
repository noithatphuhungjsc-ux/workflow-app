/* ================================================================
   ELECTRON MAIN — Desktop floating widget for WorkFlow
   Always on top, system tray, loads the web app
   ================================================================ */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain } = require("electron");
const path = require("path");

const APP_URL = "https://workflow-app-lemon.vercel.app";
let mainWin = null;
let floatWin = null;
let tray = null;

// ── Float Widget Window (always on top) ──
function createFloatWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  floatWin = new BrowserWindow({
    width: 60,
    height: 60,
    x: sw - 80,
    y: sh - 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  floatWin.loadFile(path.join(__dirname, "float.html"));
  floatWin.setVisibleOnAllWorkspaces(true);

  // Make draggable
  floatWin.on("closed", () => { floatWin = null; });
}

// ── Main App Window (sidebar panel) ──
function createMainWindow() {
  if (mainWin) { mainWin.show(); mainWin.focus(); return; }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const panelW = Math.round(sw * 0.25);

  mainWin = new BrowserWindow({
    width: Math.max(panelW, 360),
    height: sh,
    x: sw - Math.max(panelW, 360),
    y: 0,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWin.loadURL(APP_URL);

  mainWin.on("closed", () => { mainWin = null; });
  mainWin.on("blur", () => {
    // Don't auto-hide — user might want it open while working
  });
}

// ── System Tray ──
function createTray() {
  // Use a simple icon (you can replace with a proper .ico/.png later)
  const iconPath = path.join(__dirname, "icon.png");
  try {
    tray = new Tray(iconPath);
  } catch {
    // If no icon, create tray without custom icon
    return;
  }

  tray.setToolTip("WorkFlow - Trợ lý công việc");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mở WorkFlow", click: () => createMainWindow() },
    { label: "Hiện/Ẩn nút nổi", click: () => {
      if (floatWin) { floatWin.isVisible() ? floatWin.hide() : floatWin.show(); }
    }},
    { type: "separator" },
    { label: "Thoát", click: () => app.quit() },
  ]));

  tray.on("click", () => createMainWindow());
}

// ── IPC Handlers ──
ipcMain.on("float-click", () => {
  if (mainWin && mainWin.isVisible()) {
    mainWin.hide();
  } else {
    createMainWindow();
  }
});

ipcMain.on("close-panel", () => {
  if (mainWin) mainWin.hide();
});

// ── App Lifecycle ──
app.whenReady().then(() => {
  createFloatWindow();
  createTray();
});

app.on("window-all-closed", (e) => {
  // Don't quit — keep in tray
  e.preventDefault?.();
});

app.on("activate", () => {
  if (!floatWin) createFloatWindow();
});

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    createMainWindow();
  });
}
