import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { watchUserOrders } from "./firestore-service.js";

const LOGIN_USER_STORAGE_KEY = "firebase-user";
const LOGIN_STORAGE_KEY = "token";

const historyUserEmail = document.getElementById("historyUserEmail");
const historyOrderCount = document.getElementById("historyOrderCount");
const historyTotalSpent = document.getElementById("historyTotalSpent");
const historyMessage = document.getElementById("historyMessage");
const orderHistoryList = document.getElementById("orderHistoryList");
const historyRefreshButton = document.getElementById("historyRefreshButton");
const historyLogoutButton = document.getElementById("historyLogoutButton");
const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsContent = document.getElementById("orderDetailsContent");
const orderDetailsTitle = document.getElementById("orderDetailsTitle");
const closeOrderDetailsButton = document.getElementById("closeOrderDetailsButton");

let stopOrdersWatch = null;
let ordersCache = [];

const getStoredUser = () => {
  try {
    return JSON.parse(window.localStorage.getItem(LOGIN_USER_STORAGE_KEY) || "null");
  } catch (error) {
    return null;
  }
};

const setMessage = (message, state = "info") => {
  if (!historyMessage) {
    return;
  }

  historyMessage.textContent = message;
  historyMessage.dataset.state = state;
};

const formatPrice = (amount) => {
  const numericAmount = Number(amount || 0);

  if (!window.currencyStore) {
    return `GHS ${numericAmount.toFixed(2)}`;
  }

  const { currency, locale } = window.currencyStore.getCurrencyContext();
  const convertedAmount = window.currencyStore.convertAmount(numericAmount, "GHS", currency);
  return window.currencyStore.formatPrice(convertedAmount, { currency, locale });
};

const formatDate = (timestamp) => {
  if (!timestamp?.seconds) {
    return "Processing";
  }

  return new Date(timestamp.seconds * 1000).toLocaleString();
};

const buildAddressLines = (shippingAddress = {}) => {
  return [
    shippingAddress.fullName,
    shippingAddress.addressLine1,
    shippingAddress.addressLine2,
    [shippingAddress.city, shippingAddress.region].filter(Boolean).join(", "),
    shippingAddress.postalCode,
    shippingAddress.country,
    shippingAddress.phone
  ].filter(Boolean);
};

const renderEmptyState = () => {
  if (!orderHistoryList) {
    return;
  }

  orderHistoryList.innerHTML = `
    <article class="empty-state">
      <h3>No orders yet</h3>
      <p>Your orders will appear here as soon as they are saved to Firestore.</p>
    </article>
  `;
};

const renderSummary = (orders = []) => {
  if (historyOrderCount) {
    historyOrderCount.textContent = String(orders.length);
  }

  if (historyTotalSpent) {
    const totalValue = orders.reduce((total, order) => total + (Number(order.totalCost) || 0), 0);
    historyTotalSpent.textContent = formatPrice(totalValue);
  }
};

