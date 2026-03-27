import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { getUserProfile, upsertUserProfile } from "./firestore-service.js";
import "./auth-session.js";

const loginForm = document.querySelector(".login-form");
const loginInput = document.querySelector("#accountName");
const customerEmailInput = document.querySelector("#customerEmail");
const customerPasswordInput = document.querySelector("#customerPassword");
const loginButton = document.querySelector(".login-form .primary-button");
const customerAuthMessage = document.querySelector("#customerAuthMessage");
const adminForm = document.querySelector(".admin-form");
const adminEmailInput = document.querySelector("#adminEmail");
const adminPasswordInput = document.querySelector("#adminPassword");
const adminButton = document.querySelector(".admin-submit");
const adminAuthMessage = document.querySelector("#adminAuthMessage");
const currencyChips = document.querySelectorAll(".currency-chip");
const socialButtons = document.querySelectorAll(".signin-options .social-button");
const adminLink = document.querySelector(".admin-link");
const adminSection = document.querySelector("#admin-section");
const adminCloseButtons = document.querySelectorAll("[data-admin-close]");

const ADMIN_DASHBOARD_PATH = "admin-dashboard.html";
const DEFAULT_REDIRECT_PATH = "index.html";
const searchParams = new URLSearchParams(window.location.search);
const nextPath = searchParams.get("next");
let authIntent = "";
const isSupportedAuthOrigin = ["http:", "https:"].includes(window.location.protocol);

const providerFactory = {
  google: () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  },
  facebook: () => new FacebookAuthProvider(),
  apple: () => new OAuthProvider("apple.com")
};

const getCustomerName = () => loginInput?.value.trim() ?? "";
const getCustomerEmail = () => customerEmailInput?.value.trim().toLowerCase() ?? "";
const getCustomerPassword = () => customerPasswordInput?.value ?? "";

