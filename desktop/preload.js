const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  floatClick: () => ipcRenderer.send("float-click"),
  closePanel: () => ipcRenderer.send("close-panel"),
});
