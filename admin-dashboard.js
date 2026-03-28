import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import {
  createProduct,
  deleteProduct,
  getUserProfile,
  updateProduct,
  watchOrders,
  watchProducts
} from "./firestore-service.js";

const ADMIN_SESSION_KEY = "admin-session";
const ORDER_READ_STATE_KEY = "admin-order-read-state";
const adminSession = window.localStorage.getItem(ADMIN_SESSION_KEY);

const productCount = document.getElementById("productCount");
const orderCount = document.getElementById("orderCount");
const revenueTotal = document.getElementById("revenueTotal");
const adminSessionEmail = document.getElementById("adminSessionEmail");
const adminDisplayName = document.getElementById("adminDisplayName");
const sectionTabs = Array.from(document.querySelectorAll("[data-section-tab]"));
const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));
const dashboardSearchInput = document.querySelector('.searchbar input[type="search"]');
const productForm = document.getElementById("productForm");
const productIdInput = document.getElementById("productId");
const productNameInput = document.getElementById("productName");
const productCategoryInput = document.getElementById("productCategory");
const productPriceInput = document.getElementById("productPrice");
const productImageInput = document.getElementById("productImage");
const productImageFileInput = document.getElementById("productImageFile");
const productImagePreviewCard = document.getElementById("productImagePreviewCard");
const productImagePreview = document.getElementById("productImagePreview");
const productDescriptionInput = document.getElementById("productDescription");
const productFeaturedInput = document.getElementById("productFeatured");
const productMessage = document.getElementById("productMessage");
const productList = document.getElementById("productList");
const topProducts = document.getElementById("topProducts");
const orderList = document.getElementById("orderList");
const orderMessage = document.getElementById("orderMessage");
const unreadOrderCount = document.getElementById("unreadOrderCount");
const ordersNavUnreadCount = document.getElementById("ordersNavUnreadCount");
const chartSvg = document.querySelector(".chart-svg");
const chartAxis = document.querySelector(".chart-axis");
const chartMessage = document.getElementById("chartMessage");
const chartYear = document.getElementById("chartYear");
const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsContent = document.getElementById("orderDetailsContent");
const orderDetailsTitle = document.getElementById("orderDetailsTitle");
const closeOrderDetailsButton = document.getElementById("closeOrderDetailsButton");
const saveProductButton = document.getElementById("saveProductButton");
const resetProductButton = document.getElementById("resetProductButton");
const refreshProductsButton = document.getElementById("refreshProductsButton");
const refreshOrdersButton = document.getElementById("refreshOrdersButton");
const adminLogoutButton = document.getElementById("adminLogout");

const TOAST_DURATION_MS = 3800;

let productsCache = [];
let ordersCache = [];
let adminSessionData = null;
let toastRoot = null;
let stopProductsWatch = null;
let stopOrdersWatch = null;
let uploadedImageDataUrl = "";
let dashboardSearchQuery = "";
let readOrdersState = {};

const productInputs = {
  name: productNameInput,
  category: productCategoryInput,
  price: productPriceInput,
  image: productImageInput,
  description: productDescriptionInput
};

try {
  adminSessionData = adminSession ? JSON.parse(adminSession) : null;
} catch (error) {
  adminSessionData = null;
}

try {
  readOrdersState = JSON.parse(window.localStorage.getItem(ORDER_READ_STATE_KEY) || "{}");
} catch (error) {
  readOrdersState = {};
}

const setMessage = (element, message, state = "info") => {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.state = state;
};

const ensureToastRoot = () => {
  if (toastRoot) {
    return toastRoot;
  }

  toastRoot = document.createElement("div");
  toastRoot.className = "toast-stack";
  toastRoot.setAttribute("aria-live", "polite");
  toastRoot.setAttribute("aria-atomic", "true");
  document.body.appendChild(toastRoot);

  return toastRoot;
};

const showToast = (message, state = "info") => {
  if (!message) {
    return;
  }

  const root = ensureToastRoot();
  const toast = document.createElement("div");
  toast.className = `toast-item toast-${state}`;
  toast.textContent = message;
  toast.setAttribute("role", state === "error" ? "alert" : "status");

  root.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, TOAST_DURATION_MS);
};

