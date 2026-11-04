/**
 * Stops the page selecting text while something is being dragged (a panel's resize handle, say). Starting a drag on an
 * empty strip of the page still starts a text selection in the browser, and moving the pointer then selects whatever it
 * passes over. Returns the function that puts things back; call it when the drag ends, however it ends.
 */
export function lockTextSelection(): () => void {
  const style = document.body.style;
  const before = { plain: style.getPropertyValue("user-select"), webkit: style.getPropertyValue("-webkit-user-select") };
  style.setProperty("user-select", "none");
  style.setProperty("-webkit-user-select", "none"); // Safari
  window.getSelection()?.removeAllRanges(); // and drop anything the press had already started selecting
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (before.plain) style.setProperty("user-select", before.plain);
    else style.removeProperty("user-select");
    if (before.webkit) style.setProperty("-webkit-user-select", before.webkit);
    else style.removeProperty("-webkit-user-select");
  };
}
