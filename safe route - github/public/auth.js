const form = document.querySelector("#auth-form");
const loginTab = document.querySelector("#login-tab");
const signupTab = document.querySelector("#signup-tab");
const nameField = document.querySelector("#name-field");
const nameInput = document.querySelector("#name");
const passwordInput = document.querySelector("#password");
const passwordHint = document.querySelector("#password-hint");
const submitButton = document.querySelector("#submit-button");
const errorMessage = document.querySelector("#auth-error");
let mode = "login";

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === "signup";
  loginTab.classList.toggle("active", !signup);
  signupTab.classList.toggle("active", signup);
  loginTab.setAttribute("aria-selected", String(!signup));
  signupTab.setAttribute("aria-selected", String(signup));
  nameField.hidden = !signup;
  nameInput.required = signup;
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
  document.querySelector("#form-title").textContent =
    signup ? "Your next route starts here." : "Good to have you back.";
  document.querySelector("#form-subtitle").textContent =
    signup ? "Create your account to access the dispatch network." :
      "Sign in to plan a safer, faster journey.";
  passwordHint.textContent = signup ? "· 10 CHARACTERS MIN" : "";
  submitButton.firstElementChild.textContent = signup ? "Create secure account" : "Sign in securely";
  errorMessage.textContent = "";
}

async function submitCredentials(event) {
  event.preventDefault();
  errorMessage.textContent = "";
  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = mode === "signup"
    ? "Creating account…" : "Signing in…";

  const payload = {
    email: document.querySelector("#email").value,
    password: passwordInput.value
  };
  if (mode === "signup") payload.name = nameInput.value;

  try {
    let response;
    try {
      response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new Error(
        `Cannot reach the SafeRoute server at ${window.location.origin}. ` +
        "Start it from the project folder with `npm.cmd start`, then open the exact URL printed by the server."
      );
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to authenticate.");
    window.location.assign("/app");
  } catch (error) {
    errorMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent =
      mode === "signup" ? "Create secure account" : "Sign in securely";
  }
}

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));
form.addEventListener("submit", submitCredentials);
document.querySelector("#toggle-password").addEventListener("click", (event) => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  event.currentTarget.textContent = showPassword ? "HIDE" : "SHOW";
  event.currentTarget.setAttribute("aria-label", `${showPassword ? "Hide" : "Show"} password`);
});

fetch("/api/session")
  .then((response) => response.json())
  .then((session) => {
    if (session.authenticated) window.location.replace("/app");
  })
  .catch(() => {});
