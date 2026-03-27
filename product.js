import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import {
  deleteProduct,
  getUserProfile,
  updateProduct,
  watchProducts
} from "./firestore-service.js";

const DEFAULT_IMAGE = "Eg.jpg";
const DEFAULT_DESCRIPTION = "A curated product with a refined look and an easy premium feel.";

const filterList = document.querySelector(".sidebar ul");
const productsTitle = document.querySelector("#products-title");
const productsGrid = document.querySelector("#productsGrid");
const sortSelect = document.querySelector("#sort-select");
const productStatus = document.querySelector("#productStatus");
const productModal = document.querySelector("#product-modal");
const modalImage = document.querySelector("#modal-product-image");
const modalCategory = document.querySelector("#modal-product-category");
const modalTitle = document.querySelector("#modal-product-title");
const modalPrice = document.querySelector("#modal-product-price");
const modalDescription = document.querySelector("#modal-product-description");
const modalCloseTriggers = document.querySelectorAll("[data-close-modal]");
const addToCartButton = document.querySelector("#modal-add-to-cart-btn");
const productAdminPanel = document.querySelector("#productAdminPanel");
const productAdminMessage = document.querySelector("#productAdminMessage");
const productAdminForm = document.querySelector("#productAdminForm");
const adminProductName = document.querySelector("#adminProductName");
const adminProductCategory = document.querySelector("#adminProductCategory");
const adminProductPrice = document.querySelector("#adminProductPrice");
const adminProductImage = document.querySelector("#adminProductImage");
const adminProductDescription = document.querySelector("#adminProductDescription");
const adminProductFeatured = document.querySelector("#adminProductFeatured");
const adminDeleteProductButton = document.querySelector("#adminDeleteProductButton");
const currencyStore = window.currencyStore;
const LOGIN_STORAGE_KEY = "token";

let selectedProduct = null;
let productsCache = [];
let currentFilter = "all";
let currentSort = "default";
let isAdminUser = false;
let stopProductsWatch = null;

const preferredCategories = ["Glasses", "Slippers", "Walking Sticks", "Hats", "Accessories"];

const isLoggedIn = () => Boolean(window.localStorage.getItem(LOGIN_STORAGE_KEY));

const setStatus = (message, state = "info") => {
  if (!productStatus) {
    return;
  }

  productStatus.textContent = message;
  productStatus.dataset.state = state;
  productStatus.classList.toggle("is-hidden", !message);
};

const setAdminMessage = (message, state = "info") => {
  if (!productAdminMessage) {
    return;
  }

  productAdminMessage.textContent = message;
  productAdminMessage.dataset.state = state;
};

const formatPrice = (amount) => {
  const numericAmount = Number(amount || 0);

  if (!currencyStore) {
    return `GHS ${numericAmount.toFixed(2)}`;
  }

  const { currency, locale } = currencyStore.getCurrencyContext();
  const convertedAmount = currencyStore.convertAmount(numericAmount, "GHS", currency);
  return currencyStore.formatPrice(convertedAmount, { currency, locale });
};

const getCategoryKey = (value) => String(value || "").trim().toLowerCase();

const normalizeProduct = (product = {}) => ({
  id: String(product.id ?? ""),
  name: String(product.name ?? "Product").trim() || "Product",
  category: String(product.category ?? "General").trim() || "General",
  price: Number(product.price) || 0,
  image: String(product.image ?? "").trim() || DEFAULT_IMAGE,
  alt: String(product.alt ?? product.name ?? "Product image").trim() || "Product image",
  description: String(product.description ?? "").trim() || DEFAULT_DESCRIPTION,
  featured: Boolean(product.featured)
});

const sortProducts = (products = []) => {
  const cards = [...products];

  cards.sort((firstProduct, secondProduct) => {
    if (currentSort === "price-asc") {
      return firstProduct.price - secondProduct.price;
    }

    if (currentSort === "price-desc") {
      return secondProduct.price - firstProduct.price;
    }

    if (currentSort === "name-asc") {
      return firstProduct.name.localeCompare(secondProduct.name);
    }

    return 0;
  });

  return cards;
};

const getVisibleProducts = () => {
  const filteredProducts = currentFilter === "all"
    ? productsCache
    : productsCache.filter((product) => getCategoryKey(product.category) === currentFilter);

  return sortProducts(filteredProducts);
};