const resolveDestination = () => {
  if (!nextPath || nextPath.startsWith("http")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return nextPath;
};

const setMessage = (element, message, state = "info") => {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.state = state;
};

const setCustomerMessage = (message, state = "info") => {
  setMessage(customerAuthMessage, message, state);
};

const setAdminMessage = (message, state = "info") => {
  setMessage(adminAuthMessage, message, state);
};

const setBusyState = (element, isBusy) => {
  if (!element) {
    return;
  }

  element.classList.toggle("is-busy", isBusy);
  element.disabled = isBusy;
};

const getOriginLabel = () => {
  if (window.location.protocol === "file:") {
    return "this local file";
  }

  return window.location.origin;
};

const getFriendlyAuthMessage = (error, options = {}) => {
  const code = error?.code ?? "";
  const providerName = options.providerName ? `${options.providerName} ` : "";

  if (!isSupportedAuthOrigin) {
    return "Firebase Auth needs a web server. Open this page through http://localhost or Firebase Hosting instead of double-clicking the HTML file.";
  }

  switch (code) {
    case "auth/invalid-credential":
      return `${providerName}sign-in is not configured correctly in Firebase for ${getOriginLabel()}. Check Authentication > Sign-in method, enable the provider, and add this domain to Authorized domains.`;
    case "auth/unauthorized-domain":
      return `${getOriginLabel()} is not in Firebase Authorized domains yet. Add it in Authentication > Settings > Authorized domains, then try again.`;
    case "auth/operation-not-allowed":
      return `${providerName}sign-in is disabled in Firebase Authentication. Enable that sign-in method in the Firebase console and try again.`;
    case "auth/popup-blocked":
      return "The sign-in popup was blocked by the browser. Allow popups for this site and try again.";
    case "auth/popup-closed-by-user":
      return "The sign-in popup was closed before completion. Try again and finish the provider flow.";
    case "auth/account-exists-with-different-credential":
      return "This email already belongs to another sign-in method. Use the original provider for that account first.";
    case "auth/email-already-in-use":
      return "That email is already registered. Sign in with the original method for that account.";
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email or password does not match an existing account.";
    case "auth/wrong-password":
      return "That password is incorrect. Check it and try again.";
    case "auth/invalid-email":
      return "That email address is not valid.";
    case "auth/user-disabled":
      return "This account has been disabled in Firebase Authentication.";
    default:
      return error?.message || `${providerName}sign-in could not be completed.`;
  }
};

const syncCustomerState = () => {
  if (!loginInput || !loginButton || !customerEmailInput || !customerPasswordInput) {
    return;
  }

  const hasName = Boolean(getCustomerName());
  const hasEmailLoginFields = Boolean(getCustomerEmail() && getCustomerPassword());

  loginButton.disabled = !(hasName && hasEmailLoginFields);
  loginButton.classList.toggle("is-active", hasName && hasEmailLoginFields);

  socialButtons.forEach((button) => {
    button.disabled = !hasName;
  });
};

const syncAdminState = () => {
  if (!adminButton || !adminEmailInput || !adminPasswordInput) {
    return;
  }

  const hasCredentials = Boolean(adminEmailInput.value.trim() && adminPasswordInput.value.trim());
  adminButton.disabled = !hasCredentials;
  adminButton.classList.toggle("is-active", hasCredentials);
};

const openAdminPanel = () => {
  if (!adminSection) {
    return;
  }

  adminSection.hidden = false;
  window.setTimeout(() => {
    adminEmailInput?.focus();
  }, 150);
};

const closeAdminPanel = () => {
  if (!adminSection) {
    return;
  }

  adminSection.hidden = true;
  adminLink?.focus();
};

const redirectTo = (path) => {
  window.location.href = path;
};

const ensureCustomerProfile = async (user) => {
  const enteredName = getCustomerName();

  if (enteredName && user && user.displayName !== enteredName) {
    await updateProfile(user, { displayName: enteredName });
  }

  await upsertUserProfile(user, { name: enteredName, role: "customer" });
};

const signInCustomerWithProvider = async (providerName) => {
  const enteredName = getCustomerName();

  if (!enteredName) {
    setCustomerMessage("Type your name before choosing a sign-in option.", "error");
    loginInput?.focus();
    return;
  }

  if (!isSupportedAuthOrigin) {
    setCustomerMessage(getFriendlyAuthMessage(null, { providerName }), "error");
    return;
  }

  const createProvider = providerFactory[providerName];

  if (!createProvider) {
    setCustomerMessage("That sign-in option is not available right now.", "error");
    return;
  }

  const provider = createProvider();
  const activeButton = document.querySelector(`[data-provider="${providerName}"]`);

  try {
    authIntent = "customer";
    setCustomerMessage(`Opening ${providerName} sign-in...`, "info");
    setBusyState(activeButton, true);
    const credential = await signInWithPopup(auth, provider);
    await ensureCustomerProfile(credential.user);
    setCustomerMessage("Sign-in successful. Redirecting...", "success");
    window.setTimeout(() => redirectTo(resolveDestination()), 500);
  } catch (error) {
    authIntent = "";
    setCustomerMessage(getFriendlyAuthMessage(error, { providerName }), "error");
  } finally {
    setBusyState(activeButton, false);
    syncCustomerState();
  }
};

const handleCustomerSubmit = async (event) => {
  event.preventDefault();

  if (loginButton?.disabled) {
    return;
  }

  const enteredName = getCustomerName();
  const email = getCustomerEmail();
  const password = getCustomerPassword();

  if (!enteredName) {
    setCustomerMessage("Type your name before choosing a sign-in option.", "error");
    loginInput?.focus();
    return;
  }

  if (!email || !password) {
    setCustomerMessage("Enter your email and password to continue.", "error");
    if (!email) {
      customerEmailInput?.focus();
      return;
    }

    customerPasswordInput?.focus();
    return;
  }

  try {
    authIntent = "customer";
    setCustomerMessage("Checking your account...", "info");
    setBusyState(loginButton, true);

    const signInMethods = await fetchSignInMethodsForEmail(auth, email);
    let credential;

    if (!signInMethods.length) {
      setCustomerMessage("Creating your account...", "info");
      credential = await createUserWithEmailAndPassword(auth, email, password);
    } else if (signInMethods.includes("password")) {
      setCustomerMessage("Signing you in...", "info");
      credential = await signInWithEmailAndPassword(auth, email, password);
    } else if (signInMethods.includes("google.com")) {
      throw new Error("This email is linked to Google sign-in. Use the Google button to continue.");
    } else {
      throw new Error(`This email uses ${signInMethods[0]} sign-in. Use the original sign-in method for this account.`);
    }

    await ensureCustomerProfile(credential.user);
    setCustomerMessage("Sign-in successful. Redirecting...", "success");
    window.setTimeout(() => redirectTo(resolveDestination()), 500);
  } catch (error) {
    authIntent = "";
    setCustomerMessage(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusyState(loginButton, false);
    syncCustomerState();
  }
};

const handleAdminSubmit = async (event) => {
  event.preventDefault();

  const email = adminEmailInput?.value.trim().toLowerCase() ?? "";
  const password = adminPasswordInput?.value ?? "";

  if (!email || !password) {
    setAdminMessage("Enter the admin email and password.", "error");
    return;
  }

  try {
    authIntent = "admin";
    setAdminMessage("Checking admin access...", "info");
    setBusyState(adminButton, true);

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);

    if (profile?.role !== "admin") {
      await signOut(auth);
      authIntent = "";
      setAdminMessage("This account exists, but it is not marked as an admin.", "error");
      return;
    }

    setAdminMessage("Admin verified. Opening dashboard...", "success");
    window.setTimeout(() => redirectTo(ADMIN_DASHBOARD_PATH), 500);
  } catch (error) {
    authIntent = "";
    setAdminMessage(getFriendlyAuthMessage(error), "error");
  } finally {
    setBusyState(adminButton, false);
    syncAdminState();
  }
};

loginInput?.addEventListener("input", () => {
  setCustomerMessage("");
  syncCustomerState();
});

customerEmailInput?.addEventListener("input", () => {
  setCustomerMessage("");
  syncCustomerState();
});

customerPasswordInput?.addEventListener("input", () => {
  setCustomerMessage("");
  syncCustomerState();
});

adminEmailInput?.addEventListener("input", () => {
  setAdminMessage("");
  syncAdminState();
});

adminPasswordInput?.addEventListener("input", () => {
  setAdminMessage("");
  syncAdminState();
});

currencyChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    currencyChips.forEach((button) => {
      const isActive = button === chip;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    window.localStorage.setItem("preferred-currency", chip.dataset.currency ?? "GHS");
  });
});

