import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { getCart, saveCart, upsertUserProfile } from "./firestore-service.js";

const LOGIN_STORAGE_KEY = "token";
const LOGIN_USER_STORAGE_KEY = "firebase-user";
const CART_STORAGE_KEY = "mikhs-vintage-cart";
const CART_OWNER_STORAGE_KEY = "mikhs-vintage-cart-owner";
const CART_UPDATED_EVENT = "cart:updated";

const clearLocalSession = () => {
  window.localStorage.removeItem(LOGIN_STORAGE_KEY);
  window.localStorage.removeItem(LOGIN_USER_STORAGE_KEY);
  window.localStorage.removeItem(CART_OWNER_STORAGE_KEY);
};

const readLocalCart = () => {
  try {
    const rawCart = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsedCart = rawCart ? JSON.parse(rawCart) : [];
    return Array.isArray(parsedCart) ? parsedCart : [];
  } catch (error) {
    return [];
  }
};

const readCartOwner = () => window.localStorage.getItem(CART_OWNER_STORAGE_KEY) || "";

const getCartSummary = (items = []) => {
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

const writeLocalCart = (items, ownerId = "") => {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));

  if (ownerId) {
    window.localStorage.setItem(CART_OWNER_STORAGE_KEY, ownerId);
  } else {
    window.localStorage.removeItem(CART_OWNER_STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: getCartSummary(items) }));
};

const mergeCartItems = (existingItems = [], incomingItems = []) => {
  const mergedItems = new Map();

  [...existingItems, ...incomingItems].forEach((item) => {
    if (!item?.id) {
      return;
    }

    const itemId = String(item.id);
    const quantity = Math.max(0, Number(item.quantity) || 0);

    if (!mergedItems.has(itemId)) {
      mergedItems.set(itemId, {
        id: itemId,
        name: String(item.name ?? "Product"),
        category: String(item.category ?? "General"),
        price: Number(item.price) || 0,
        image: String(item.image ?? ""),
        alt: String(item.alt ?? item.name ?? "Product image"),
        quantity
      });
      return;
    }

    const currentItem = mergedItems.get(itemId);
    mergedItems.set(itemId, {
      ...currentItem,
      ...item,
      price: Number(item.price ?? currentItem.price) || 0,
      quantity: currentItem.quantity + quantity
    });
  });

  return Array.from(mergedItems.values()).filter((item) => item.quantity > 0);
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    clearLocalSession();
    return;
  }

  const basicSession = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    role: "customer"
  };

  try {
    const token = await user.getIdToken();
    window.localStorage.setItem(LOGIN_STORAGE_KEY, token);
    window.localStorage.setItem(LOGIN_USER_STORAGE_KEY, JSON.stringify(basicSession));
  } catch (error) {
    clearLocalSession();
    return;
  }

  try {
    const profile = await upsertUserProfile(user);
    const localCart = readLocalCart();
    const localCartOwner = readCartOwner();
    const cloudCart = await getCart(user.uid);
    const mergedCart = localCartOwner === user.uid
      ? (localCart.length ? localCart : (cloudCart?.items ?? []))
      : mergeCartItems(cloudCart?.items ?? [], localCart);

    window.localStorage.setItem(
      LOGIN_USER_STORAGE_KEY,
      JSON.stringify({
        ...basicSession,
        role: profile?.role ?? "customer"
      })
    );
    writeLocalCart(mergedCart, user.uid);
    await saveCart(user.uid, mergedCart);
  } catch (error) {
    // Keep the auth session available even if Firestore is temporarily unreachable.
    writeLocalCart(readLocalCart(), user.uid);
  }
});
