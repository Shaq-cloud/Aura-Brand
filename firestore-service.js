import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const USERS_COLLECTION = "users";
const CARTS_COLLECTION = "carts";
const PRODUCTS_COLLECTION = "products";
const ORDERS_COLLECTION = "orders";

const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();
const parseProductImages = (value = []) => {
  const sourceValues = Array.isArray(value) ? value : String(value ?? "").split(",");

  return sourceValues
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
};

const buildUserProfile = (user, existingProfile = null, options = {}) => {
  const createdAt = existingProfile?.createdAt ?? serverTimestamp();
  const role = existingProfile?.role ?? options.role ?? "customer";

  return {
    uid: user.uid,
    name: options.name?.trim() || user.displayName?.trim() || existingProfile?.name || "",
    email: normalizeEmail(user.email ?? existingProfile?.email ?? ""),
    role,
    createdAt,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
};

const getUserProfile = async (uid) => {
  if (!uid) {
    return null;
  }

  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnapshot = await getDoc(userRef);
  return userSnapshot.exists() ? userSnapshot.data() : null;
};

const getUserProfileByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const usersRef = collection(db, USERS_COLLECTION);
  const usersQuery = query(usersRef, where("email", "==", normalizedEmail), limit(1));
  const snapshot = await getDocs(usersQuery);

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
};

const isAdminEmail = async (email) => {
  const profile = await getUserProfileByEmail(email);
  return profile?.role === "admin";
};

const upsertUserProfile = async (user, options = {}) => {
  if (!user?.uid) {
    return null;
  }

  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const userSnapshot = await getDoc(userRef);
  const existingProfile = userSnapshot.exists() ? userSnapshot.data() : null;
  const profile = buildUserProfile(user, existingProfile, options);

  await setDoc(userRef, profile, { merge: true });
  return profile;
};

const sanitizeCartItems = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      name: String(item.name ?? "Product"),
      category: String(item.category ?? "General"),
      price: Number(item.price) || 0,
      image: String(item.image ?? ""),
      alt: String(item.alt ?? item.name ?? "Product image"),
      quantity: Math.max(0, Number(item.quantity) || 0)
    }))
    .filter((item) => item.quantity > 0);
};

const getCartSummary = (items = []) => {
  return sanitizeCartItems(items).reduce(
    (summary, item) => {
      summary.itemCount += item.quantity;
      summary.totalCost += item.price * item.quantity;
      return summary;
    },
    { itemCount: 0, totalCost: 0 }
  );
};

const getCart = async (uid) => {
  if (!uid) {
    return null;
  }

  const cartRef = doc(db, CARTS_COLLECTION, uid);
  const cartSnapshot = await getDoc(cartRef);
  return cartSnapshot.exists() ? cartSnapshot.data() : null;
};

