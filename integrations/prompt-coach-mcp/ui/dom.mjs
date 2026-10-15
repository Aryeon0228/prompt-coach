// Keep native controls connected across renders: replacing a textarea interrupts
// IME composition and discards its undo history, even if focus is restored.
const propsByNode = new WeakMap();

function setProp(node, name, value, previous) {
  if (name.startsWith('on')) {
    if (previous) node.removeEventListener(name.slice(2), previous);
    if (value) node.addEventListener(name.slice(2), value);
  } else if (name === 'text') {
    const text = value == null ? '' : String(value);
    if (node.textContent !== text) node.textContent = text;
  } else if (name === 'class') {
    if (node.className !== (value ?? '')) node.className = value ?? '';
  } else if (name in node && !name.startsWith('aria-')) {
    // In particular, do not assign an unchanged textarea.value: even assigning
    // the same text can disturb the browser's selection/composition bookkeeping.
    const next = value ?? (typeof node[name] === 'boolean' ? false : '');
    if (node[name] !== next) node[name] = next;
  } else if (value === undefined || value === null || value === false) {
    node.removeAttribute(name);
  } else {
    const next = value === true ? '' : String(value);
    if (node.getAttribute(name) !== next) node.setAttribute(name, next);
  }
}

export function createElement(document, tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  propsByNode.set(node, props);
  for (const child of children) if (child) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function compatible(current, next) {
  return current.nodeType === next.nodeType && current.nodeName === next.nodeName &&
    (current.nodeType !== 1 || current.id === next.id);
}

function updateNode(current, next) {
  if (current.nodeType === 3) {
    if (current.data !== next.data) current.data = next.data;
    return;
  }
  const previousProps = propsByNode.get(current) ?? {};
  const nextProps = propsByNode.get(next) ?? {};
  for (const name of new Set([...Object.keys(previousProps), ...Object.keys(nextProps)])) {
    if (previousProps[name] !== nextProps[name] || name === 'value') setProp(current, name, nextProps[name], previousProps[name]);
  }
  propsByNode.set(current, nextProps);
  reconcileChildren(current, [...next.childNodes]);
}

/** Update existing nodes in place. No remove/reappend of the current input. */
export function reconcileChildren(parent, children) {
  let cursor = parent.firstChild;
  for (const next of children) {
    let current = cursor;
    while (current && !compatible(current, next)) current = current.nextSibling;
    if (!current) {
      parent.insertBefore(next, cursor);
      continue;
    }
    // Remove stale siblings before the match, rather than detaching the match.
    while (cursor !== current) {
      const stale = cursor;
      cursor = cursor.nextSibling;
      stale.remove();
    }
    updateNode(current, next);
    cursor = current.nextSibling;
  }
  while (cursor) {
    const stale = cursor;
    cursor = cursor.nextSibling;
    stale.remove();
  }
}
