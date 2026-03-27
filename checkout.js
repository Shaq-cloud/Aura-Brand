import { createOrder } from "./firestore-service.js";

const CART_STORAGE_KEY = "mikhs-vintage-cart";
const LOGIN_USER_STORAGE_KEY = "firebase-user";

const checkoutForm = document.getElementById("checkout-form");
const checkoutItems = document.getElementById("checkout-items");
const summaryCount = document.getElementById("summary-count");
const summaryTotal = document.getElementById("summary-total");
const checkoutMessage = document.getElementById("checkout-message");
const placeOrderButton = document.getElementById("place-order-btn");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const ORDER_REQUEST_TIMEOUT_MS = 12000;

const readLocalCart = () => {
  try {
    const rawCart = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsedCart = rawCart ? JSON.parse(rawCart) : [];
    return Array.isArray(parsedCart) ? parsedCart : [];
  } catch (error) {
    return [];
  }
};

const getStoredUser = () => {
  try {
    return JSON.parse(window.localStorage.getItem(LOGIN_USER_STORAGE_KEY) || "null");
  } catch (error) {
    return null;
  }
};

const getSummary = (items = []) => {
  return items.reduce(
    (summary, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      summary.itemCount += quantity;
      summary.totalCost += quantity * price;
      return summary;
    },
    { itemCount: 0, totalCost: 0 }
  );
};

const formatPrice = (amount) => {
  if (!window.currencyStore) {
    return Number(amount || 0).toFixed(2);
  }

  const { currency } = window.currencyStore.getCurrencyContext();
  const converted = window.currencyStore.convertAmount(Number(amount || 0), "GHS", currency);
  return window.currencyStore.formatPrice(converted);
};

const setMessage = (message, state = "info") => {
  if (!checkoutMessage) {
    return;
  }

  checkoutMessage.textContent = message;
  checkoutMessage.dataset.state = state;
};

const renderCheckoutItems = () => {
  const items = readLocalCart();
  const { itemCount, totalCost } = getSummary(items);

  if (summaryCount) {
    summaryCount.textContent = String(itemCount);
  }

  if (summaryTotal) {
    summaryTotal.textContent = formatPrice(totalCost);
  }

  if (!checkoutItems) {
    return items;
  }

  if (!items.length) {
    checkoutItems.innerHTML = `
      <div class="checkout-item">
        <div></div>
        <div>
          <h3>Your cart is empty</h3>
          <p>Add products before you place your order.</p>
        </div>
      </div>
    `;
    return items;
  }

  checkoutItems.innerHTML = items
    .map(
      (item) => `
        <article class="checkout-item">
          <img src="${item.image}" alt="${item.alt}">
          <div>
            <h3>${item.name}</h3>
            <p>${item.category}</p>
            <p>${item.quantity} x ${formatPrice(Number(item.price) || 0)}</p>
          </div>
        </article>
      `
    )
    .join("");

  return items;
};

const redirectToCart = () => {
  window.location.href = "cart.html";
};

const withTimeout = (promise, timeoutMs, message) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    })
  ]);
};

const buildCheckoutPayload = (formData, items, user) => {
  const orderSummary = getSummary(items);
  const currencyContext = window.currencyStore?.getCurrencyContext?.() ?? {
    currency: "USD",
    baseCurrency: "GHS"
  };
  const displayTotal = window.currencyStore
    ? window.currencyStore.convertAmount(orderSummary.totalCost, "GHS", currencyContext.currency)
    : orderSummary.totalCost;

  return {
    uid: user.uid,
    customerName: String(formData.get("fullName") || "").trim(),
    customerEmail: String(formData.get("email") || "").trim(),
    customerPhone: String(formData.get("phone") || "").trim(),
    items,
    notes: String(formData.get("notes") || "").trim(),
    shippingAddress: {
      fullName: String(formData.get("fullName") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      addressLine1: String(formData.get("addressLine1") || "").trim(),
      addressLine2: String(formData.get("addressLine2") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      region: String(formData.get("region") || "").trim(),
      postalCode: String(formData.get("postalCode") || "").trim(),
      country: String(formData.get("country") || "").trim()
    },
    orderValue: Number(displayTotal.toFixed(2)),
    currencyUsed: currencyContext.currency
  };
};

const initializeCheckout = () => {
  const user = getStoredUser();
  const items = renderCheckoutItems();

  if (!user?.uid) {
    redirectToCart();
    return;
  }

  if (!items.length) {
    setMessage("Your cart is empty. Add products before continuing to place your order.", "error");
    placeOrderButton.disabled = true;
    return;
  }

  if (fullNameInput && !fullNameInput.value) {
    fullNameInput.value = user.displayName || "";
  }

  if (emailInput && !emailInput.value) {
    emailInput.value = user.email || "";
  }
};

checkoutForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = getStoredUser();
  const items = readLocalCart();

  if (!user?.uid) {
    redirectToCart();
    return;
  }

  if (!items.length) {
    setMessage("Your cart is empty. Add products before continuing to place your order.", "error");
    return;
  }

  const formData = new FormData(checkoutForm);
  const payload = buildCheckoutPayload(formData, items, user);

  if (!payload.customerPhone) {
    setMessage("Please add a valid phone number before continuing.", "error");
    phoneInput?.focus();
    return;
  }

  if (window.location.protocol === "file:") {
    setMessage("Open the site through localhost or Firebase Hosting. Firestore requests often fail when the page is opened directly as a file.", "error");
    return;
  }

  if (navigator.onLine === false) {
    setMessage("Your browser appears to be offline. Reconnect to the internet and try again.", "error");
    return;
  }

  placeOrderButton.disabled = true;
  setMessage("Saving your order...", "info");

  try {
    await withTimeout(
      createOrder({
        ...payload,
        status: "pending"
      }),
      ORDER_REQUEST_TIMEOUT_MS,
      "We could not reach Firestore to save this order. Check that Firestore is created, your rules allow writes, and you opened the site through localhost or Firebase Hosting."
    );

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { itemCount: 0, totalCost: 0 } }));
    window.cartPersistence?.scheduleSync?.();
    checkoutForm?.reset();
    renderCheckoutItems();
    setMessage("Your order has been placed and saved. Redirecting to your order history...", "success");

    window.setTimeout(() => {
      window.location.href = "order-history.html";
    }, 1200);
  } catch (error) {
    setMessage(error.message || "We could not place your order right now.", "error");
    placeOrderButton.disabled = false;
  }
});

initializeCheckout();
window.addEventListener("currency:updated", renderCheckoutItems);
