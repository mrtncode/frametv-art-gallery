import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import fs from "fs";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

const FRONTEND_PORT = 5174;
const FRONTEND_HOST = "127.0.0.1";

let mainWindow = null;
let pythonProcess = null;
let frontendServer = null;
let isQuitting = false;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

function getBackendPath() {
  const binaryName =
    process.platform === "win32"
      ? "flask_backend.exe"
      : "flask_backend";

  if (isDev) {
    return path.join(
      __dirname,
      "..",
      "build-backend",
      "flask_backend",
      binaryName
    );
  }

  return path.join(
    process.resourcesPath,
    "flask_backend",
    binaryName
  );
}

function startPythonBackend() {
  const backendPath = getBackendPath();

  const dataPath = path.join(
    app.getPath("userData"),
    "data"
  );

  fs.mkdirSync(dataPath, { recursive: true });

  console.log("Starting backend:", backendPath);
  console.log("Backend exists:", fs.existsSync(backendPath));
  console.log("Data path:", dataPath);

  pythonProcess = execFile(
    backendPath,
    ["--upgrade-db"],
    {
      cwd: path.dirname(backendPath),
      env: {
        ...process.env,
        FRAME_TV_DATA: dataPath,
      },
    }
  );

  let stderr = "";

  pythonProcess.stdout?.on("data", (data) => {
    console.log("[Flask]", data.toString().trim());
  });

  pythonProcess.stderr?.on("data", (data) => {
    const message = data.toString();

    stderr += message;

    console.error("[Flask]", message.trim());
  });

  pythonProcess.on("error", (error) => {
    console.error("Backend process error:", error);

    showBackendError(error.message);
  });

  pythonProcess.on("exit", (code, signal) => {
    console.log(
      `Flask backend exited. Code: ${code}, signal: ${signal}`
    );

    if (isQuitting) {
      return;
    }

    if (code !== 0) {
      showBackendError(
        stderr.trim() ||
        `The backend stopped unexpectedly (exit code ${code}).`
      );
    }
  });
}

function showBackendError(message) {
  dialog.showMessageBoxSync({
    type: "error",
    title: "FrameTV Art Gallery – Backend Error",
    message: "The backend could not be started.",
    detail: message,
    buttons: ["OK"],
  });
}

function getFrontendPath() {
  return path.join(__dirname, "build", "client");
}

function createFrontendServer() {
  const frontendPath = getFrontendPath();
  const indexPath = path.join(frontendPath, "index.html");

  console.log("Frontend directory:", frontendPath);
  console.log("Frontend exists:", fs.existsSync(frontendPath));
  console.log("Index exists:", fs.existsSync(indexPath));

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Frontend index.html not found: ${indexPath}`);
  }

  frontendServer = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(
        request.url,
        `http://${FRONTEND_HOST}:${FRONTEND_PORT}`
      );

      let requestPath = decodeURIComponent(requestUrl.pathname);

      if (requestPath === "/") {
        requestPath = "/index.html";
      }

      const relativePath = requestPath.replace(/^\/+/, "");

      const filePath = path.resolve(
        frontendPath,
        relativePath
      );

      const frontendRoot = path.resolve(frontendPath);

      if (
        filePath !== frontendRoot &&
        !filePath.startsWith(`${frontendRoot}${path.sep}`)
      ) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const extension = path.extname(filePath).toLowerCase();
        const contentType =
          MIME_TYPES[extension] ?? "application/octet-stream";

        response.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        });

        fs.createReadStream(filePath).pipe(response);
        return;
      }

      // React Router SPA fallback.
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });

      fs.createReadStream(indexPath).pipe(response);
    } catch (error) {
      console.error("Frontend server error:", error);

      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
      });

      response.end("Internal server error");
    }
  });

  frontendServer.listen(
    FRONTEND_PORT,
    FRONTEND_HOST,
    () => {
      console.log(
        `Frontend server running at http://${FRONTEND_HOST}:${FRONTEND_PORT}`
      );
    }
  );
}

function stopFrontendServer() {
  if (!frontendServer) {
    return;
  }

  frontendServer.close();
  frontendServer = null;
}

function stopPythonBackend() {
  if (!pythonProcess) {
    return;
  }

  pythonProcess.kill();
  pythonProcess = null;
}

async function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "public/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    console.log("Loading Vite development server...");
    await mainWindow.loadURL("http://localhost:5173");
  } else {
    createFrontendServer();

    await mainWindow.loadURL(
      `http://${FRONTEND_HOST}:${FRONTEND_PORT}`
    );
  }

  //#mainWindow.webContents.openDevTools({
  //  mode: "detach",
  //});

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    startPythonBackend();
    await createWindow();
  } catch (error) {
    console.error("Failed to start application:", error);
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopFrontendServer();
  stopPythonBackend();
});

app.on("window-all-closed", () => {
  stopFrontendServer();
  stopPythonBackend();

  if (process.platform !== "darwin") {
    app.quit();
  }
});