const setInputError = (input, message = "") => {
  if (!input) {
    return;
  }

  input.classList.toggle("input-invalid", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  input.setCustomValidity(message);
};

const clearProductInputErrors = () => {
  Object.values(productInputs).forEach((input) => {
    setInputError(input, "");
  });
};

const formatName = (email = "") => {
  const localPart = String(email || "").split("@")[0] || "Admin";
  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const activateSection = (sectionName) => {
  sectionTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.sectionTab === sectionName);
  });

  sectionPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.sectionPanel === sectionName);
  });
};

const formatPrice = (amount) => {
  if (!window.currencyStore) {
    return `GHS ${Number(amount || 0).toFixed(2)}`;
  }

  return window.currencyStore.formatPrice(Number(amount || 0), {
    locale: "en-GH",
    currency: "GHS"
  });
};

const getOrderValue = (orders = []) => {
  return orders.reduce((total, order) => total + (Number(order.totalCost) || 0), 0);
};

const normalizeSearchValue = (value = "") => String(value ?? "").trim().toLowerCase();
const isOrderRead = (orderId = "") => Boolean(readOrdersState[String(orderId || "")]);
const saveReadOrdersState = () => {
  window.localStorage.setItem(ORDER_READ_STATE_KEY, JSON.stringify(readOrdersState));
};
const markOrderAsRead = (orderId = "") => {
  if (!orderId) {
    return;
  }

  readOrdersState[String(orderId)] = true;
  saveReadOrdersState();
};
const getUnreadOrderCount = (orders = []) => orders.filter((order) => !isOrderRead(order.id)).length;
const getOrderCreatedAtValue = (order) => order.createdAt?.seconds ?? 0;
const sortOrdersForDisplay = (orders = []) => {
  return [...orders].sort((firstOrder, secondOrder) => {
    const firstUnread = !isOrderRead(firstOrder.id);
    const secondUnread = !isOrderRead(secondOrder.id);

    if (firstUnread !== secondUnread) {
      return firstUnread ? -1 : 1;
    }

    return getOrderCreatedAtValue(firstOrder) - getOrderCreatedAtValue(secondOrder);
  });
};

const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const buildChartPath = (points = []) => {
  if (!points.length) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
};

