import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Quản lý focus cho dialog tự viết: Esc, trap Tab, khoá cuộn, trả focus.
// Hỗ trợ hai dialog chồng nhau (drawer + lightbox) bằng một stack chung.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogStack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = '';

function lockScroll(): void {
  if (scrollLocks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol('dialog');
    dialogStack.push(id);
    lockScroll();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    const focusFirst = () => {
      const target = panel?.querySelector<HTMLElement>('[data-autofocus]')
        ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    };
    const frame = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => element.offsetParent !== null || element === document.activeElement);
      if (!focusables.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeInside = panel.contains(document.activeElement);
      if (event.shiftKey && (!activeInside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!activeInside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      const index = dialogStack.indexOf(id);
      if (index >= 0) dialogStack.splice(index, 1);
      unlockScroll();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, panelRef]);
}
