(function () {
  const CART_UPDATED_EVENT = "cart:updated";
  const MOBILE_BREAKPOINT = 900;
  const EXCLUDED_PATHS = new Set(["cart.html"]);

  const normalizePath = () => {
    const path = window.location.pathname.split("/").pop() || "index.html";
    return path.toLowerCase();
  };

  const shouldRenderFloatingCart = () => {
    return !EXCLUDED_PATHS.has(normalizePath());
  };

  const createFloatingCart = () => {
    const link = document.createElement("a");
    link.href = "cart.html";
    link.className = "floating-cart-link";
    link.setAttribute("aria-label", "Open cart");
    link.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H7"></path>
        <circle cx="10" cy="19" r="1.5"></circle>
        <circle cx="17" cy="19" r="1.5"></circle>
      </svg>
      <span class="floating-cart-badge" data-cart-count aria-live="polite">0</span>
    `;

    document.body.appendChild(link);
    return link;
  };

  const getItemCount = () => {
    if (window.cartStore?.getSummary) {
      return Number(window.cartStore.getSummary().itemCount) || 0;
    }

    return 0;
  };

  const updateFloatingCartState = (floatingCart) => {
    if (!floatingCart) {
      return;
    }

    const itemCount = getItemCount();
    const badge = floatingCart.querySelector("[data-cart-count]");

    if (badge) {
      badge.textContent = String(itemCount);
      badge.classList.toggle("is-hidden", itemCount === 0);
    }

    floatingCart.classList.toggle("is-animated", itemCount > 0);
  };

  const init = () => {
    if (!shouldRenderFloatingCart()) {
      return;
    }

    const floatingCart = createFloatingCart();
    updateFloatingCartState(floatingCart);

    window.addEventListener(CART_UPDATED_EVENT, () => {
      updateFloatingCartState(floatingCart);
    });

    window.addEventListener("storage", () => {
      updateFloatingCartState(floatingCart);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        floatingCart.classList.remove("is-animated");
      } else {
        updateFloatingCartState(floatingCart);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
