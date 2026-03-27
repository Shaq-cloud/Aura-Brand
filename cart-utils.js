(function () {
  const STORAGE_KEY = "mikhs-vintage-cart";
  const CART_UPDATED_EVENT = "cart:updated";
  const CURRENCY_UPDATED_EVENT = "currency:updated";
  const CURRENCY_LOADING_EVENT = "currency:loading";
  const PREFERRED_CURRENCY_KEY = "preferred-currency";
  const EXCHANGE_RATES_CACHE_KEY = "mikhs-vintage-rates-cache";
  const EXCHANGE_RATES_CACHE_TTL_MS = 60 * 60 * 1000;

  const BASE_CURRENCY = "GHS";
  const DEFAULT_CURRENCY = "USD";
  const DEFAULT_LOCALE = "en-US";
  const GEOLOCATION_ENDPOINT = "https://ipapi.co/json/";
  const RATES_ENDPOINT = "https://open.er-api.com/v6/latest/GHS";

  const FALLBACK_RATES = {
    GHS: 1,
    USD: 0.064,
    GBP: 0.05,
    NGN: 98.5
  };

  const COUNTRY_TO_CURRENCY = {
    GH: "GHS",
    US: "USD",
    GB: "GBP",
    NG: "NGN"
  };

  const CURRENCY_TO_LOCALE = {
    GHS: "en-GH",
    USD: "en-US",
    GBP: "en-GB",
    NGN: "en-NG"
  };

  let currencyContext = {
    currency: DEFAULT_CURRENCY,
    locale: DEFAULT_LOCALE,
    source: "default"
  };
  let exchangeRates = { ...FALLBACK_RATES };
  let isInitializingCurrency = false;
  let currencyInitializationPromise = null;

  const dispatchCurrencyEvent = (type, detail = {}) => {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  };

  const readJsonStorage = (key, fallback) => {
    try {
      const rawValue = window.localStorage.getItem(key);
      return rawValue ? JSON.parse(rawValue) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from localStorage.`, error);
      return fallback;
    }
  };

  const writeJsonStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Could not write ${key} to localStorage.`, error);
    }
  };

  const toNumber = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const numericValue = String(value ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const parsedValue = Number.parseFloat(numericValue);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  };

  const getLocaleForCurrency = (currency = DEFAULT_CURRENCY) => {
    return CURRENCY_TO_LOCALE[currency] || DEFAULT_LOCALE;
  };

  const normalizeCurrency = (currency = "") => {
    const normalized = String(currency || "").trim().toUpperCase();
    return FALLBACK_RATES[normalized] ? normalized : DEFAULT_CURRENCY;
  };

  const readPreferredCurrency = () => {
    const rawValue = window.localStorage.getItem(PREFERRED_CURRENCY_KEY);
    return rawValue ? normalizeCurrency(rawValue) : "";
  };

  const setPreferredCurrency = (currency, source = "manual") => {
    const normalizedCurrency = normalizeCurrency(currency);
    window.localStorage.setItem(PREFERRED_CURRENCY_KEY, normalizedCurrency);
    currencyContext = {
      currency: normalizedCurrency,
      locale: getLocaleForCurrency(normalizedCurrency),
      source
    };
    dispatchCurrencyEvent(CURRENCY_UPDATED_EVENT, getCurrencyContext());
    localizePrices();
  };

  const getCachedRates = () => {
    const cachedValue = readJsonStorage(EXCHANGE_RATES_CACHE_KEY, null);

    if (!cachedValue?.rates || !cachedValue?.savedAt) {
      return null;
    }

    if ((Date.now() - Number(cachedValue.savedAt)) > EXCHANGE_RATES_CACHE_TTL_MS) {
      return null;
    }

    return cachedValue.rates;
  };

  const cacheRates = (rates) => {
    writeJsonStorage(EXCHANGE_RATES_CACHE_KEY, {
      savedAt: Date.now(),
      rates
    });
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${url}.`);
    }

    return response.json();
  };

  const fetchExchangeRates = async () => {
    const cachedRates = getCachedRates();

    if (cachedRates) {
      exchangeRates = { ...FALLBACK_RATES, ...cachedRates, GHS: 1 };
      return exchangeRates;
    }

    try {
      const result = await fetchJson(RATES_ENDPOINT);
      const rates = result?.rates || {};
      exchangeRates = {
        ...FALLBACK_RATES,
        ...rates,
        GHS: 1
      };
      cacheRates(exchangeRates);
    } catch (error) {
      console.warn("Falling back to baked-in exchange rates.", error);
      exchangeRates = { ...FALLBACK_RATES };
    }

    return exchangeRates;
  };

  const detectCurrencyFromCountry = async () => {
    try {
      const result = await fetchJson(GEOLOCATION_ENDPOINT);
      const countryCode = String(result?.country_code || result?.country || "").trim().toUpperCase();
      return COUNTRY_TO_CURRENCY[countryCode] || DEFAULT_CURRENCY;
    } catch (error) {
      console.warn("Currency detection failed. Falling back to USD.", error);
      return DEFAULT_CURRENCY;
    }
  };

  const ensureCurrencyInitialized = async () => {
    if (currencyInitializationPromise) {
      return currencyInitializationPromise;
    }

    isInitializingCurrency = true;
    dispatchCurrencyEvent(CURRENCY_LOADING_EVENT, { loading: true });

    currencyInitializationPromise = (async () => {
      await fetchExchangeRates();

      const savedCurrency = readPreferredCurrency();
      const selectedCurrency = savedCurrency || await detectCurrencyFromCountry();

      currencyContext = {
        currency: normalizeCurrency(selectedCurrency),
        locale: getLocaleForCurrency(selectedCurrency),
        source: savedCurrency ? "manual" : "detected"
      };

      localizePrices();
      dispatchCurrencyEvent(CURRENCY_UPDATED_EVENT, getCurrencyContext());
    })()
      .catch((error) => {
        console.warn("Currency initialization failed. Using fallback settings.", error);
        currencyContext = {
          currency: DEFAULT_CURRENCY,
          locale: getLocaleForCurrency(DEFAULT_CURRENCY),
          source: "fallback"
        };
        localizePrices();
        dispatchCurrencyEvent(CURRENCY_UPDATED_EVENT, getCurrencyContext());
      })
      .finally(() => {
        isInitializingCurrency = false;
        dispatchCurrencyEvent(CURRENCY_LOADING_EVENT, { loading: false });
      });

    return currencyInitializationPromise;
  };

  const convertAmount = (amount, fromCurrency = BASE_CURRENCY, toCurrency = DEFAULT_CURRENCY) => {
    const normalizedFromCurrency = normalizeCurrency(fromCurrency);
    const normalizedToCurrency = normalizeCurrency(toCurrency);

    if (normalizedFromCurrency === normalizedToCurrency) {
      return Number(amount || 0);
    }

    const amountNumber = Number(amount || 0);
    const fromRate = exchangeRates[normalizedFromCurrency];
    const toRate = exchangeRates[normalizedToCurrency];

    if (!fromRate || !toRate) {
      console.warn(`Missing currency rate for ${normalizedFromCurrency} or ${normalizedToCurrency}.`);
      return amountNumber;
    }

    const amountInGhs = normalizedFromCurrency === BASE_CURRENCY
      ? amountNumber
      : amountNumber / fromRate;

    const convertedAmount = normalizedToCurrency === BASE_CURRENCY
      ? amountInGhs
      : amountInGhs * toRate;

    return Number(convertedAmount.toFixed(2));
  };

  const formatPrice = (amount, options = {}) => {
    const currency = normalizeCurrency(options.currency || currencyContext.currency);
    const locale = options.locale || getLocaleForCurrency(currency);

    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(amount || 0));
    } catch (error) {
      return `${currency} ${Number(amount || 0).toFixed(2)}`;
    }
  };

  const getCurrencyContext = () => ({
    ...currencyContext,
    baseCurrency: BASE_CURRENCY,
    rates: { ...exchangeRates },
    loading: isInitializingCurrency
  });

  const getBasePriceFromElement = (priceElement, fallback = 0) => {
    if (!(priceElement instanceof Element)) {
      return fallback;
    }

    const dataPrice = Number.parseFloat(priceElement.dataset.basePrice || "");

    if (Number.isFinite(dataPrice)) {
      return dataPrice;
    }

    const parsedValue = toNumber(priceElement.textContent);
    priceElement.dataset.basePrice = String(parsedValue);
    priceElement.dataset.baseCurrency = BASE_CURRENCY;
    return parsedValue;
  };

  const localizePriceElement = (priceElement) => {
    if (!(priceElement instanceof Element)) {
      return;
    }

    const basePrice = getBasePriceFromElement(priceElement, 0);
    const baseCurrency = normalizeCurrency(priceElement.dataset.baseCurrency || BASE_CURRENCY);
    const convertedAmount = convertAmount(basePrice, baseCurrency, currencyContext.currency);
    priceElement.textContent = formatPrice(convertedAmount, {
      currency: currencyContext.currency,
      locale: currencyContext.locale
    });
  };

  const localizePrices = (selector = "[data-base-price]") => {
    document.querySelectorAll(selector).forEach((element) => {
      localizePriceElement(element);
    });
  };

  const readCart = () => {
    const parsedCart = readJsonStorage(STORAGE_KEY, []);
    return Array.isArray(parsedCart) ? parsedCart : [];
  };

  const getSummary = (items = readCart()) => {
    return items.reduce(
      (summary, item) => {
        const quantity = Number(item.quantity) || 0;
        const priceGhs = Number(item.price) || 0;
        summary.itemCount += quantity;
        summary.totalCost += quantity * priceGhs;
        return summary;
      },
      { itemCount: 0, totalCost: 0 }
    );
  };

  const writeCart = (items) => {
    writeJsonStorage(STORAGE_KEY, items);
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: getSummary(items) }));
    window.cartPersistence?.scheduleSync?.();
  };

  const setBadgeState = () => {
    const { itemCount } = getSummary();
    document.querySelectorAll("[data-cart-count]").forEach((badge) => {
      badge.textContent = String(itemCount);
      badge.classList.toggle("is-hidden", itemCount === 0);
    });
  };

  const addItem = (product) => {
    const cart = readCart();
    const existingItem = cart.find((item) => item.id === product.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        ...product,
        price: Number(product.price) || 0,
        baseCurrency: BASE_CURRENCY,
        quantity: 1
      });
    }

    writeCart(cart);
  };

  const updateQuantity = (itemId, nextQuantity) => {
    const cart = readCart()
      .map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        return {
          ...item,
          quantity: Math.max(0, nextQuantity)
        };
      })
      .filter((item) => item.quantity > 0);

    writeCart(cart);
  };

  const removeItem = (itemId) => {
    writeCart(readCart().filter((item) => item.id !== itemId));
  };

  const clearCart = () => {
    writeCart([]);
  };

  const initCartBadge = () => {
    setBadgeState();
    window.addEventListener(CART_UPDATED_EVENT, setBadgeState);
  };

  window.cartStore = {
    addItem,
    clearCart,
    getItems: readCart,
    getSummary,
    initCartBadge,
    removeItem,
    updateQuantity
  };

  window.currencyStore = {
    BASE_CURRENCY,
    convertAmount,
    ensureCurrencyInitialized,
    formatPrice,
    getBasePriceFromElement,
    getCurrencyContext,
    localizePriceElement,
    localizePrices,
    normalizeCurrency,
    setPreferredCurrency,
    toNumber
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initCartBadge();
      ensureCurrencyInitialized();
    }, { once: true });
  } else {
    initCartBadge();
    ensureCurrencyInitialized();
  }
})();
