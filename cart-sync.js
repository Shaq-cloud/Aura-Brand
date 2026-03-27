import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { saveCart } from "./firestore-service.js";

const CART_STORAGE_KEY = "mikhs-vintage-cart";

const readLocalCart = () => {
  try {
    const rawCart = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsedCart = rawCart ? JSON.parse(rawCart) : [];
    return Array.isArray(parsedCart) ? parsedCart : [];
  } catch (error) {
    return [];
  }
};

let activeUserId = "";
let syncTimer = 0;

const syncCartToCloud = async () => {
  if (!activeUserId) {
    return;
  }

  try {
    await saveCart(activeUserId, readLocalCart());
  } catch (error) {
    console.error("Cart sync failed:", error);
  }
};

window.cartPersistence = {
  scheduleSync() {
    if (!activeUserId) {
      return;
    }

    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncCartToCloud();
    }, 250);
  }
};

onAuthStateChanged(auth, (user) => {
  activeUserId = user?.uid ?? "";

  if (activeUserId) {
    window.cartPersistence.scheduleSync();
  }
});
