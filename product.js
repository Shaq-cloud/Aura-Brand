import { watchProducts } from "./firestore-service.js";

const DEFAULT_IMAGE = "Eg.jpg";
const PRODUCT_IMAGE_STORAGE_KEY = "product-detail-image";

const filterList = document.querySelector(".sidebar ul");
const productsTitle = document.querySelector("#products-title");
const productsGrid = document.querySelector("#productsGrid");
const sortSelect = document.querySelector("#sort-select");
const productStatus = document.querySelector("#productStatus");
const currencyStore = window.currencyStore;

let productsCache = [];
let currentFilter = "all";
let currentSort = "default";
let stopProductsWatch = null;

const preferredCategories = ["Glasses", "Slippers", "Walking Sticks", "Hats", "Accessories"];

const setStatus = (message, state = "info") => {
  if (!productStatus) {
    return;
  }

  productStatus.textContent = message;
  productStatus.dataset.state = state;
  productStatus.classList.toggle("is-hidden", !message);
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

const getRequestedCategory = () => new URLSearchParams(window.location.search).get("category") || "";
const resolveProductImage = (product = {}) => {
  if (typeof product.image === "string" && product.image.trim()) {
    return product.image.trim();
  }

  if (Array.isArray(product.images) && product.images.length) {
    const firstImage = String(product.images[0] ?? "").trim();

    if (firstImage) {
      return firstImage;
    }
  }

  return DEFAULT_IMAGE;
};

const normalizeProduct = (product = {}) => {
  return {
    id: String(product.id ?? ""),
    name: String(product.name ?? "Product").trim() || "Product",
    category: String(product.category ?? "General").trim() || "General",
    price: Number(product.price) || 0,
    image: resolveProductImage(product),
    alt: String(product.alt ?? product.name ?? "Product image").trim() || "Product image"
  };
};

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

const createProductLink = (product) => {
  const params = new URLSearchParams();
  const activeCategory = currentFilter === "all" ? getRequestedCategory() : productsCache.find(
    (product) => getCategoryKey(product.category) === currentFilter
  )?.category;

  if (activeCategory) {
    params.set("category", activeCategory);
  }

  params.set("product", product.id);
  return `product-detail.html?${params.toString()}`;
};

const createProductCard = (product) => {
  const card = document.createElement("a");
  card.className = "product-item";
  card.dataset.productId = product.id;
  card.dataset.category = product.category;
  card.href = createProductLink(product);
  card.addEventListener("click", () => {
    window.sessionStorage.setItem(`${PRODUCT_IMAGE_STORAGE_KEY}:${product.id}`, product.image);
  });

  const image = document.createElement("img");
  image.src = product.image || DEFAULT_IMAGE;
  image.alt = product.alt || product.name;
  image.addEventListener("error", () => {
    image.src = DEFAULT_IMAGE;
  });

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

const applyRequestedCategory = () => {
  const requestedCategory = getRequestedCategory();

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
      setStatus(`Live sync active: ${productsCache.length} product${productsCache.length === 1 ? "" : "s"} loaded.`, "success");
    },
    (error) => {
      setStatus(error.message || "We could not load products right now.", "error");
    }
  );
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

sortSelect?.addEventListener("change", () => {
  currentSort = sortSelect.value || "default";
  renderProducts();
});

window.addEventListener("currency:updated", () => {
  if (currencyStore) {
    currencyStore.localizePrices(".price");
  }
});

applyRequestedCategory();
startLiveProducts();

window.addEventListener("beforeunload", () => {
  if (typeof stopProductsWatch === "function") {
    stopProductsWatch();
  }
});
