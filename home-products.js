import { watchProducts } from "./firestore-service.js";

const DEFAULT_IMAGE = "Eg.jpg";
const MAX_HOME_PRODUCTS = 8;
const CART_BUTTON_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H7"></path>
    <circle cx="10" cy="19" r="1.5"></circle>
    <circle cx="17" cy="19" r="1.5"></circle>
  </svg>
`;

const homeProductsSection = document.querySelector(".products");
const homeProductsGrid = homeProductsSection?.querySelector(".product-grid") ?? null;
const homeProductsViewAll = homeProductsSection?.querySelector(".view-btn") ?? null;

if (homeProductsViewAll instanceof HTMLAnchorElement) {
  homeProductsViewAll.href = "product.html";
}

const ensureStatusElement = () => {
  if (!(homeProductsSection instanceof HTMLElement)) {
    return null;
  }

  let statusElement = homeProductsSection.querySelector(".homepage-products-status");

  if (statusElement instanceof HTMLElement) {
    return statusElement;
  }

  statusElement = document.createElement("p");
  statusElement.className = "homepage-products-status";
  statusElement.dataset.state = "info";

  const productsHeader = homeProductsSection.querySelector(".products-header");

  if (productsHeader?.nextSibling) {
    homeProductsSection.insertBefore(statusElement, productsHeader.nextSibling);
  } else {
    homeProductsSection.appendChild(statusElement);
  }

  return statusElement;
};

const statusElement = ensureStatusElement();

const setStatus = (message, state = "info") => {
  if (!(statusElement instanceof HTMLElement)) {
    return;
  }

  statusElement.textContent = message;
  statusElement.dataset.state = state;
  statusElement.hidden = !message;
};

const normalizeProduct = (product = {}) => ({
  id: String(product.id ?? ""),
  name: String(product.name ?? "Product").trim() || "Product",
  category: String(product.category ?? "General").trim() || "General",
  price: Number(product.price) || 0,
  image: String(product.image ?? "").trim() || DEFAULT_IMAGE,
  alt: String(product.alt ?? product.name ?? "Product image").trim() || "Product image"
});

const formatBasePrice = (amount) => `GHS ${Number(amount || 0).toFixed(2)}`;

const createHomeProductCard = (product) => {
  const item = document.createElement("div");
  item.className = "product-item";
  item.dataset.productId = product.id;
  item.dataset.category = product.category;

  const image = document.createElement("img");
  image.src = product.image;
  image.alt = product.alt;

  const price = document.createElement("p");
  price.className = "price";
  price.textContent = formatBasePrice(product.price);
  price.dataset.basePrice = String(product.price);
  price.dataset.baseCurrency = "GHS";

  const name = document.createElement("p");
  name.className = "name";
  name.textContent = product.name;

  const category = document.createElement("p");
  category.className = "category";
  category.textContent = product.category;

  const info = document.createElement("div");
  info.className = "product-item-info";
  info.append(price, name, category);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "product-add-btn";
  button.setAttribute("aria-label", `Add ${product.name} to cart`);
  button.innerHTML = CART_BUTTON_ICON;

  const bottom = document.createElement("div");
  bottom.className = "product-item-bottom";
  bottom.append(info, button);

  item.append(image, bottom);
  return item;
};

const renderEmptyState = (message) => {
  if (!(homeProductsGrid instanceof HTMLElement)) {
    return;
  }

  homeProductsGrid.innerHTML = "";

  const emptyState = document.createElement("div");
  emptyState.className = "homepage-products-empty";
  emptyState.textContent = message;
  homeProductsGrid.appendChild(emptyState);
};

const renderProducts = (products = []) => {
  if (!(homeProductsGrid instanceof HTMLElement)) {
    return;
  }

  const newestProducts = products
    .map(normalizeProduct)
    .slice(0, MAX_HOME_PRODUCTS);

  homeProductsGrid.innerHTML = "";

  if (!newestProducts.length) {
    renderEmptyState("No products yet. Add products from the admin dashboard to see them here.");
    setStatus("No live products available yet.", "error");
    return;
  }

  newestProducts.forEach((product) => {
    homeProductsGrid.appendChild(createHomeProductCard(product));
  });

  if (window.currencyStore) {
    window.currencyStore.localizePrices(".price");
  }

  setStatus("", "success");
};

if (homeProductsGrid instanceof HTMLElement) {
  setStatus("Loading latest products...", "info");

  watchProducts(
    (products) => {
      renderProducts(products);
    },
    (error) => {
      renderEmptyState("We could not load live products right now.");
      setStatus(error?.message || "Could not load products from the admin dashboard.", "error");
    }
  );
}
