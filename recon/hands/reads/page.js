JSON.stringify({
  href: location.href,
  innerWidth: innerWidth,
  innerHeight: innerHeight,
  devicePixelRatio: devicePixelRatio,
  maxTouchPoints: navigator.maxTouchPoints,
  api: Array.from(new Set(performance.getEntriesByType("resource").map(function (entry) {
    try {
      var url = new URL(entry.name);
      return url.pathname.indexOf("/api/") === 0 ? url.host + url.pathname : null;
    } catch (e) {
      return null;
    }
  }).filter(Boolean))).sort()
})
