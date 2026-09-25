function disableImageDrag(root) {
  root.querySelectorAll("img").forEach((img) => (img.draggable = false));
}

disableImageDrag(document);

new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    m.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "IMG") node.draggable = false;
      else disableImageDrag(node);
    });
  });
}).observe(document.body, { childList: true, subtree: true });
