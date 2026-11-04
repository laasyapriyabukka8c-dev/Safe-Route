const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;

function createAuthStore(dataDirectory) {
  const accountsFile = path.join(dataDirectory, "accounts.json");
  const sessions = new Map();
  let accountQueue = Promise.resolve();

  async function loadAccounts() {
    try {
      return JSON.parse(await fs.readFile(accountsFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new Error(`Unable to load account store: ${error.message}`);
    }
  }

  async function saveAccounts(accounts) {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = `${accountsFile}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      await fs.writeFile(temporaryFile, JSON.stringify(accounts, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx"
      });
      await fs.rename(temporaryFile, accountsFile);
    } catch (error) {
      await fs.rm(temporaryFile, { force: true });
      throw error;
    }
  }

  function serializeAccountWrite(operation) {
    const result = accountQueue.then(operation);
    accountQueue = result.catch(() => {});
    return result;
  }

  function publicAccount(account) {
    return { id: account.id, name: account.name, email: account.email };
  }

  async function createAccount({ name, email, password }) {
    return serializeAccountWrite(async () => {
      const accounts = await loadAccounts();
      if (accounts.some((account) => account.email === email)) {
        const error = new Error("An account with this email already exists.");
        error.statusCode = 409;
        throw error;
      }

      const salt = crypto.randomBytes(16);
      const passwordHash = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
      const account = {
        id: crypto.randomUUID(),
        name,
        email,
        salt: salt.toString("hex"),
        passwordHash: passwordHash.toString("hex")
      };
      accounts.push(account);
      await saveAccounts(accounts);
      return publicAccount(account);
    });
  }

  async function authenticate({ email, password }) {
    const accounts = await loadAccounts();
    const account = accounts.find((candidate) => candidate.email === email);
    const salt = account ? Buffer.from(account.salt, "hex") : Buffer.alloc(16);
    const derivedHash = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
    const savedHash = account
      ? Buffer.from(account.passwordHash, "hex")
      : Buffer.alloc(PASSWORD_KEY_LENGTH);

    if (
      !account ||
      savedHash.length !== derivedHash.length ||
      !crypto.timingSafeEqual(savedHash, derivedHash)
    ) {
      const error = new Error("Email or password is incorrect.");
      error.statusCode = 401;
      throw error;
    }

    return publicAccount(account);
  }

  async function updateAccount(accountId, { name, email }) {
    return serializeAccountWrite(async () => {
      const accounts = await loadAccounts();
      const account = accounts.find((candidate) => candidate.id === accountId);
      if (!account) {
        const error = new Error("Account was not found.");
        error.statusCode = 404;
        throw error;
      }

      const emailInUse = accounts.some(
        (candidate) => candidate.id !== accountId && candidate.email === email
      );
      if (emailInUse) {
        const error = new Error("An account with this email already exists.");
        error.statusCode = 409;
        throw error;
      }

      account.name = name;
      account.email = email;
      await saveAccounts(accounts);
      return publicAccount(account);
    });
  }

  function createSession(account) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + SESSION_LIFETIME_MS;
    sessions.set(token, { account, expiresAt });
    return { token, account, expiresAt };
  }

  function getSession(token) {
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  function deleteSession(token) {
    if (token) sessions.delete(token);
  }

  return {
    createAccount,
    authenticate,
    updateAccount,
    createSession,
    getSession,
    deleteSession
  };
}

module.exports = { createAuthStore, SESSION_LIFETIME_MS };
