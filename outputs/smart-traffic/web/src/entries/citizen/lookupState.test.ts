import { describe, expect, it } from 'vitest';
import { initialLookupState, lookupReducer } from './lookupState';

interface Row { id: string }

describe('trạng thái tra cứu biển số', () => {
  it('đi từ idle sang loading rồi success', () => {
    let state = initialLookupState<Row>();
    state = lookupReducer(state, { type: 'start', query: '51K-123.45' });
    expect(state.phase).toBe('loading');
    expect(state.items).toEqual([]);
    state = lookupReducer(state, { type: 'success', query: '51K-123.45', items: [{ id: 'VP-1' }], total: 1 });
    expect(state.phase).toBe('success');
    expect(state.items).toHaveLength(1);
    expect(state.message).toContain('51K-123.45');
  });

  it('biển hợp lệ nhưng không có hồ sơ là empty, không phải success rỗng', () => {
    let state = initialLookupState<Row>();
    state = lookupReducer(state, { type: 'start', query: '51K-999.99' });
    state = lookupReducer(state, { type: 'success', query: '51K-999.99', items: [], total: 0 });
    expect(state.phase).toBe('empty');
    expect(state.message).toContain('Chưa có vi phạm');
  });

  it('lỗi giữ lại câu truy vấn để bấm thử lại', () => {
    let state = initialLookupState<Row>();
    state = lookupReducer(state, { type: 'start', query: '51K-123.45' });
    state = lookupReducer(state, { type: 'error', query: '51K-123.45', message: 'Không kết nối được.' });
    expect(state.phase).toBe('error');
    expect(state.query).toBe('51K-123.45');
    expect(state.message).toBe('Không kết nối được.');
  });

  it('reset xoá sạch kết quả cũ', () => {
    let state = lookupReducer(initialLookupState<Row>(), { type: 'start', query: '51K-123.45' });
    state = lookupReducer(state, { type: 'reset' });
    expect(state.phase).toBe('idle');
    expect(state.query).toBe('');
  });
});