loginForm?.addEventListener("submit", handleCustomerSubmit);
adminForm?.addEventListener("submit", handleAdminSubmit);

socialButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!getCustomerName()) {
      setCustomerMessage("Type your name before choosing a sign-in option.", "error");
      loginInput?.focus();
      return;
    }

    await signInCustomerWithProvider(button.dataset.provider ?? "");
  });
});

adminLink?.addEventListener("click", (event) => {
  event.preventDefault();
  openAdminPanel();
});

adminCloseButtons.forEach((button) => {
  button.addEventListener("click", closeAdminPanel);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminSection && !adminSection.hidden) {
    closeAdminPanel();
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    return;
  }

  try {
    if (authIntent === "admin") {
      const profile = await getUserProfile(user.uid);

      if (profile?.role === "admin") {
        redirectTo(ADMIN_DASHBOARD_PATH);
      } else {
        setAdminMessage("This account signed in, but admin access could not be confirmed in Firestore.", "error");
      }

      return;
    }

    if (authIntent === "customer") {
      redirectTo(resolveDestination());
      return;
    }

    const profile = await getUserProfile(user.uid);

    if (profile?.role === "admin") {
      return;
    }

    redirectTo(resolveDestination());
  } catch (error) {
    if (authIntent === "admin") {
      setAdminMessage(error.message || "We could not verify admin access right now.", "error");
      return;
    }

    redirectTo(resolveDestination());
  }
});

const preferredCurrency = window.localStorage.getItem("preferred-currency");

if (preferredCurrency) {
  currencyChips.forEach((button) => {
    const isActive = button.dataset.currency === preferredCurrency;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

syncCustomerState();
syncAdminState();

if (!isSupportedAuthOrigin) {
  setCustomerMessage("Open the site through a local server or Firebase Hosting. Firebase Auth will fail if this page is opened directly from a file.", "error");
}
