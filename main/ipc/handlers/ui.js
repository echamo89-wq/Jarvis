const { ipcMain, Notification, BrowserWindow } = require('electron');

function registerUi() {
  ipcMain.handle('show-notification', async (event, { title, body }) => {
    try {
      const notif = new Notification({ title: title || 'JARVIS', body: body || '' });
      notif.show();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerUi };