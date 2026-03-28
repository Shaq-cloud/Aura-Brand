import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import {
  deleteProduct,
  getProduct,
  getUserProfile,
  updateProduct
} from "./firestore-service.js";

const DEFAULT_IMAGE = "logo.png";
const DEFAULT_DESCRIPTION = "A curated product with a refined look and an easy premium feel.";
const PRODUCT_IMAGE_STORAGE_KEY = "product-detail-image";

const detailStatus = document.querySelector("#productDetailStatus");
const detailLayout = document.querySelector("#productDetailLayout");
const detailBackLink = document.querySelector("#productDetailBackLink");
const detailImage = document.querySelector("#productDetailImage");
const detailCategory = document.querySelector("#productDetailCategory");
const detailTitle = document.querySelector("#productDetailTitle");
const detailPrice = document.querySelector("#productDetailPrice");
const detailDescription = document.querySelector("#productDetailDescription");
const sizeButtons = document.querySelectorAll(".product-size-chip");
const addToCartButton = document.querySelector("#productDetailAddToCartButton");
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

let selectedProduct = null;
let isAdminUser = false;

const getPageParams = () => new URLSearchParams(window.location.search);
const getRequestedProductId = () => getPageParams().get("product") || "";
const getRequestedCategory = () => getPageParams().get("category") || "";
const getRequestedImage = () => {
  const productId = getRequestedProductId();

  if (!productId) {
    return "";
  }

  return window.sessionStorage.getItem(`${PRODUCT_IMAGE_STORAGE_KEY}:${productId}`) || "";
};

const setStatus = (message, state = "info") => {
  if (!detailStatus) {
    return;
  }

  detailStatus.textContent = message;
  detailStatus.dataset.state = state;
  detailStatus.hidden = !message;
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

const parseProductImages = (product = {}) => {
  const sourceValues = Array.isArray(product.images) && product.images.length
    ? product.images
    : String(product.image ?? "").split(",");

  return sourceValues
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
};

const resolvePrimaryImage = (product = {}) => {
  const images = parseProductImages(product);
  return getRequestedImage().trim() || images[0] || String(product.image ?? "").trim() || DEFAULT_IMAGE;
};

const normalizeProduct = (product = {}) => {
  const images = parseProductImages(product);

  return {
    id: String(product.id ?? ""),
    name: String(product.name ?? "Product").trim() || "Product",
    category: String(product.category ?? "General").trim() || "General",
    price: Number(product.price) || 0,
    image: resolvePrimaryImage(product),
    images: images.length ? images : [DEFAULT_IMAGE],
    alt: String(product.alt ?? product.name ?? "Product image").trim() || "Product image",
    description: String(product.description ?? "").trim() || DEFAULT_DESCRIPTION,
    featured: Boolean(product.featured)
  };
};

const createBackLink = () => {
  const params = new URLSearchParams();
  const category = getRequestedCategory();

  if (category) {
    params.set("category", category);
  }

  const query = params.toString();
  return query ? `product.html?${query}` : "product.html";
};

const populateAdminForm = (product) => {
  if (!productAdminForm) {
    return;
  }

  adminProductName.value = product.name;
  adminProductCategory.value = product.category;
  adminProductPrice.value = String(product.price);
  adminProductImage.value = product.images?.length ? product.images.join(", ") : (product.image === DEFAULT_IMAGE ? "" : product.image);
  adminProductDescription.value = product.description === DEFAULT_DESCRIPTION ? "" : product.description;
  adminProductFeatured.checked = Boolean(product.featured);
  setAdminMessage("Admin controls ready.", "info");
};

const renderProduct = (product) => {
  selectedProduct = product;

  if (detailBackLink) {
    detailBackLink.href = createBackLink();
  }

  detailImage.src = product.image || DEFAULT_IMAGE;
  detailImage.alt = product.alt;
  detailCategory.textContent = product.category;
  detailTitle.textContent = product.name;
  detailPrice.textContent = formatPrice(product.price);
  detailDescription.textContent = product.description;
  document.title = `${product.name} - Product Details`;

  if (isAdminUser) {
    productAdminPanel.hidden = false;
    populateAdminForm(product);
  } else {
    productAdminPanel.hidden = true;
  }

  setStatus("");
  detailLayout.hidden = false;
};

detailImage?.addEventListener("error", () => {
  if (detailImage.src.includes(DEFAULT_IMAGE)) {
    return;
  }

  detailImage.src = DEFAULT_IMAGE;
});

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

const loadProduct = async () => {
  const productId = getRequestedProductId();

  if (!productId) {
    setStatus("No product was selected.", "error");
    detailLayout.hidden = true;
    return;
  }

  setStatus("Loading product...", "info");

  try {
    const product = await getProduct(productId);

    if (!product) {
      setStatus("That product could not be found.", "error");
      detailLayout.hidden = true;
      return;
    }

    renderProduct(normalizeProduct(product));
  } catch (error) {
    setStatus(error.message || "We could not load this product right now.", "error");
    detailLayout.hidden = true;
  }
};

sizeButtons.forEach((button, index) => {
  if (index === 2) {
    button.classList.add("is-active");
  }

  button.addEventListener("click", () => {
    sizeButtons.forEach((chip) => chip.classList.remove("is-active"));
    button.classList.add("is-active");
  });
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

  addToCartButton.textContent = "Added to Cart";
});

productAdminForm?.addEventListener("submit", async (event) => {
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
    selectedProduct = normalizeProduct({ id: selectedProduct.id, ...productPayload });
    renderProduct(selectedProduct);
    setAdminMessage("Product updated successfully.", "success");
  } catch (error) {
    setAdminMessage(error.message || "Product update failed.", "error");
  }
});

adminDeleteProductButton?.addEventListener("click", async () => {
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
    window.location.href = createBackLink();
  } catch (error) {
    setAdminMessage(error.message || "Product delete failed.", "error");
  }
});

window.addEventListener("currency:updated", () => {
  if (selectedProduct) {
    detailPrice.textContent = formatPrice(selectedProduct.price);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    isAdminUser = false;

    if (productAdminPanel) {
      productAdminPanel.hidden = true;
    }

    return;
  }

  try {
    const profile = await getUserProfile(user.uid);
    isAdminUser = profile?.role === "admin";

    if (selectedProduct) {
      productAdminPanel.hidden = !isAdminUser;

      if (isAdminUser) {
        populateAdminForm(selectedProduct);
      }
    }
  } catch (error) {
    isAdminUser = false;

    if (productAdminPanel) {
      productAdminPanel.hidden = true;
    }
  }
});

if (detailBackLink) {
  detailBackLink.href = createBackLink();
}

loadProduct();