const renderAnalyticsChart = () => {
  if (!chartSvg || !chartAxis || !chartMessage || !chartYear) {
    return;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const monthCount = 12;
  chartYear.textContent = String(currentYear);

  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(currentYear, index, 1);
    return {
      key: getMonthKey(date),
      label: date.toLocaleString("en-US", { month: "short" }),
      revenue: 0,
      orders: 0
    };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));

  ordersCache.forEach((order) => {
    const orderDate = order.createdAt?.seconds
      ? new Date(order.createdAt.seconds * 1000)
      : null;

    if (!orderDate) {
      return;
    }

    const monthBucket = monthMap.get(getMonthKey(orderDate));

    if (!monthBucket) {
      return;
    }

    monthBucket.orders += 1;
    monthBucket.revenue += Number(order.totalCost) || 0;
  });

  const chartWidth = 640;
  const chartHeight = 240;
  const paddingX = 20;
  const paddingTop = 18;
  const paddingBottom = 24;
  const usableWidth = chartWidth - (paddingX * 2);
  const usableHeight = chartHeight - paddingTop - paddingBottom;
  const maxRevenue = Math.max(...months.map((month) => month.revenue), 0);
  const maxOrders = Math.max(...months.map((month) => month.orders), 0);

  const revenuePoints = months.map((month, index) => {
    const x = paddingX + ((usableWidth / (monthCount - 1)) * index);
    const ratio = maxRevenue > 0 ? month.revenue / maxRevenue : 0;
    const y = paddingTop + (usableHeight * (1 - ratio));
    return { x, y };
  });

  const orderPoints = months.map((month, index) => {
    const x = paddingX + ((usableWidth / (monthCount - 1)) * index);
    const ratio = maxOrders > 0 ? month.orders / maxOrders : 0;
    const y = paddingTop + (usableHeight * (1 - ratio));
    return { x, y };
  });

  chartSvg.innerHTML = `
    <path d="${buildChartPath(revenuePoints)}" class="chart-line chart-line-purple"></path>
    ${revenuePoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point chart-point-purple"></circle>`).join("")}
    <path d="${buildChartPath(orderPoints)}" class="chart-line chart-line-blue"></path>
    ${orderPoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point chart-point-blue"></circle>`).join("")}
  `;

  chartAxis.innerHTML = months.map((month) => `<span>${month.label}</span>`).join("");

  if (!ordersCache.length) {
    chartMessage.textContent = `Waiting for ${currentYear} orders to build the analytics chart.`;
    return;
  }

  const strongestMonth = [...months].sort((firstMonth, secondMonth) => secondMonth.revenue - firstMonth.revenue)[0];
  chartMessage.textContent = strongestMonth?.revenue
    ? `${strongestMonth.label} ${currentYear} led with ${formatPrice(strongestMonth.revenue)} from ${strongestMonth.orders} orders.`
    : `Orders are loaded, but none fall within ${currentYear} yet.`;
};

const renderSummary = () => {
  productCount.textContent = String(productsCache.length);
  orderCount.textContent = String(ordersCache.length);
  revenueTotal.textContent = formatPrice(getOrderValue(ordersCache));
  if (unreadOrderCount) {
    const unreadCount = getUnreadOrderCount(ordersCache);
    unreadOrderCount.textContent = `${unreadCount} unread`;
  }

  if (ordersNavUnreadCount) {
    const unreadCount = getUnreadOrderCount(ordersCache);
    ordersNavUnreadCount.textContent = String(unreadCount);
    ordersNavUnreadCount.hidden = unreadCount === 0;
  }

  renderAnalyticsChart();
};

const buildAddressLines = (address = {}) => {
  return [
    address.fullName,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.region].filter(Boolean).join(", "),
    [address.postalCode, address.country].filter(Boolean).join(" ")
  ].filter(Boolean);
};

const openOrderDetails = (order) => {
  if (!orderDetailsModal || !orderDetailsContent || !order || !orderDetailsTitle) {
    return;
  }

  const createdAt = order.createdAt?.seconds
    ? new Date(order.createdAt.seconds * 1000).toLocaleString()
    : "Just now";
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
    : `<div class="empty-state">No items were saved for this order.</div>`;

  orderDetailsTitle.textContent = `Order #${String(order.id || "").slice(0, 8).toUpperCase()}`;
  orderDetailsContent.innerHTML = `
    <section class="order-summary-grid">
      <article class="order-detail-card">
        <h4>Customer</h4>
        <p>${order.customerName || "Customer order"}</p>
        <p>${order.customerEmail || "No email provided"}</p>
      </article>
      <article class="order-detail-card">
        <h4>Order info</h4>
        <p>Order ID: #${String(order.id || "").slice(0, 8).toUpperCase()}</p>
        <p>Status: ${order.status || "pending"}</p>
        <p>Date: ${createdAt}</p>
        <p>Total: ${formatPrice(order.totalCost)}</p>
        <p>Customer currency: ${order.currencyUsed || "USD"}</p>
        <p>Order total: ${formatPrice(order.totalCost)}</p>
      </article>
      <article class="order-detail-card">
        <h4>Shipping</h4>
        <p>${shippingLines.length ? shippingLines.join("<br>") : "No shipping address saved yet."}</p>
      </article>
    </section>
    <article class="order-detail-card">
      <h4>Order notes</h4>
      <p>${order.notes || "No notes were added for this order."}</p>
    </article>
    <section class="order-items-grid">
      ${itemsMarkup}
    </section>
  `;

  markOrderAsRead(order.id);
  renderSummary();
  renderOrders();
  orderDetailsModal.removeAttribute("hidden");
  orderDetailsModal.hidden = false;
};

const closeOrderDetails = () => {
  if (!orderDetailsModal) {
    return;
  }

  orderDetailsModal.hidden = true;
  orderDetailsModal.setAttribute("hidden", "");
};

const setImagePreview = (imageSource = "") => {
  if (!productImagePreviewCard || !productImagePreview) {
    return;
  }

  const previewSource = Array.isArray(imageSource) ? imageSource[0] : parseImageReferences(imageSource)[0];

  if (!previewSource) {
    productImagePreviewCard.hidden = true;
    productImagePreview.removeAttribute("src");
    return;
  }

  productImagePreviewCard.hidden = false;
  productImagePreview.src = previewSource;
};