const buildFilterItems = () => {
  if (!filterList) {
    return;
  }

  const categoryMap = new Map();
  productsCache.forEach((product) => {
    categoryMap.set(getCategoryKey(product.category), product.category);
  });

  const orderedCategories = preferredCategories
    .filter((category) => categoryMap.has(getCategoryKey(category)))
    .concat(
      Array.from(categoryMap.values()).filter(
        (category) => !preferredCategories.some((preferred) => getCategoryKey(preferred) === getCategoryKey(category))
      )
    );

  const filters = [{ key: "all", label: "All" }].concat(
    orderedCategories.map((category) => ({
      key: getCategoryKey(category),
      label: category
    }))
  );

  if (!filters.some((filter) => filter.key === currentFilter)) {
    currentFilter = "all";
  }

  filterList.innerHTML = "";

  filters.forEach((filter) => {
    const item = document.createElement("li");
    item.dataset.filter = filter.key;
    item.textContent = filter.label;
    item.classList.toggle("is-active", filter.key === currentFilter);
    filterList.appendChild(item);
  });
};

const createProductCard = (product) => {
  const card = document.createElement("article");
  card.className = "product-item";
  card.dataset.productId = product.id;
  card.dataset.category = product.category;

  const image = document.createElement("img");
  image.src = product.image || DEFAULT_IMAGE;
  image.alt = product.alt || product.name;

  const price = document.createElement("p");
  price.className = "price";
  price.textContent = formatPrice(product.price);
  price.dataset.basePrice = String(Number(product.price) || 0);
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

  const bottom = document.createElement("div");
  bottom.className = "product-item-bottom";
  bottom.append(info);

  card.append(image, bottom);
  return card;
};

const renderProducts = () => {
  if (!productsGrid) {
    return;
  }

  const visibleProducts = getVisibleProducts();
  const titleLabel = currentFilter === "all"
    ? "All"
    : (productsCache.find((product) => getCategoryKey(product.category) === currentFilter)?.category || "Products");

  productsTitle.textContent = `${titleLabel} (${visibleProducts.length})`;
  productsGrid.innerHTML = "";

  if (!visibleProducts.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "product-empty-state";
    emptyState.innerHTML = `
      <h3>No products found</h3>
      <p>There are no products in this category yet. Add one from the admin dashboard or switch filters.</p>
    `;
    productsGrid.appendChild(emptyState);
    return;
  }

  visibleProducts.forEach((product) => {
    productsGrid.appendChild(createProductCard(product));
  });

  if (currencyStore) {
    currencyStore.localizePrices(".price");
  }
};

const populateAdminForm = (product) => {
  if (!productAdminPanel || !productAdminForm) {
    return;
  }

  adminProductName.value = product.name;
  adminProductCategory.value = product.category;
  adminProductPrice.value = String(product.price);
  adminProductImage.value = product.image === DEFAULT_IMAGE ? "" : product.image;
  adminProductDescription.value = product.description === DEFAULT_DESCRIPTION ? "" : product.description;
  adminProductFeatured.checked = Boolean(product.featured);
  setAdminMessage("Admin controls ready.", "info");
};

const openModal = (product) => {
  if (!productModal || !modalImage || !modalCategory || !modalTitle || !modalPrice || !modalDescription) {
    return;
  }

  selectedProduct = product;
  modalImage.src = product.image || DEFAULT_IMAGE;
  modalImage.alt = product.alt || product.name;
  modalCategory.textContent = product.category;
  modalTitle.textContent = product.name;
  modalPrice.textContent = formatPrice(product.price);
  modalDescription.textContent = product.description || DEFAULT_DESCRIPTION;

  if (addToCartButton) {
    addToCartButton.textContent = "Add to Cart";
  }

  if (productAdminPanel) {
    productAdminPanel.hidden = !isAdminUser;
  }

  if (isAdminUser) {
    populateAdminForm(product);
  }

  productModal.classList.add("is-open");
  productModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  if (!productModal) {
    return;
  }

  productModal.classList.remove("is-open");
  productModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  selectedProduct = null;
  setAdminMessage("", "info");
};

const refreshAdminPanel = () => {
  if (!productAdminPanel) {
    return;
  }

  productAdminPanel.hidden = !isAdminUser || !selectedProduct;

  if (isAdminUser && selectedProduct) {
    populateAdminForm(selectedProduct);
  }
};

const applyRequestedCategory = () => {
  const requestedCategory = new URLSearchParams(window.location.search).get("category");

  if (!requestedCategory) {
    return;
  }

  currentFilter = getCategoryKey(requestedCategory);
};