const saveCart = async (uid, items = []) => {
  if (!uid) {
    return null;
  }

  const sanitizedItems = sanitizeCartItems(items);
  const summary = getCartSummary(sanitizedItems);
  const cartRef = doc(db, CARTS_COLLECTION, uid);

  await setDoc(
    cartRef,
    {
      uid,
      items: sanitizedItems,
      itemCount: summary.itemCount,
      totalCost: summary.totalCost,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return {
    uid,
    items: sanitizedItems,
    ...summary
  };
};

const createOrder = async ({
  uid,
  customerName = "",
  customerEmail = "",
  customerPhone = "",
  items = [],
  shippingAddress = {},
  notes = "",
  status = "pending",
  currencyUsed = "USD",
  orderValue = 0
} = {}) => {
  if (!uid) {
    throw new Error("A signed-in user is required to create an order.");
  }

  const sanitizedItems = sanitizeCartItems(items);

  if (!sanitizedItems.length) {
    throw new Error("Your cart is empty.");
  }

  const summary = getCartSummary(sanitizedItems);
  const ordersRef = collection(db, ORDERS_COLLECTION);
  const orderPayload = {
    uid,
    customerName: String(customerName ?? "").trim(),
    customerEmail: normalizeEmail(customerEmail),
    customerPhone: String(customerPhone ?? "").trim(),
    items: sanitizedItems,
    itemCount: summary.itemCount,
    totalCost: summary.totalCost,
    shippingAddress: {
      fullName: String(shippingAddress.fullName ?? "").trim(),
      phone: String(shippingAddress.phone ?? "").trim(),
      addressLine1: String(shippingAddress.addressLine1 ?? "").trim(),
      addressLine2: String(shippingAddress.addressLine2 ?? "").trim(),
      city: String(shippingAddress.city ?? "").trim(),
      region: String(shippingAddress.region ?? "").trim(),
      postalCode: String(shippingAddress.postalCode ?? "").trim(),
      country: String(shippingAddress.country ?? "").trim()
    },
    notes: String(notes ?? "").trim(),
    status: String(status ?? "pending").trim() || "pending",
    currencyUsed: String(currencyUsed ?? "USD").trim() || "USD",
    orderValue: Number(orderValue) || summary.totalCost,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const orderRef = await addDoc(ordersRef, orderPayload);

  return {
    id: orderRef.id,
    ...orderPayload
  };
};

const sanitizeProduct = (product = {}) => {
  const images = parseProductImages(product.images?.length ? product.images : product.image);

  return {
    name: String(product.name ?? "").trim(),
    category: String(product.category ?? "").trim(),
    description: String(product.description ?? "").trim(),
    image: images[0] ?? "",
    images,
    alt: String(product.alt ?? product.name ?? "").trim(),
    price: Number(product.price) || 0,
    featured: Boolean(product.featured)
  };
};

const createProduct = async (product = {}) => {
  const sanitizedProduct = sanitizeProduct(product);

  if (!sanitizedProduct.name || !sanitizedProduct.category) {
    throw new Error("Product name and category are required.");
  }

  const productRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
    ...sanitizedProduct,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return {
    id: productRef.id,
    ...sanitizedProduct
  };
};

const updateProduct = async (productId, product = {}) => {
  if (!productId) {
    throw new Error("A product ID is required.");
  }

  const sanitizedProduct = sanitizeProduct(product);
  await updateDoc(doc(db, PRODUCTS_COLLECTION, productId), {
    ...sanitizedProduct,
    updatedAt: serverTimestamp()
  });

  return {
    id: productId,
    ...sanitizedProduct
  };
};

const deleteProduct = async (productId) => {
  if (!productId) {
    throw new Error("A product ID is required.");
  }

  await deleteDoc(doc(db, PRODUCTS_COLLECTION, productId));
};

const getProduct = async (productId) => {
  if (!productId) {
    return null;
  }

  const productSnapshot = await getDoc(doc(db, PRODUCTS_COLLECTION, productId));

  if (!productSnapshot.exists()) {
    return null;
  }

  return {
    id: productSnapshot.id,
    ...productSnapshot.data()
  };
};

const listProducts = async () => {
  const snapshot = await getDocs(query(collection(db, PRODUCTS_COLLECTION), orderBy("createdAt", "desc")));
  return snapshot.docs.map((productDoc) => ({
    id: productDoc.id,
    ...productDoc.data()
  }));
};

const listOrders = async (maxItems = 25) => {
  const snapshot = await getDocs(
    query(collection(db, ORDERS_COLLECTION), orderBy("createdAt", "desc"), limit(maxItems))
  );

  return snapshot.docs.map((orderDoc) => ({
    id: orderDoc.id,
    ...orderDoc.data()
  }));
};

const sortOrdersByCreatedAt = (orders = []) => {
  return [...orders].sort((firstOrder, secondOrder) => {
    const firstCreatedAt = firstOrder.createdAt?.seconds ?? 0;
    const secondCreatedAt = secondOrder.createdAt?.seconds ?? 0;
    return secondCreatedAt - firstCreatedAt;
  });
};

const listUserOrders = async (uid, maxItems = 25) => {
  if (!uid) {
    return [];
  }

  const snapshot = await getDocs(query(collection(db, ORDERS_COLLECTION), where("uid", "==", uid)));
  const orders = snapshot.docs.map((orderDoc) => ({
    id: orderDoc.id,
    ...orderDoc.data()
  }));

  return sortOrdersByCreatedAt(orders).slice(0, maxItems);
};

const watchProducts = (onData, onError = () => {}) => {
  const productsQuery = query(collection(db, PRODUCTS_COLLECTION), orderBy("createdAt", "desc"));

  return onSnapshot(
    productsQuery,
    (snapshot) => {
      const products = snapshot.docs.map((productDoc) => ({
        id: productDoc.id,
        ...productDoc.data()
      }));
      onData(products);
    },
    onError
  );
};

const watchOrders = (onData, onError = () => {}, maxItems = 25) => {
  const ordersQuery = query(
    collection(db, ORDERS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(maxItems)
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const orders = snapshot.docs.map((orderDoc) => ({
        id: orderDoc.id,
        ...orderDoc.data()
      }));
      onData(orders);
    },
    onError
  );
};

const watchUserOrders = (uid, onData, onError = () => {}, maxItems = 25) => {
  if (!uid) {
    onData([]);
    return () => {};
  }

  const ordersQuery = query(collection(db, ORDERS_COLLECTION), where("uid", "==", uid));

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const orders = snapshot.docs.map((orderDoc) => ({
        id: orderDoc.id,
        ...orderDoc.data()
      }));
      onData(sortOrdersByCreatedAt(orders).slice(0, maxItems));
    },
    onError
  );
};

const updateOrderStatus = async (orderId, status) => {
  if (!orderId) {
    throw new Error("An order ID is required.");
  }

  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: String(status ?? "pending").trim() || "pending",
    updatedAt: serverTimestamp()
  });
};

export {
  CARTS_COLLECTION,
  createProduct,
  createOrder,
  deleteProduct,
  getCart,
  getProduct,
  getCartSummary,
  getUserProfile,
  getUserProfileByEmail,
  isAdminEmail,
  listOrders,
  listProducts,
  listUserOrders,
  normalizeEmail,
  ORDERS_COLLECTION,
  PRODUCTS_COLLECTION,
  saveCart,
  sanitizeCartItems,
  sanitizeProduct,
  USERS_COLLECTION,
  updateOrderStatus,
  updateProduct,
  upsertUserProfile,
  watchOrders,
  watchUserOrders,
  watchProducts
};
