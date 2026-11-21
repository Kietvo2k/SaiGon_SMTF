import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { evidenceKindLabel } from '../../lib/labels';
import { evidenceShortLabel } from './evidenceLabel';
import type { CitizenEvidence } from './citizenApi';
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons';
import { useDialogFocus } from './useDialogFocus';

interface Props {
  items: CitizenEvidence[];
  index: number;
  plate: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}

// Lightbox nằm trên drawer; Esc đóng lightbox trước nhờ stack dialog dùng chung.
export function EvidenceLightbox({ items, index, plate, onIndex, onClose }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [imageState, setImageState] = useState<Record<string, 'loading' | 'ok' | 'error'>>({});
  const item = items[index];
  useDialogFocus(true, onClose, panelRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onIndex((index - 1 + items.length) % items.length);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onIndex((index + 1) % items.length);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex]);

  if (!item) return null;
  const state = imageState[item.url] ?? 'loading';

  return createPortal(
    <div
      className="cz-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="cz-lightbox-panel" ref={panelRef}>
        <div className="cz-lightbox-head">
          <div>
            <p className="cz-kicker">Ảnh bằng chứng · {plate}</p>
            <h2 id={titleId}>{evidenceShortLabel(item.kind)}</h2>
          </div>
          <button type="button" className="cz-icon-btn" onClick={onClose} data-autofocus aria-label="Đóng ảnh bằng chứng">
            <CloseIcon />
          </button>
        </div>

        <div className="cz-lightbox-stage">
          {state !== 'error' ? (
            <img
              key={item.url}
              src={item.url}
              alt={`${evidenceKindLabel(item.kind)} của biển số ${plate}`}
              className={state === 'ok' ? 'is-ready' : ''}
              onLoad={() => setImageState(prev => ({ ...prev, [item.url]: 'ok' }))}
              onError={() => setImageState(prev => ({ ...prev, [item.url]: 'error' }))}
            />
          ) : (
            <div className="cz-lightbox-missing" role="alert">
              <AlertIcon width={28} height={28} />
              <p>Không tải được ảnh này. Đường dẫn có thể đã hết hạn.</p>
              <a href={item.url} target="_blank" rel="noreferrer">Mở ảnh gốc trong tab mới</a>
            </div>
          )}
          {state === 'loading' && <div className="cz-lightbox-loading" aria-hidden="true" />}
          {items.length > 1 && (
            <>
              <button
                type="button"
                className="cz-lightbox-nav is-prev"
                aria-label="Ảnh trước"
                onClick={() => onIndex((index - 1 + items.length) % items.length)}
              >
                <ChevronLeftIcon width={24} height={24} />
              </button>
              <button
                type="button"
                className="cz-lightbox-nav is-next"
                aria-label="Ảnh sau"
                onClick={() => onIndex((index + 1) % items.length)}
              >
                <ChevronRightIcon width={24} height={24} />
              </button>
            </>
          )}
        </div>

        <div className="cz-lightbox-foot">
          <span>{items.length > 1 ? `Ảnh ${index + 1} / ${items.length}` : '1 ảnh'}</span>
          <span>Dùng phím ← → để chuyển ảnh · Esc để đóng</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
