(function () {
  const POPUP_NAME = "themikhsvintage-auth";
  const POPUP_WIDTH = 560;
  const POPUP_HEIGHT = 760;

  const buildPopupFeatures = () => {
    const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
    const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = Math.max(0, dualScreenLeft + Math.round((viewportWidth - POPUP_WIDTH) / 2));
    const top = Math.max(0, dualScreenTop + Math.round((viewportHeight - POPUP_HEIGHT) / 2));

    return [
      `width=${POPUP_WIDTH}`,
      `height=${POPUP_HEIGHT}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");
  };

  const openLoginPopup = (path = "Login.html") => {
    const popup = window.open(path, POPUP_NAME, buildPopupFeatures());

    if (popup) {
      popup.focus();
      return popup;
    }

    window.location.href = path;
    return null;
  };

  window.authPopup = {
    openLoginPopup
  };
})();
