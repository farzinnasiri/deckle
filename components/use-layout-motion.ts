"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
export function useLayoutMotion(
  root: RefObject<HTMLElement | null>,
  key: string,
  reduced: boolean,
  inspecting: boolean,
) {
  const previous = useRef(new Map<Element, DOMRect>());
  const motions = useRef<Animation[]>([]);
  const context = useRef<string | null>(null);
  useLayoutEffect(() => {
    motions.current.forEach((a) => a.cancel());
    motions.current = [];
    const scene = `${inspecting}/${innerWidth}/${innerHeight}`;
    if (context.current !== scene) previous.current.clear();
    context.current = scene;
    const next = new Map<Element, DOMRect>();
    root.current
      ?.querySelectorAll<HTMLElement>("[data-layout-control]")
      .forEach((node) => {
        if (!node.getClientRects().length || node.closest("[hidden]")) return;
        const rect = node.getBoundingClientRect(),
          old = previous.current.get(node);
        next.set(node, rect);
        if (reduced || !previous.current.size) return;
        const scale = node.offsetWidth ? rect.width / node.offsetWidth : 1;
        const dx = old ? (old.left - rect.left) / scale : 0,
          dy = old ? (old.top - rect.top) / scale : 0;
        if (!old || Math.abs(dx) + Math.abs(dy) > 1)
          motions.current.push(
            node.animate(
              [
                {
                  transform: old ? `translate(${dx}px, ${dy}px)` : "scale(.97)",
                  opacity: old ? 1 : 0,
                },
                { transform: "none", opacity: 1 },
              ],
              { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
            ),
          );
      });
    previous.current = next;
    return () => motions.current.forEach((a) => a.cancel());
  }, [root, key, reduced, inspecting]);
}
