const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { createAuthStore, SESSION_LIFETIME_MS } = require("./auth");
const { createPreferencesStore, DEFAULT_PREFERENCES } = require("./preferences");

const root = path.resolve(__dirname, "..");
const publicDirectory = path.join(root, "public");
const dataDirectory = process.env.SAFEROUTE_DATA_DIR
  ? path.resolve(process.env.SAFEROUTE_DATA_DIR)
  : path.join(root, "data");
const auth = createAuthStore(dataDirectory);
const preferences = createPreferencesStore(dataDirectory);
const executable = process.env.SAFEROUTE_BIN
  ? path.resolve(process.env.SAFEROUTE_BIN)
  : path.join(
    root,
    "build",
    process.platform === "win32" ? "saferoute.exe" : "saferoute"
  );
const portWasConfigured = process.env.PORT !== undefined;
const port = Number.parseInt(process.env.PORT || "3000", 10);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
if (!fs.existsSync(executable)) {
  throw new Error("C backend not found. Run `npm run build` before starting the server.");
}

const backend = spawn(executable, [], { stdio: ["pipe", "pipe", "inherit"] });
const backendLines = readline.createInterface({ input: backend.stdout });
let pendingResponse = null;
let commandQueue = Promise.resolve();
const authAttempts = new Map();

backendLines.on("line", (line) => {
  if (!pendingResponse) {
    console.error(`Unexpected C backend output: ${line}`);
    return;
  }

  const resolve = pendingResponse;
  pendingResponse = null;
  try {
    resolve(null, JSON.parse(line));
  } catch (error) {
    resolve(error);
  }
});

backend.on("error", (error) => {
  if (pendingResponse) {
    const reject = pendingResponse;
    pendingResponse = null;
    reject(error);
  }
});

backend.on("exit", (code, signal) => {
  if (pendingResponse) {
    const reject = pendingResponse;
    pendingResponse = null;
    reject(new Error(`C backend stopped (code ${code}, signal ${signal}).`));
  }
});

function runCommand(command) {
  const response = commandQueue.then(
    () =>
      new Promise((resolve, reject) => {
        if (backend.exitCode !== null || backend.killed) {
          reject(new Error("C backend is not running."));
          return;
        }

        pendingResponse = (error, value) => (error ? reject(error) : resolve(value));
        backend.stdin.write(`${command}\n`, (error) => {
          if (error && pendingResponse) {
            pendingResponse = null;
            reject(error);
          }
        });
      })
  );
  commandQueue = response.catch(() => {});
  return response;
}

function sendJson(response, statusCode, value)
{
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function getSessionToken(request) {
  const cookieHeader = request.headers.cookie || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("saferoute_session="));
  const token = cookie ? cookie.slice("saferoute_session=".length) : "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function allowAuthAttempt(request) {
  const now = Date.now();
  const address = request.socket.remoteAddress || "unknown";
  const recentAttempts = (authAttempts.get(address) || [])
    .filter((timestamp) => now - timestamp < 15 * 60 * 1000);
  if (recentAttempts.length >= 15) {
    authAttempts.set(address, recentAttempts);
    return false;
  }
  recentAttempts.push(now);
  authAttempts.set(address, recentAttempts);
  return true;
}

function sessionFor(request) {
  return auth.getSession(getSessionToken(request));
}

