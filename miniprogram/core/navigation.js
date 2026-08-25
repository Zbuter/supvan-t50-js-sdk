function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function computeNavigationMetrics(windowInfo = {}, menuButton = {}) {
  const statusBarHeight = Math.max(0, finiteNumber(windowInfo.statusBarHeight, 24));
  const windowWidth = Math.max(0, finiteNumber(windowInfo.windowWidth, 0));
  const menuLeft = finiteNumber(menuButton.left, NaN);
  const menuTop = finiteNumber(menuButton.top, NaN);
  const menuHeight = finiteNumber(menuButton.height, NaN);
  const hasMenuButton = windowWidth > 0
    && Number.isFinite(menuLeft)
    && Number.isFinite(menuTop)
    && Number.isFinite(menuHeight)
    && menuHeight > 0;

  if (!hasMenuButton) {
    return {
      statusBarHeight,
      menuRightInset: 16,
      navigationHeight: statusBarHeight + 48,
    };
  }

  const menuTopGap = Math.max(0, menuTop - statusBarHeight);
  const navigationBarHeight = Math.max(44, menuHeight + menuTopGap * 2);
  return {
    statusBarHeight,
    menuRightInset: Math.max(16, windowWidth - menuLeft + 8),
    navigationHeight: statusBarHeight + navigationBarHeight,
  };
}

function readNavigationMetrics(wxApi) {
  let windowInfo = {};
  let menuButton = {};
  try {
    windowInfo = wxApi.getWindowInfo ? wxApi.getWindowInfo() : {};
  } catch (_error) {}
  try {
    menuButton = wxApi.getMenuButtonBoundingClientRect ? wxApi.getMenuButtonBoundingClientRect() : {};
  } catch (_error) {}
  return computeNavigationMetrics(windowInfo, menuButton);
}

module.exports = {
  computeNavigationMetrics,
  readNavigationMetrics,
};