const renderOrders = (orders = []) => {
  renderSummary(orders);

  if (!orderHistoryList) {
    return;
  }

  if (!orders.length) {
    renderEmptyState();
    return;
  }

  orderHistoryList.innerHTML = orders
    .map((order) => {
      return `
        <button type="button" class="history-order-card" data-order-id="${order.id}">
          <div class="history-order-top">
            <div class="history-order-block">
              <span>Order ID</span>
              <strong>#${String(order.id || "").slice(0, 8).toUpperCase()}</strong>
            </div>
            <div class="history-order-block">
              <span>Placed on</span>
              <strong>${formatDate(order.createdAt)}</strong>
            </div>
            <div class="history-order-block">
              <span>Total</span>
              <strong>${formatPrice(order.totalCost)}</strong>
            </div>
            <div class="history-order-block">
              <span>Status</span>
              <span class="status-pill">${order.status || "pending"}</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");
};

const openOrderDetails = (order) => {
  if (!orderDetailsModal || !orderDetailsContent || !order || !orderDetailsTitle) {
    return;
  }

  const createdAt = formatDate(order.createdAt);
  const shippingLines = buildAddressLines(order.shippingAddress || {});
  const itemsMarkup = (order.items || []).length
    ? (order.items || []).map((item) => `
        <article class="order-item-card">
          <img src="${item.image || "Eg.jpg"}" alt="${item.alt || item.name || "Product"}">
          <div class="order-item-copy">
            <h4>${item.name || "Product"}</h4>
            <p>${item.category || "General"}</p>
            <p>${formatPrice(item.price)} each</p>
          </div>
          <div class="order-item-totals">
            <strong>${item.quantity || 0} item(s)</strong>
            <p>Line total: ${formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state"><h3>No saved items</h3><p>This order does not contain an item breakdown yet.</p></div>`;

  orderDetailsTitle.textContent = `Order #${String(order.id || "").slice(0, 8).toUpperCase()}`;
  orderDetailsContent.innerHTML = `
    <section class="order-summary-grid">
      <article class="order-detail-card">
        <h4>Customer</h4>
        <p>${order.customerName || "Customer order"}</p>
        <p>${order.customerEmail || "No email provided"}</p>
        <p>${order.customerPhone || "No phone provided"}</p>
      </article>
      <article class="order-detail-card">
        <h4>Order info</h4>
        <p>Order ID: #${String(order.id || "").slice(0, 8).toUpperCase()}</p>
        <p>Status: ${order.status || "pending"}</p>
        <p>Date: ${createdAt}</p>
        <p>Total: ${formatPrice(order.totalCost)}</p>
      </article>
      <article class="order-detail-card">
        <h4>Order summary</h4>
        <p>Status: ${order.status || "pending"}</p>
        <p>Items: ${Number(order.itemCount) || (order.items || []).length || 0}</p>
        <p>Total: ${formatPrice(order.totalCost)}</p>
      </article>
    </section>
    <section class="order-summary-grid">
      <article class="order-detail-card">
        <h4>Delivery details</h4>
        <p>${shippingLines.length ? shippingLines.join("<br>") : "No shipping address saved yet."}</p>
      </article>
      <article class="order-detail-card">
        <h4>Order notes</h4>
        <p>${order.notes || "No notes were added for this order."}</p>
      </article>
      <article class="order-detail-card">
        <h4>Quick summary</h4>
        <p>${Number(order.itemCount) || (order.items || []).length || 0} item(s)</p>
        <p>${order.customerEmail || "No email saved"}</p>
        <p>${order.currencyUsed || "USD"}</p>
      </article>
    </section>
    <section class="order-items-grid">
      ${itemsMarkup}
    </section>
  `;

  orderDetailsModal.removeAttribute("hidden");
  orderDetailsModal.hidden = false;
  document.body.style.overflow = "hidden";
};

const closeOrderDetails = () => {
  if (!orderDetailsModal) {
    return;
  }

  orderDetailsModal.hidden = true;
  orderDetailsModal.setAttribute("hidden", "");
  document.body.style.overflow = "";
};

const redirectToLogin = () => {
  window.location.replace("Login.html?next=order-history.html");
};

const stopLiveOrders = () => {
  if (typeof stopOrdersWatch === "function") {
    stopOrdersWatch();
    stopOrdersWatch = null;
  }
};

const startLiveOrders = (uid) => {
  stopLiveOrders();
  setMessage("Loading your recent orders...");

  stopOrdersWatch = watchUserOrders(
    uid,
    (orders) => {
      ordersCache = orders;
      renderOrders(orders);
      setMessage(
        orders.length
          ? `Live sync active: ${orders.length} order${orders.length === 1 ? "" : "s"} loaded.`
          : "Live sync active. Your next order will appear here.",
        "success"
      );
    },
    (error) => {
      ordersCache = [];
      renderSummary([]);
      renderEmptyState();
      setMessage(error.message || "We could not load your order history right now.", "error");
    }
  );
};

const syncHistoryIdentity = (user) => {
  if (!historyUserEmail) {
    return;
  }

  historyUserEmail.textContent = user?.email || getStoredUser()?.email || "Signed in";
};

historyRefreshButton?.addEventListener("click", () => {
  const user = auth.currentUser || getStoredUser();

  if (!user?.uid) {
    redirectToLogin();
    return;
  }

  startLiveOrders(user.uid);
});

historyLogoutButton?.addEventListener("click", () => {
  stopLiveOrders();
  window.localStorage.removeItem(LOGIN_STORAGE_KEY);
  window.localStorage.removeItem(LOGIN_USER_STORAGE_KEY);
  signOut(auth).finally(() => {
    window.location.replace("Login.html");
  });
});

orderHistoryList?.addEventListener("click", (event) => {
  const card = event.target instanceof HTMLElement
    ? event.target.closest("[data-order-id]")
    : null;

  if (!card) {
    return;
  }

  const order = ordersCache.find((entry) => entry.id === card.getAttribute("data-order-id"));

  if (!order) {
    return;
  }

  openOrderDetails(order);
});

closeOrderDetailsButton?.addEventListener("click", closeOrderDetails);

orderDetailsModal?.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action === "close-order-details" || target === orderDetailsModal) {
    closeOrderDetails();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeOrderDetails();
  }
});

syncHistoryIdentity(getStoredUser());
renderEmptyState();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    stopLiveOrders();
    redirectToLogin();
    return;
  }

  syncHistoryIdentity(user);
  startLiveOrders(user.uid);
});

window.addEventListener("currency:updated", () => {
  renderOrders(ordersCache);
});

window.addEventListener("beforeunload", () => {
  closeOrderDetails();
  stopLiveOrders();
});
