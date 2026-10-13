JSON.stringify((function () {
  var selectors = [
    ".qwen-chat-message",
    ".qwen-chat-message-user",
    ".qwen-chat-message-assistant",
    ".qwen-chat-message img",
    ".qwen-media-skeleton",
    ".message-input-column",
    ".message-input-column-footer-submode",
    ".send-button",
    ".stop-button",
    ".session-list",
    ".list-folder-chats",
    ".chat-item-drag",
    ".chat-item-drag-link",
    ".chat-item-drag-web",
    ".my-library-head",
    ".my-library-content",
    ".user-menu-btn",
    "[class*='scroll-to-bottom']",
    "[class*='scrollToBottom']",
    "[class*='back-to-bottom']"
  ];
  var props = ["fontFamily", "fontSize", "lineHeight", "fontWeight", "color", "backgroundColor", "borderRadius", "padding", "margin", "gap", "boxShadow", "width", "height", "display", "position"];
  return selectors.map(function (selector) {
    return {
      selector: selector,
      elements: Array.prototype.slice.call(document.querySelectorAll(selector), 0, 12).map(function (el) {
        var r = el.getBoundingClientRect();
        var s = getComputedStyle(el);
        var style = {};
        props.forEach(function (p) { style[p] = s[p]; });
        return { box: { x: r.x, y: r.y, width: r.width, height: r.height }, style: style, text: (el.textContent || "").trim().slice(0, 40) };
      })
    };
  });
})())
