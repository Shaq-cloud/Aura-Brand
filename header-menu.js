(function () {
  const LOGIN_STORAGE_KEY = "token";
  const LOGIN_USER_STORAGE_KEY = "firebase-user";
  const LOGOUT_TRIGGER_SELECTOR = "[data-user-logout]";
  const userLink = document.querySelector("[data-user-link]");
  const siteHeader = document.querySelector(".site-header");
  const menuToggle = document.getElementById("menuToggle");
  const headerMenuPanel = document.getElementById("headerMenuPanel");
  const userMenu = document.querySelector("[data-user-menu]");
  const userDropdownLinks = document.querySelector("[data-user-dropdown-links]");
  const userDropdownName = document.querySelector("[data-user-name-display]");
  const userDropdownEmail = document.querySelector("[data-user-email]");

  const isLoggedIn = () => Boolean(window.localStorage.getItem(LOGIN_STORAGE_KEY));

  const getStoredUser = () => {
    try {
      return JSON.parse(window.localStorage.getItem(LOGIN_USER_STORAGE_KEY) || "null");
    } catch (error) {
      return null;
    }
  };

  const getUserName = (user) => {
    const displayName = user?.displayName?.trim();

    if (displayName) {
      return displayName;
    }

    const email = user?.email?.trim() ?? "";

    if (!email) {
      return "Guest";
    }

    return email.split("@")[0] || "Guest";
  };

  const handleLogout = async () => {
    window.localStorage.removeItem(LOGIN_STORAGE_KEY);
    window.localStorage.removeItem(LOGIN_USER_STORAGE_KEY);

    try {
      const [{ signOut }, { auth }] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
        import("./firebase-config.js")
      ]);

      await signOut(auth);
    } catch (error) {
      // Fall through to redirect even if Firebase sign-out is temporarily unavailable.
    }

    window.location.replace("Login.html");
  };

  const closeMenu = () => {
    if (!siteHeader || !menuToggle) {
      return;
    }

    siteHeader.classList.remove("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation menu");
  };

  const openMenu = () => {
    if (!siteHeader || !menuToggle) {
      return;
    }

    siteHeader.classList.add("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close navigation menu");
  };

  const closeUserDropdown = () => {
    if (!userMenu || !userLink) {
      return;
    }

    userMenu.classList.remove("is-open");
    userLink.setAttribute("aria-expanded", "false");
  };

  const openUserDropdown = () => {
    if (!userMenu || !userLink) {
      return;
    }

    userMenu.classList.add("is-open");
    userLink.setAttribute("aria-expanded", "true");
  };

  const renderDropdownLinks = () => {
    if (!userDropdownLinks) {
      return;
    }

    if (isLoggedIn()) {
      userDropdownLinks.innerHTML = [
        '<button type="button" class="user-dropdown-link" data-user-logout><span>Log out</span><span aria-hidden="true">+</span></button>'
      ].join("");
      return;
    }

    userDropdownLinks.innerHTML = [
      '<a href="Login.html" class="user-dropdown-link"><span>Login</span><span aria-hidden="true">+</span></a>',
      '<a href="Login.html" class="user-dropdown-link"><span>Register</span><span aria-hidden="true">+</span></a>'
    ].join("");
  };

  const updateUserLinkState = () => {
    const loggedIn = isLoggedIn();
    const user = getStoredUser();

    if (userLink) {
      userLink.href = loggedIn ? "order-history.html" : "Login.html";
      userLink.setAttribute("aria-label", loggedIn ? "Open account menu" : "Open login menu");
    }

    if (userDropdownName) {
      userDropdownName.textContent = loggedIn ? getUserName(user) : "Guest account";
    }

    if (userDropdownEmail) {
      userDropdownEmail.textContent = loggedIn
        ? (user?.email?.trim() || "Signed in customer")
        : "Login or register to save your order details.";
    }

    renderDropdownLinks();
  };

  menuToggle?.addEventListener("click", () => {
    if (siteHeader?.classList.contains("is-menu-open")) {
      closeMenu();
      return;
    }

    openMenu();
  });

  userLink?.addEventListener("click", (event) => {
    if (window.innerWidth > 900) {
      return;
    }

    event.preventDefault();

    if (userMenu?.classList.contains("is-open")) {
      closeUserDropdown();
      return;
    }

    openUserDropdown();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (
      siteHeader &&
      headerMenuPanel &&
      siteHeader.classList.contains("is-menu-open") &&
      !target.closest("#headerMenuPanel") &&
      !target.closest("#menuToggle")
    ) {
      closeMenu();
    }

    if (target.closest("#headerMenuPanel a")) {
      closeMenu();
    }

    if (target.closest(LOGOUT_TRIGGER_SELECTOR)) {
      closeUserDropdown();
      handleLogout();
      return;
    }

    if (userMenu && !target.closest("[data-user-menu]")) {
      closeUserDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      closeUserDropdown();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      closeMenu();
      closeUserDropdown();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === LOGIN_STORAGE_KEY || event.key === LOGIN_USER_STORAGE_KEY) {
      updateUserLinkState();
    }
  });

  updateUserLinkState();
})();
