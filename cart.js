const cartItemsContainer = document.querySelector("#cart-items");
const summaryCount = document.querySelector("#summary-count");
const summaryTotal = document.querySelector("#summary-total");
const clearCartButton = document.querySelector("#clear-cart-btn");
const checkoutButton = document.querySelector("#checkout-btn");
const checkoutNote = document.querySelector("#checkout-note");
const currencyStore = window.currencyStore;
const LOGIN_STORAGE_KEY = "token";

const isLoggedIn = () => Boolean(window.localStorage.getItem(LOGIN_STORAGE_KEY));

const syncLoginState = () => {
  if (!checkoutButton || !checkoutNote || !window.cartStore) {
    return;
  }

  const { itemCount } = window.cartStore.getSummary();
  const hasItems = itemCount > 0;

  checkoutButton.disabled = !hasItems;
  checkoutButton.setAttribute("aria-disabled", String(!hasItems));

  if (!hasItems) {
    checkoutNote.textContent = "Add something to your cart first, then you can continue to checkout.";
    return;
  }

  checkoutNote.textContent = isLoggedIn()
    ? "You're signed in and ready to continue to checkout."
    : "Add items freely. Sign in when you're ready to continue to checkout.";
};

const formatPrice = (amount) => {
  if (!currencyStore) {
    return amount.toFixed(2);
  }

  const { currency } = currencyStore.getCurrencyContext();
  const converted = currencyStore.convertAmount(amount, "GHS", currency);
  return currencyStore.formatPrice(converted);
};

const renderEmptyState = () => {
  if (!cartItemsContainer) {
    return;
  }

  cartItemsContainer.innerHTML = `
    <div class="cart-empty">
      <h3>Your cart is still empty</h3>
      <p>Add a few products from the collection and they will appear here with their total cost.</p>
    </div>
  `;
};

const renderCart = () => {
  if (!window.cartStore || !cartItemsContainer || !summaryCount || !summaryTotal) {
    return;
  }

  const items = window.cartStore.getItems();
  const { itemCount, totalCost } = window.cartStore.getSummary(items);

  summaryCount.textContent = String(itemCount);
  summaryTotal.textContent = formatPrice(totalCost);

  if (!items.length) {
    renderEmptyState();
    return;
  }

  cartItemsContainer.innerHTML = items
    .map((item) => {
      const lineTotal = item.price * item.quantity;

      return `
        <article class="cart-item">
          <div class="cart-item-media">
            <img src="${item.image}" alt="${item.alt}">
          </div>
          <div class="cart-item-details">
            <h3>${item.name}</h3>
            <p class="cart-item-meta">${item.category}</p>
            <p class="cart-item-price">${formatPrice(item.price)} each</p>
            <p class="cart-item-meta">Line total: ${formatPrice(lineTotal)}</p>
          </div>
          <div class="cart-item-actions">
            <div class="qty-controls">
              <button type="button" class="qty-btn" data-action="decrease" data-item-id="${item.id}" aria-label="Decrease quantity">-</button>
              <span class="qty-value">${item.quantity}</span>
              <button type="button" class="qty-btn" data-action="increase" data-item-id="${item.id}" aria-label="Increase quantity">+</button>
            </div>
            <button type="button" class="remove-btn" data-action="remove" data-item-id="${item.id}">Remove</button>
          </div>
        </article>
      `;
    })
    .join("");
};

cartItemsContainer?.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement) || !window.cartStore) {
    return;
  }

  const action = target.dataset.action;
  const itemId = target.dataset.itemId;

  if (!action || !itemId) {
    return;
  }

  const items = window.cartStore.getItems();
  const item = items.find((entry) => entry.id === itemId);

  if (!item) {
    return;
  }

  if (action === "increase") {
    window.cartStore.updateQuantity(itemId, item.quantity + 1);
  }

  if (action === "decrease") {
    window.cartStore.updateQuantity(itemId, item.quantity - 1);
  }

  if (action === "remove") {
    window.cartStore.removeItem(itemId);
  }
});

clearCartButton?.addEventListener("click", () => {
  window.cartStore?.clearCart();
});

checkoutButton?.addEventListener("click", () => {
  if (!window.cartStore) {
    return;
  }

  const { itemCount } = window.cartStore.getSummary();

  if (!itemCount) {
    syncLoginState();
    return;
  }

  if (!isLoggedIn()) {
    window.location.href = "Login.html?next=checkout.html";
    return;
  }

  window.location.href = "checkout.html";
});

window.addEventListener("storage", (event) => {
  if (event.key === LOGIN_STORAGE_KEY) {
    syncLoginState();
  }
});

window.addEventListener("cart:updated", renderCart);
window.addEventListener("cart:updated", syncLoginState);
window.addEventListener("currency:updated", renderCart);
syncLoginState();
renderCart();