const parseImageReferences = (imageValue = "") => {
  return String(imageValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getProductFormValues = () => ({
  name: productNameInput.value.trim(),
  category: productCategoryInput.value.trim(),
  price: Number(productPriceInput.value) || 0,
  image: uploadedImageDataUrl || productImageInput.value.trim(),
  alt: productNameInput.value.trim(),
  description: productDescriptionInput.value.trim(),
  featured: productFeaturedInput.checked
});

const isValidImageReference = (imageValue = "") => {
  const references = parseImageReferences(imageValue);

  if (!references.length) {
    return true;
  }

  const httpPattern = /^https?:\/\/\S+$/i;
  const localPattern = /^[\w./-]+\.(png|jpe?g|webp|gif|avif|svg)$/i;
  const dataUrlPattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;

  return references.every((reference) => httpPattern.test(reference) || localPattern.test(reference) || dataUrlPattern.test(reference));
};

const validateProductData = (productData) => {
  const errors = {};

  if (!productData.name) {
    errors.name = "Product name is required.";
  } else if (productData.name.length < 3 || productData.name.length > 120) {
    errors.name = "Product name must be 3 to 120 characters.";
  }

  if (!productData.category) {
    errors.category = "Category is required.";
  } else if (productData.category.length < 2 || productData.category.length > 60) {
    errors.category = "Category must be 2 to 60 characters.";
  }

  if (!Number.isFinite(productData.price) || productData.price <= 0) {
    errors.price = "Price must be greater than 0.";
  } else if (productData.price > 100000) {
    errors.price = "Price looks too high. Use 100000 GHS or less.";
  }

  if (!isValidImageReference(productData.image)) {
    errors.image = "Use an image URL, local image path, or choose an image from your device.";
  }

  if (productData.description.length > 600) {
    errors.description = "Description can be up to 600 characters.";
  }

  return errors;
};

const resetProductForm = () => {
  productForm.reset();
  productIdInput.value = "";
  uploadedImageDataUrl = "";
  setImagePreview("");
  saveProductButton.textContent = "Save Product";
  clearProductInputErrors();
  setMessage(productMessage, "");
};

const populateProductForm = (product) => {
  productIdInput.value = product.id;
  productNameInput.value = product.name ?? "";
  productCategoryInput.value = product.category ?? "";
  productPriceInput.value = String(product.price ?? "");
  productImageInput.value = Array.isArray(product.images) && product.images.length ? product.images.join(", ") : (product.image ?? "");
  uploadedImageDataUrl = "";
  setImagePreview(Array.isArray(product.images) && product.images.length ? product.images[0] : (product.image ?? ""));
  productDescriptionInput.value = product.description ?? "";
  productFeaturedInput.checked = Boolean(product.featured);
  saveProductButton.textContent = "Update Product";
  clearProductInputErrors();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

productImageInput?.addEventListener("input", () => {
  if (uploadedImageDataUrl) {
    uploadedImageDataUrl = "";
    if (productImageFileInput) {
      productImageFileInput.value = "";
    }
  }

  setImagePreview(productImageInput.value.trim());
});

productImageFileInput?.addEventListener("change", () => {
  const [file] = Array.from(productImageFileInput.files ?? []);

  if (!file) {
    uploadedImageDataUrl = "";
    setImagePreview(productImageInput.value.trim());
    return;
  }

  if (!file.type.startsWith("image/")) {
    uploadedImageDataUrl = "";
    productImageFileInput.value = "";
    setMessage(productMessage, "Choose a valid image file.", "error");
    setImagePreview(productImageInput.value.trim());
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    uploadedImageDataUrl = typeof reader.result === "string" ? reader.result : "";

    if (!uploadedImageDataUrl) {
      setMessage(productMessage, "The selected image could not be loaded.", "error");
      return;
    }

    productImageInput.value = file.name;
    setImagePreview(uploadedImageDataUrl);
    setMessage(productMessage, `Selected image: ${file.name}`, "success");
  };

  reader.onerror = () => {
    uploadedImageDataUrl = "";
    setMessage(productMessage, "The selected image could not be read.", "error");
    setImagePreview(productImageInput.value.trim());
  };

  reader.readAsDataURL(file);
});

const renderProducts = () => {
  const getTopSellingProducts = () => {
    const salesMap = new Map();

    ordersCache.forEach((order) => {
      (order.items || []).forEach((item) => {
        const fallbackId = `${String(item.name || "").trim().toLowerCase()}-${Number(item.price) || 0}`;
        const key = String(item.id || fallbackId);
        const existing = salesMap.get(key) || {
          id: item.id || "",
          name: item.name || "Untitled product",
          category: item.category || "General",
          price: Number(item.price) || 0,
          image: item.image || "",
          alt: item.alt || item.name || "Product",
          quantitySold: 0,
          totalSales: 0
        };

        existing.quantitySold += Math.max(0, Number(item.quantity) || 0);
        existing.totalSales += (Number(item.price) || 0) * (Math.max(0, Number(item.quantity) || 0));
        salesMap.set(key, existing);
      });
    });

    productsCache.forEach((product) => {
      const key = String(product.id || "");

      if (!key || !salesMap.has(key)) {
        return;
      }

      const existing = salesMap.get(key);
      salesMap.set(key, {
        ...existing,
        id: product.id || existing.id,
        name: product.name || existing.name,
        category: product.category || existing.category,
        price: Number(product.price) || existing.price,
        image: product.image || existing.image,
        alt: product.alt || existing.alt
      });
    });

    const rankedProducts = Array.from(salesMap.values()).sort((firstProduct, secondProduct) => {
      if (secondProduct.quantitySold !== firstProduct.quantitySold) {
        return secondProduct.quantitySold - firstProduct.quantitySold;
      }

      return secondProduct.totalSales - firstProduct.totalSales;
    });

    if (rankedProducts.length) {
      return rankedProducts.slice(0, 4);
    }

    return productsCache.slice(0, 4).map((product) => ({
      id: product.id || "",
      name: product.name || "Untitled product",
      category: product.category || "General",
      price: Number(product.price) || 0,
      image: product.image || "",
      alt: product.alt || product.name || "Product",
      quantitySold: 0,
      totalSales: 0
    }));
  };
  const searchTerm = normalizeSearchValue(dashboardSearchQuery);
  const filteredProducts = searchTerm
    ? productsCache.filter((product) => {
        const searchableText = [
          product.name,
          product.category,
          product.description,
          product.id
        ]
          .map((value) => normalizeSearchValue(value))
          .join(" ");

        return searchableText.includes(searchTerm);
      })
    : productsCache;

  if (!productsCache.length) {
    productList.innerHTML = `
      <div class="empty-state">
        No products found in Firestore yet. Add your first product from the form.
      </div>
    `;
    topProducts.innerHTML = `
      <div class="empty-state">
        No products available yet.
      </div>
    `;
    return;
  }

  if (searchTerm && !filteredProducts.length) {
    productList.innerHTML = `
      <div class="empty-state">
        No products matched "${dashboardSearchQuery}".
      </div>
    `;
  } else {
    productList.innerHTML = filteredProducts
    .map((product) => `
      <article class="product-card" data-product-id="${product.id}">
        <img class="product-thumb" src="${product.image || "Eg.jpg"}" alt="${product.alt || product.name || "Product"}">
        <div class="product-copy" data-category="${product.category ?? "General"}" data-price="${formatPrice(product.price)} each">
          <h4>${product.name ?? "Untitled product"}</h4>
          <p class="meta-line">${product.category ?? "General"} · ${formatPrice(product.price)}</p>
        </div>
        <div class="product-actions">
          <button type="button" class="ghost-button" data-action="edit-product">Edit</button>
          <button type="button" class="danger-button" data-action="delete-product">Delete</button>
        </div>
        <p class="product-description">${product.description || "No description added yet."}</p>
      </article>
    `)
    .join("");
  }

  topProducts.innerHTML = getTopSellingProducts()
    .map((product) => `
      <article class="top-product-card">
        <img class="top-product-thumb" src="${product.image || "Eg.jpg"}" alt="${product.alt || product.name || "Product"}">
        <div class="top-product-copy">
          <h4>${product.name ?? "Untitled product"}</h4>
          <p class="top-product-category">${product.category ?? "General"}</p>
          <p class="top-product-price">${formatPrice(product.price)} each</p>
        </div>
        <div class="top-product-side">
          <p class="top-product-status">${product.quantitySold ? `${product.quantitySold} sold` : "New item"}</p>
        </div>
      </article>
    `)
    .join("");
};

const renderOrders = () => {
  const searchTerm = normalizeSearchValue(dashboardSearchQuery);
  const filteredOrders = searchTerm
    ? ordersCache.filter((order) => {
        const searchableText = [
          order.id,
          order.customerName,
          order.customerEmail,
          (order.items || []).map((item) => item.name).join(" ")
        ]
          .map((value) => normalizeSearchValue(value))
          .join(" ");

        return searchableText.includes(searchTerm);
      })
    : ordersCache;
  const sortedOrders = sortOrdersForDisplay(filteredOrders);

  if (!ordersCache.length) {
    orderList.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">No orders have been placed yet.</div>
        </td>
      </tr>
    `;
    return;
  }

  if (searchTerm && !sortedOrders.length) {
    orderList.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">No orders matched "${dashboardSearchQuery}".</div>
        </td>
      </tr>
    `;
    return;
  }

  orderList.innerHTML = sortedOrders
    .map((order) => {
      const createdAt = order.createdAt?.seconds
        ? new Date(order.createdAt.seconds * 1000).toLocaleString()
        : "Just now";
      const status = String(order.status || "pending").toLowerCase();
      const isUnread = !isOrderRead(order.id);
      const customerLabel = order.customerEmail
        ? `${order.customerName || "Customer order"}<br><span class="meta-line">${order.customerEmail}</span>`
        : (order.customerName || "Customer order");

      return `
        <tr data-order-id="${order.id}" class="${isUnread ? "is-unopened" : ""}">
          <td data-label="Order ID">
            <div class="order-id-cell">
              <span class="order-unread-dot ${isUnread ? "" : "is-read"}" aria-hidden="true"></span>
              <span>#${order.id.slice(0, 8).toUpperCase()}</span>
            </div>
          </td>
          <td data-label="Customer">${customerLabel}</td>
          <td data-label="Order Date">${createdAt}</td>
          <td data-label="Price">${formatPrice(order.totalCost)}</td>
          <td data-label="Status"><span class="status-pill ${status}">${order.status || "pending"}</span></td>
          <td data-label="Items">${(order.items || []).map((item) => `${item.quantity}x ${item.name}`).join(", ")}</td>
        </tr>
      `;
    })
    .join("");
};

const startLiveSync = () => {
  setMessage(productMessage, "Starting live product sync...");
  setMessage(orderMessage, "Starting live order sync...");

  if (typeof stopProductsWatch === "function") {
    stopProductsWatch();
  }

  if (typeof stopOrdersWatch === "function") {
    stopOrdersWatch();
  }

  stopProductsWatch = watchProducts(
    (products) => {
      productsCache = products;
      renderProducts();
      renderSummary();
      setMessage(productMessage, `Live sync active: ${products.length} products.`, "success");
    },
    (error) => {
      const errorMessage = error.message || "Could not sync products live.";
      setMessage(productMessage, errorMessage, "error");
      showToast(errorMessage, "error");
    }
  );

  stopOrdersWatch = watchOrders(
    (orders) => {
      ordersCache = orders;
      renderOrders();
      renderSummary();
      setMessage(orderMessage, `Live sync active: ${orders.length} recent orders.`, "success");
    },
    (error) => {
      const errorMessage = error.message || "Could not sync orders live.";
      setMessage(orderMessage, errorMessage, "error");
      showToast(errorMessage, "error");
    }
  );
};

const stopLiveSync = () => {
  if (typeof stopProductsWatch === "function") {
    stopProductsWatch();
    stopProductsWatch = null;
  }

  if (typeof stopOrdersWatch === "function") {
    stopOrdersWatch();
    stopOrdersWatch = null;
  }
};

productForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productId = productIdInput.value.trim();
  const productData = getProductFormValues();
  const validationErrors = validateProductData(productData);

  clearProductInputErrors();
  Object.entries(validationErrors).forEach(([fieldName, message]) => {
    setInputError(productInputs[fieldName], message);
  });

  if (Object.keys(validationErrors).length) {
    const firstInvalidField = Object.keys(validationErrors)[0];
    productInputs[firstInvalidField]?.reportValidity();
    const validationMessage = validationErrors[firstInvalidField];
    setMessage(productMessage, validationMessage, "error");
    showToast(validationMessage, "error");
    return;
  }

  setMessage(productMessage, productId ? "Updating product..." : "Saving product...");

  try {
    if (productId) {
      await updateProduct(productId, productData);
      setMessage(productMessage, "Product updated successfully.", "success");
      showToast("Product updated successfully.", "success");
    } else {
      await createProduct(productData);
      setMessage(productMessage, "Product added successfully.", "success");
      showToast("Product added successfully.", "success");
    }

    resetProductForm();
  } catch (error) {
    const errorMessage = error.message || "Product save failed.";
    setMessage(productMessage, errorMessage, "error");
    showToast(errorMessage, "error");
  }
});

productList?.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const card = target.closest("[data-product-id]");

  if (!card) {
    return;
  }

  const product = productsCache.find((entry) => entry.id === card.dataset.productId);

  if (!product) {
    return;
  }

  if (target.dataset.action === "edit-product") {
    populateProductForm(product);
    return;
  }

  if (target.dataset.action === "delete-product") {
    const confirmed = window.confirm(`Delete "${product.name}" from Firestore?`);

    if (!confirmed) {
      return;
    }

    setMessage(productMessage, "Deleting product...");

    try {
      await deleteProduct(product.id);
      setMessage(productMessage, "Product deleted successfully.", "success");
      showToast("Product deleted successfully.", "success");
    } catch (error) {
      const errorMessage = error.message || "Product delete failed.";
      setMessage(productMessage, errorMessage, "error");
      showToast(errorMessage, "error");
    }
  }
});