const startLiveProducts = () => {
  setStatus("Loading live products...");

  if (typeof stopProductsWatch === "function") {
    stopProductsWatch();
  }

  stopProductsWatch = watchProducts(
    (products) => {
      productsCache = products.map(normalizeProduct);
      buildFilterItems();
      renderProducts();

      if (selectedProduct) {
        const freshSelection = productsCache.find((product) => product.id === selectedProduct.id);

        if (freshSelection) {
          openModal(freshSelection);
        } else {
          closeModal();
        }
      }

      setStatus(`Live sync active: ${productsCache.length} product${productsCache.length === 1 ? "" : "s"} loaded.`, "success");
    },
    (error) => {
      setStatus(error.message || "We could not load products right now.", "error");
    }
  );
};

const validateAdminProduct = (product) => {
  if (!product.name || product.name.length < 3 || product.name.length > 120) {
    return "Product name must be 3 to 120 characters.";
  }

  if (!product.category || product.category.length < 2 || product.category.length > 60) {
    return "Category must be 2 to 60 characters.";
  }

  if (!Number.isFinite(product.price) || product.price <= 0) {
    return "Price must be greater than 0.";
  }

  if (product.price > 100000) {
    return "Price looks too high. Use 100000 GHS or less.";
  }

  return "";
};

const getAdminProductPayload = () => ({
  name: adminProductName.value.trim(),
  category: adminProductCategory.value.trim(),
  price: Number(adminProductPrice.value),
  image: adminProductImage.value.trim(),
  alt: adminProductName.value.trim(),
  description: adminProductDescription.value.trim(),
  featured: adminProductFeatured.checked
});

const handleAdminSave = async (event) => {
  event.preventDefault();

  if (!selectedProduct || !isAdminUser) {
    return;
  }

  const productPayload = getAdminProductPayload();
  const validationMessage = validateAdminProduct(productPayload);

  if (validationMessage) {
    setAdminMessage(validationMessage, "error");
    return;
  }

  setAdminMessage("Saving changes...", "info");

  try {
    await updateProduct(selectedProduct.id, productPayload);
    setAdminMessage("Product updated successfully.", "success");
  } catch (error) {
    setAdminMessage(error.message || "Product update failed.", "error");
  }
};

const handleAdminDelete = async () => {
  if (!selectedProduct || !isAdminUser) {
    return;
  }

  const confirmed = window.confirm(`Delete "${selectedProduct.name}" from the storefront?`);

  if (!confirmed) {
    return;
  }

  setAdminMessage("Deleting product...", "info");

  try {
    await deleteProduct(selectedProduct.id);
    closeModal();
    setStatus("Product deleted successfully.", "success");
  } catch (error) {
    setAdminMessage(error.message || "Product delete failed.", "error");
  }
};

filterList?.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement) || !target.matches("[data-filter]")) {
    return;
  }

  currentFilter = target.dataset.filter || "all";
  buildFilterItems();
  renderProducts();
});

productsGrid?.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const card = target.closest("[data-product-id]");

  if (!card) {
    return;
  }

  const product = productsCache.find((entry) => entry.id === card.dataset.productId);

  if (product) {
    openModal(product);
  }
});

sortSelect?.addEventListener("change", () => {
  currentSort = sortSelect.value || "default";
  renderProducts();
});

modalCloseTriggers.forEach((trigger) => {
  trigger.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

window.addEventListener("currency:updated", () => {
  if (currencyStore) {
    currencyStore.localizePrices(".price");
  }

  if (selectedProduct && modalPrice) {
    modalPrice.textContent = formatPrice(selectedProduct.price);
  }
});

addToCartButton?.addEventListener("click", () => {
  if (!selectedProduct || !window.cartStore) {
    return;
  }

  window.cartStore.addItem({
    id: selectedProduct.id,
    name: selectedProduct.name,
    category: selectedProduct.category,
    price: selectedProduct.price,
    image: selectedProduct.image,
    alt: selectedProduct.alt
  });

  addToCartButton.textContent = isLoggedIn() ? "Added to Cart" : "Added";
});

productAdminForm?.addEventListener("submit", handleAdminSave);
adminDeleteProductButton?.addEventListener("click", handleAdminDelete);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    isAdminUser = false;
    refreshAdminPanel();
    return;
  }

  try {
    const profile = await getUserProfile(user.uid);
    isAdminUser = profile?.role === "admin";
    refreshAdminPanel();
  } catch (error) {
    isAdminUser = false;
    refreshAdminPanel();
  }
});

applyRequestedCategory();
startLiveProducts();

window.addEventListener("beforeunload", () => {
  if (typeof stopProductsWatch === "function") {
    stopProductsWatch();
  }
});