function setSessionCookie(response, token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `saferoute_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function originIsAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function validateCredentials(body, includeName) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Provide account details as a JSON object.";
  }
  if (typeof body.email !== "string" || body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return "Enter a valid email address.";
  }
  if (typeof body.password !== "string" ||
      body.password.length < 10 || body.password.length > 128) {
    return "Password must be between 10 and 128 characters.";
  }
  if (includeName &&
      (typeof body.name !== "string" || body.name.trim().length < 2 ||
       body.name.trim().length > 48)) {
    return "Name must be between 2 and 48 characters.";
  }
  return null;
}

function validatePreferences(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Preferences must be sent as a JSON object." };
  }
  const allowed = Object.keys(DEFAULT_PREFERENCES);
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    return { error: "Unknown preference." };
  }
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "appearance" && ["light", "dark"].includes(value)) patch[key] = value;
    else if (key === "mapView" && ["network", "city"].includes(value)) patch[key] = value;
    else if (["showHospitals", "showRoads", "notifyIncidents"].includes(key) &&
             typeof value === "boolean") patch[key] = value;
    else if (key === "facilityType" &&
             ["hospital", "police", "fire"].includes(value)) patch[key] = value;
    else if (key === "routePreference" &&
             ["fastest", "shortest"].includes(value)) patch[key] = value;
    else if (key === "emergencyPriority" &&
             ["standard", "critical"].includes(value)) patch[key] = value;
    else return { error: `Invalid value for ${key}.` };
  }
  return { patch };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/session") {
    const session = sessionFor(request);
    sendJson(response, 200, {
      authenticated: Boolean(session),
      user: session ? session.account : null
    });
    return;
  }

  if (["POST", "PATCH"].includes(request.method) && !originIsAllowed(request)) {
    sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
    return;
  }

  if (request.method === "POST" &&
      (pathname === "/api/auth/signup" || pathname === "/api/auth/login")) {
    if (!allowAuthAttempt(request)) {
      sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
      return;
    }
    const body = await readJson(request);
    const isSignup = pathname.endsWith("/signup");
    const validationError = validateCredentials(body, isSignup);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const credentials = {
      email: body.email.trim().toLowerCase(),
      password: body.password
    };
    const account = isSignup
      ? await auth.createAccount({ ...credentials, name: body.name.trim() })
      : await auth.authenticate(credentials);
    const session = auth.createSession(account);
    setSessionCookie(
      response,
      session.token,
      Math.floor(SESSION_LIFETIME_MS / 1000)
    );
    sendJson(response, isSignup ? 201 : 200, { authenticated: true, user: account });
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    auth.deleteSession(getSessionToken(request));
    setSessionCookie(response, "", 0);
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (pathname === "/api/profile" && request.method === "GET") {
    const session = sessionFor(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to view your profile." });
      return;
    }
    sendJson(response, 200, { user: session.account });
    return;
  }

  if (pathname === "/api/profile" && request.method === "PATCH") {
    const session = sessionFor(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to edit your profile." });
      return;
    }
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !["name", "email"].includes(key)) ||
        typeof body.name !== "string" || body.name.trim().length < 2 ||
        body.name.trim().length > 48 || typeof body.email !== "string" ||
        body.email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      sendJson(response, 400, { error: "Provide a valid name and email address." });
      return;
    }
    const user = await auth.updateAccount(session.account.id, {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase()
    });
    session.account = user;
    sendJson(response, 200, { user });
    return;
  }

  if (pathname === "/api/preferences" &&
      (request.method === "GET" || request.method === "PATCH")) {
    const session = sessionFor(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to access your preferences." });
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, { preferences: await preferences.get(session.account.id) });
      return;
    }
    const body = await readJson(request);
    const result = validatePreferences(body);
    if (result.error) {
      sendJson(response, 400, { error: result.error });
      return;
    }
    sendJson(response, 200, {
      preferences: await preferences.update(session.account.id, result.patch)
    });
    return;
  }

  if (pathname.startsWith("/api/") && pathname !== "/api/session") {
    if (!sessionFor(request)) {
      sendJson(response, 401, { error: "Sign in to use emergency dispatch." });
      return;
    }
  }

  if (request.method === "GET" && pathname === "/api/map") {
    sendJson(response, 200, await runCommand("MAP"));
    return;
  }

  if (request.method === "POST" && pathname === "/api/route") {
    const body = await readJson(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !Number.isInteger(body.source) ||
      body.source < 0 ||
      body.source >= 32
    ) {
      sendJson(response, 400, { error: "Source and destination must be valid node IDs." });
      return;
    }

    if (body.preference !== undefined &&
        !["fastest", "shortest"].includes(body.preference)) {
      sendJson(response, 400, { error: "Route preference must be fastest or shortest." });
      return;
    }
    if (body.priority !== undefined &&
        !["standard", "critical"].includes(body.priority)) {
      sendJson(response, 400, { error: "Emergency priority must be standard or critical." });
      return;
    }
    if (body.mode !== undefined &&
        !["standard", "ambulance"].includes(body.mode)) {
      sendJson(response, 400, { error: "Routing mode must be standard or ambulance." });
      return;
    }
    const preference = body.preference === "shortest" ? "SHORTEST" : "FASTEST";
    const priority = body.priority === "critical" ? "CRITICAL" : "STANDARD";
    const mode = body.mode === "ambulance" ? "AMBULANCE" : "STANDARD";
    let command;
    if (body.nearestFacility !== undefined) {
      if (!["hospital", "police", "fire"].includes(body.nearestFacility)) {
        sendJson(response, 400, { error: "Select a supported facility type." });
        return;
      }
      if (body.nearestFacility !== "hospital") {
        sendJson(response, 422, {
          error: "Police and fire station locations are not included in the verified modeled network."
        });
        return;
      }
      command = `NEAREST ${body.source} ${body.nearestFacility.toUpperCase()} ${preference} ${priority} ${mode}`;
    } else {
      if (!Number.isInteger(body.destination) || body.destination < 0 ||
          body.destination >= 32) {
        sendJson(response, 400, { error: "Source and destination must be valid node IDs." });
        return;
      }
      command = `ROUTES ${body.source} ${body.destination} ${preference} ${priority} ${mode}`;
    }

    const result = await runCommand(command);
    if (result.type === "error") {
      sendJson(response, 400, { error: result.message });
      return;
    }
    sendJson(response, 200, result);
    return;
  }

  const incidentMatch = pathname.match(/^\/api\/roads\/([A-Za-z0-9]+)\/incident$/);
  if (request.method === "POST" && incidentMatch) {
    const body = await readJson(request);
    const incidents = {
      normal: "NORMAL",
      blocked: "BLOCKED",
      accident: "ACCIDENT",
      congestion: "CONGESTION"
    };
    if (!body || typeof body.incident !== "string" ||
        !Object.prototype.hasOwnProperty.call(incidents, body.incident)) {
      sendJson(response, 400, { error: "Select a valid simulated incident." });
      return;
    }
    const result = await runCommand(`INCIDENT ${incidentMatch[1]} ${incidents[body.incident]}`);
    if (result.type === "error") {
      sendJson(response, 404, { error: result.message });
      return;
    }
    sendJson(response, 200, result);
    return;
  }

  const roadMatch = pathname.match(/^\/api\/roads\/([A-Za-z0-9]+)\/(block|open)$/);
  if (request.method === "POST" && roadMatch) {
    const incident = roadMatch[2] === "block" ? "BLOCKED" : "NORMAL";
    const result = await runCommand(`INCIDENT ${roadMatch[1]} ${incident}`);
    if (result.type === "error") {
      sendJson(response, 404, { error: result.message });
      return;
    }
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found." });
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }

  const filePath = path.resolve(publicDirectory, `.${decodedPath}`);
  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, error.code === "ENOENT" ? 404 : 500, {
        error: error.code === "ENOENT" ? "File not found." : "Unable to read requested file."
      });
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://unpkg.com; " +
    "style-src 'self' https://unpkg.com 'unsafe-inline'; " +
    "img-src 'self' data: https://*.tile.openstreetmap.org; " +
    "connect-src 'self'; font-src 'self' data:; object-src 'none'; " +
    "base-uri 'self'; frame-ancestors 'none'"
  );
  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
    if (request.method === "GET" && pathname === "/") {
      if (sessionFor(request)) {
        response.writeHead(302, { Location: "/app" });
        response.end();
      } else {
        serveStatic(response, "/index.html");
      }
      return;
    }
    if (request.method === "GET" && pathname === "/app") {
      if (!sessionFor(request)) {
        response.writeHead(302, { Location: "/" });
        response.end();
      } else {
        serveStatic(response, "/map.html");
      }
      return;
    }
    if (request.method === "GET" && pathname === "/map.html") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Only GET is supported for static files." });
      return;
    }
    serveStatic(response, pathname);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : "Internal server error."
      });
    }
  }
});

function listenOnAvailablePort(candidate) {
  const handleListenError = (error) => {
    server.removeListener("error", handleListenError);
    if (error.code === "EADDRINUSE" && !portWasConfigured && candidate < 3010) {
      console.warn(`Port ${candidate} is busy; trying ${candidate + 1}.`);
      listenOnAvailablePort(candidate + 1);
      return;
    }

    console.error(`Unable to start SafeRoute on port ${candidate}: ${error.message}`);
    backend.stdin.end("QUIT\n");
    process.exitCode = 1;
  };

  server.once("error", handleListenError);
  server.listen(candidate, "0.0.0.0", () => {
    server.removeListener("error", handleListenError);
    console.log(`SafeRoute is available at http://127.0.0.1:${candidate}`);
  });
}

listenOnAvailablePort(port);

function shutdown() {
  server.close();
  backend.stdin.end("QUIT\n");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
