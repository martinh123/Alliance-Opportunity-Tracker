import * as React from "react";

/**
 * Shared resize + size-persistence logic for popups (dialogs, alert dialogs,
 * side sheets). The popup gets a drag handle; the chosen size is stored in
 * localStorage (keyed by an explicit data-size-key attribute or the popup's
 * title) and re-applied next time the same popup opens. All popups are also
 * capped to the viewport so they never overflow the window.
 */

export type PopupResizeMode = "dialog" | "sheet-right";

const MIN_W = 320;
const MIN_H = 180;

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function maxW() {
  return Math.floor(window.innerWidth * 0.95);
}
function maxH() {
  return Math.floor(window.innerHeight * 0.92);
}

export function usePopupSize(mode: PopupResizeMode = "dialog") {
  const elRef = React.useRef<HTMLElement | null>(null);
  const keyRef = React.useRef<string | null>(null);
  const dragCleanupRef = React.useRef<(() => void) | null>(null);

  // Always release drag listeners/body styles if the popup unmounts mid-drag.
  React.useEffect(() => () => dragCleanupRef.current?.(), []);

  const getKey = React.useCallback(() => {
    const el = elRef.current;
    if (!el) return null;
    if (!keyRef.current) {
      const explicit = el.getAttribute("data-size-key");
      const title = el.querySelector("h2")?.textContent?.trim() || "";
      const derived = slug(explicit || title);
      // No usable identity — don't persist rather than colliding on a generic key.
      if (!derived) return null;
      keyRef.current = `popup-size:${mode}:${derived}`;
    }
    return keyRef.current;
  }, [mode]);

  const applySize = React.useCallback(
    (w: number | null, h: number | null) => {
      const el = elRef.current;
      if (!el) return;
      const mw = maxW();
      const mh = maxH();
      if (w != null && Number.isFinite(w)) {
        el.style.width = `${Math.min(Math.max(w, MIN_W), mw)}px`;
        el.style.maxWidth = `${mw}px`;
      }
      if (mode === "dialog" && h != null && Number.isFinite(h)) {
        el.style.height = `${Math.min(Math.max(h, MIN_H), mh)}px`;
        el.style.maxHeight = `${mh}px`;
      }
    },
    [mode],
  );

  /** Attach to the popup content element. Restores the remembered size. */
  const sizeRef = React.useCallback(
    (el: HTMLElement | null) => {
      if (elRef.current === el) return;
      elRef.current = el;
      keyRef.current = null;
      if (!el) return;
      // Defer one frame so the title is rendered before we derive the key.
      requestAnimationFrame(() => {
        if (elRef.current !== el) return;
        const key = getKey();
        if (!key) return;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const s = JSON.parse(raw);
            applySize(typeof s.w === "number" ? s.w : null, typeof s.h === "number" ? s.h : null);
          }
        } catch {
          // localStorage unavailable or corrupted entry — ignore
        }
      });
    },
    [getKey, applySize],
  );

  /** PointerDown handler for the drag handle. */
  const onResizeStart = React.useCallback(
    (e: React.PointerEvent) => {
      const el = elRef.current;
      if (!el || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // pointer capture unsupported — window listeners still work
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = el.offsetWidth;
      const startH = el.offsetHeight;

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (mode === "dialog") {
          // Dialog is centered (translate -50%/-50%), so the visible edge only
          // moves half the width delta — double it so the handle tracks the cursor.
          applySize(startW + dx * 2, startH + dy * 2);
        } else {
          // Right-anchored sheet: dragging the left edge leftwards grows it.
          applySize(startW - dx, null);
        }
      };
      const finish = (persist: boolean) => {
        dragCleanupRef.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onBlur);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          // already released
        }
        const key = getKey();
        const node = elRef.current;
        if (persist && key && node) {
          try {
            localStorage.setItem(key, JSON.stringify({ w: node.offsetWidth, h: node.offsetHeight }));
          } catch {
            // ignore quota/availability errors
          }
        }
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onBlur = () => finish(true);

      dragCleanupRef.current = () => finish(false);
      document.body.style.userSelect = "none";
      document.body.style.cursor = mode === "dialog" ? "nwse-resize" : "ew-resize";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onBlur);
    },
    [mode, applySize, getKey],
  );

  return { sizeRef, onResizeStart };
}

/** Merge a forwarded ref with the size ref, keeping a stable identity across renders. */
export function useComposedSizeRef<T extends HTMLElement>(
  forwarded: React.ForwardedRef<T>,
  sizeRef: (el: HTMLElement | null) => void,
) {
  return React.useCallback(
    (node: T | null) => {
      sizeRef(node);
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded, sizeRef],
  );
}
