const getHomepagePriceValue = (priceText) => {
  if (window.currencyStore) {
    return window.currencyStore.toNumber(priceText);
  }

  return Number.parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;
};

const cartButtonIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H7"/>
    <circle cx="10" cy="19" r="1.5"/>
    <circle cx="17" cy="19" r="1.5"/>
  </svg>
`;

const addedButtonIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12.5l4 4L19 7.5"/>
  </svg>
`;

const addButtonTimers = new WeakMap();
const LOGIN_USER_STORAGE_KEY = "firebase-user";
const userNameLabel = document.querySelector("[data-user-name]");

const formatUserName = (user) => {
  const displayName = user?.displayName?.trim();

  if (displayName) {
    return displayName;
  }

  const email = user?.email?.trim() ?? "";
  const emailName = email.split("@")[0]?.trim();

  if (!emailName) {
    return "User";
  }

  return emailName
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const updateGreeting = () => {
  if (!userNameLabel) {
    return;
  }

  try {
    const user = JSON.parse(window.localStorage.getItem(LOGIN_USER_STORAGE_KEY) || "null");
    userNameLabel.textContent = `${formatUserName(user)},`;
  } catch (error) {
    userNameLabel.textContent = "User,";
  }
};

window.addEventListener("storage", (event) => {
  if (event.key === LOGIN_USER_STORAGE_KEY) {
    updateGreeting();
  }
});

updateGreeting();

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (!window.cartStore) {
    return;
  }

  const addButton = target.closest(".product-add-btn");

  if (!addButton) {
    return;
  }

  const productItem = addButton.closest(".product-item");

  if (!productItem) {
    return;
  }

  const image = productItem.querySelector("img");
  const name = productItem.querySelector(".name")?.textContent?.trim() ?? "Product";
  const category = productItem.querySelector(".category")?.textContent?.trim() ?? "General";
  const priceElement = productItem.querySelector(".price");
  const priceText = priceElement?.textContent?.trim() ?? "0";
  const basePrice = window.currencyStore
    ? window.currencyStore.getBasePriceFromElement(priceElement, 0)
    : getHomepagePriceValue(priceText);

  window.cartStore.addItem({
    id: `${name}-${category}`.replace(/\s+/g, "-").toLowerCase(),
    name,
    category,
    price: basePrice,
    image: image?.getAttribute("src") ?? "",
    alt: image?.getAttribute("alt") ?? name
  });

  addButton.classList.add("is-added");
  addButton.innerHTML = addedButtonIcon;
  addButton.setAttribute("aria-label", `${name} added to cart`);

  const existingTimer = addButtonTimers.get(addButton);

  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  const resetTimer = window.setTimeout(() => {
    addButton.classList.remove("is-added");
    addButton.innerHTML = cartButtonIcon;
    addButton.setAttribute("aria-label", `Add ${name} to cart`);
    addButtonTimers.delete(addButton);
  }, 2000);

  addButtonTimers.set(addButton, resetTimer);
});

if (window.currencyStore) {
  const hydrateHomepagePrices = () => {
    document.querySelectorAll(".price").forEach((priceElement) => {
      if (!(priceElement instanceof HTMLElement)) {
        return;
      }

      const basePrice = window.currencyStore.getBasePriceFromElement(priceElement, 0);
      priceElement.dataset.basePrice = String(basePrice);
      priceElement.dataset.baseCurrency = "GHS";
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      hydrateHomepagePrices();
      window.currencyStore.localizePrices(".price");
    });
  } else {
    hydrateHomepagePrices();
    window.currencyStore.localizePrices(".price");
  }
}

const initProductGridDots = () => {
  const productGrids = Array.from(document.querySelectorAll(".products .product-grid"));

  if (!productGrids.length) {
    return;
  }

  productGrids.forEach((grid) => {
    const items = Array.from(grid.querySelectorAll(".product-item"));

    if (items.length <= 1) {
      return;
    }

    const dotsWrap = document.createElement("div");
    dotsWrap.className = "product-grid-dots";

    const dots = items.map((item, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "product-grid-dot";
      dot.setAttribute("aria-label", `View item ${index + 1}`);
      dot.addEventListener("click", () => {
        item.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      });
      dotsWrap.appendChild(dot);
      return dot;
    });

    const updateActiveDot = () => {
      const gridRect = grid.getBoundingClientRect();
      let closestIndex = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;

      items.forEach((item, index) => {
        const itemRect = item.getBoundingClientRect();
        const distance = Math.abs(itemRect.left - gridRect.left);

        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestIndex = index;
        }
      });

      dots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === closestIndex);
      });
    };

    grid.insertAdjacentElement("afterend", dotsWrap);
    updateActiveDot();
    grid.addEventListener("scroll", updateActiveDot, { passive: true });
    window.addEventListener("resize", updateActiveDot);
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProductGridDots, { once: true });
} else {
  initProductGridDots();
}

const initHeroCarousel = () => {
  const carousel = document.querySelector("[data-hero-carousel]");

  if (!(carousel instanceof HTMLElement)) {
    return;
  }

  const slides = Array.from(carousel.querySelectorAll("[data-hero-slide]"));
  const dots = Array.from(carousel.querySelectorAll("[data-hero-dot]"));
  const prevButton = carousel.querySelector("[data-hero-prev]");
  const nextButton = carousel.querySelector("[data-hero-next]");

  if (!slides.length) {
    return;
  }

  let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
  let autoplayId = 0;

  if (activeIndex < 0) {
    activeIndex = 0;
  }

  const renderSlide = (index) => {
    activeIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === activeIndex);
    });

    dots.forEach((dot, dotIndex) => {
      const isActive = dotIndex === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", String(isActive));
    });
  };

  const restartAutoplay = () => {
    window.clearInterval(autoplayId);
    autoplayId = window.setInterval(() => {
      renderSlide(activeIndex + 1);
    }, 5000);
  };

  if (prevButton instanceof HTMLButtonElement) {
    prevButton.addEventListener("click", () => {
      renderSlide(activeIndex - 1);
      restartAutoplay();
    });
  }

  if (nextButton instanceof HTMLButtonElement) {
    nextButton.addEventListener("click", () => {
      renderSlide(activeIndex + 1);
      restartAutoplay();
    });
  }

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      renderSlide(index);
      restartAutoplay();
    });
  });

  carousel.addEventListener("mouseenter", () => {
    window.clearInterval(autoplayId);
  });

  carousel.addEventListener("mouseleave", restartAutoplay);

  renderSlide(activeIndex);
  restartAutoplay();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHeroCarousel, { once: true });
} else {
  initHeroCarousel();
}
