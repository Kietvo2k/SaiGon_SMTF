// State machine cho một lần tra cứu: idle → loading → success | empty | error.
// Tách khỏi component để test được toàn bộ chuyển trạng thái.

export type LookupPhase = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface LookupState<T> {
  phase: LookupPhase;
  query: string;
  items: T[];
  message: string;
}

export type LookupAction<T> =
  | { type: 'start'; query: string }
  | { type: 'success'; query: string; items: T[]; total: number }
  | { type: 'error'; query: string; message: string }
  | { type: 'reset' };

export function initialLookupState<T>(): LookupState<T> {
  return { phase: 'idle', query: '', items: [], message: '' };
}

export function lookupReducer<T>(state: LookupState<T>, action: LookupAction<T>): LookupState<T> {
  switch (action.type) {
    case 'start':
      return { phase: 'loading', query: action.query, items: [], message: `Đang tra cứu biển ${action.query}…` };
    case 'success': {
      const count = action.items.length;
      return {
        phase: count ? 'success' : 'empty',
        query: action.query,
        items: action.items,
        message: count
          ? `Tìm thấy ${action.total || count} hồ sơ cho biển ${action.query}.`
          : `Chưa có vi phạm nào cho biển ${action.query}.`,
      };
    }
    case 'error':
      return { phase: 'error', query: action.query, items: [], message: action.message };
    case 'reset':
      return initialLookupState<T>();
    default:
      return state;
  }
}
