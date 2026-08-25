import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';

// Da "type": "module" aktiv ist, müssen wir __dirname manuell nachbauen
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let flaskProcess;

function startBackend() {
  if (app.isPackaged) {
    let backendExecutable;

    if (process.platform === 'win32') {
      backendExecutable = path.join(process.resourcesPath, 'flask_backend', 'flask_backend.exe');
    } else {
      backendExecutable = path.join(process.resourcesPath, 'flask_backend', 'flask_backend');
    }

    flaskProcess = execFile(backendExecutable, (error) => {
      if (error) console.error('Flask Fehler:', error);
    });
  } else {
    // Entwicklung: Startet dein Python-Backend lokal
    flaskProcess = spawn('python', [path.join(__dirname, 'backend', 'app.py')]);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    // Pfad angepasst an den neuen React Router v8 SPA-Build-Ordner!
    mainWindow.loadFile(path.join(__dirname, 'build', 'client', 'index.html'));
  } else {
    // Während der Entwicklung läuft Vite standardmäßig auf Port 5173
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (flaskProcess) flaskProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