orderList?.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const row = target.closest("[data-order-id]");

  if (!row) {
    return;
  }

  const order = ordersCache.find((entry) => entry.id === row.dataset.orderId);

  if (!order) {
    return;
  }

  openOrderDetails(order);
});

resetProductButton?.addEventListener("click", resetProductForm);
refreshProductsButton?.addEventListener("click", startLiveSync);
refreshOrdersButton?.addEventListener("click", startLiveSync);
dashboardSearchInput?.addEventListener("input", (event) => {
  dashboardSearchQuery = event.target instanceof HTMLInputElement ? event.target.value.trim() : "";
  renderProducts();
  renderOrders();
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
  if (event.key === "Escape" && orderDetailsModal && !orderDetailsModal.hidden) {
    closeOrderDetails();
  }
});

adminLogoutButton?.addEventListener("click", () => {
  stopLiveSync();
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
  signOut(auth).finally(() => {
    window.location.replace("Login.html?admin=1");
  });
});

sectionTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activateSection(tab.dataset.sectionTab);
  });
});

activateSection("overview");

if (adminSessionEmail) {
  adminSessionEmail.textContent = adminSessionData?.email || "Signed in";
}

adminDisplayName.textContent = formatName(adminSessionData?.email);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopLiveSync();
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.replace("Login.html?admin=1");
    return;
  }

  try {
    const profile = await getUserProfile(user.uid);

    if (profile?.role !== "admin") {
      stopLiveSync();
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      await signOut(auth);
      window.location.replace("Login.html?admin=1");
      return;
    }

    adminSessionData = {
      email: user.email ?? adminSessionData?.email ?? "",
      uid: user.uid,
      loggedInAt: adminSessionData?.loggedInAt ?? new Date().toISOString()
    };
    window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSessionData));

    if (adminSessionEmail) {
      adminSessionEmail.textContent = adminSessionData.email || "Signed in";
    }

    adminDisplayName.textContent = formatName(adminSessionData.email);
    startLiveSync();
  } catch (error) {
    stopLiveSync();
    const errorMessage = error.message || "Could not verify admin access.";
    setMessage(productMessage, errorMessage, "error");
    setMessage(orderMessage, errorMessage, "error");
    showToast(errorMessage, "error");
  }
});

window.addEventListener("beforeunload", () => {
  stopLiveSync();
});
