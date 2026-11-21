import { FormEvent, useEffect, useReducer, useRef, useState } from 'react';
import { formatDateTime, formatPenalty } from '../../lib/format';
import { violationStatusLabel, violationStatusTone } from '../../lib/labels';
import {
  CitizenApiError,
  type CitizenMode,
  type CitizenRecord,
  lookupCitizen,
} from './citizenApi';
import { initialLookupState, lookupReducer } from './lookupState';
import { formatPlateTyping, formatPlateValue, MAX_PLATE_LENGTH, normalizeCitizenPlate, setCaret } from './plate';
import { RecordCard } from './RecordCard';
import { ViolationDrawer } from './ViolationDrawer';
import { AlertIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon, LockIcon, SearchIcon, ShieldIcon } from './icons';
import { PlateChip } from './PlateChip';

const SAMPLE_PLATES = ['51K-123.45', '50H-222.33', '51G-678.90'];

interface Props {
  mode: CitizenMode;
  seed?: { plate: string; nonce: number } | null;
  onRequireLogin: () => void;
}

export function LookupPanel({ mode, seed, onRequireLogin }: Props) {
  const [input, setInput] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [editTick, setEditTick] = useState(0);
  const caretRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  const [state, dispatch] = useReducer(lookupReducer<CitizenRecord>, undefined, initialLookupState<CitizenRecord>);
  const [selected, setSelected] = useState<CitizenRecord | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const loading = state.phase === 'loading';
  const records = state.items.map(record => (
    statusOverrides[record.id] ? { ...record, status: statusOverrides[record.id] } : record
  ));

  const runLookup = async (raw: string) => {
    if (busyRef.current) return;
    const normalized = normalizeCitizenPlate(raw);
    if (!normalized) {
      setFieldError('Biển số chưa đúng định dạng. Ví dụ: 51K-123.45 hoặc 59-X1 234.56.');
      dispatch({ type: 'reset' });
      setCaretAndFocus(input.length);
      inputRef.current?.focus();
      return;
    }
    setFieldError('');
    setInput(normalized.plate);
    setStatusOverrides({});
    busyRef.current = true;
    const request = ++sequence.current;
    dispatch({ type: 'start', query: normalized.plate });
    try {
      const result = await lookupCitizen(mode, normalized.plate);
      if (request !== sequence.current) return;
      dispatch({ type: 'success', query: result.plate, items: result.records, total: result.total });
    } catch (error) {
      if (request !== sequence.current) return;
      const message = error instanceof CitizenApiError
        ? error.message
        : 'Không kết nối được hệ thống tra cứu. Vui lòng thử lại sau.';
      dispatch({ type: 'error', query: normalized.plate, message });
    } finally {
      if (request === sequence.current) busyRef.current = false;
    }
  };

  useEffect(() => {
    if (!seed) return;
    const value = formatPlateValue(seed.plate);
    setInput(value);
    setFieldError('');
    setCaretAndFocus(value.length);
    inputRef.current?.focus();
    void runLookup(value);
  }, [seed]);

  useEffect(() => {
    if (state.phase === 'success' || state.phase === 'empty' || state.phase === 'error') {
      const frame = requestAnimationFrame(() => resultsRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [state.phase, state.query]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    if (element.value !== input) element.value = input;
    const caret = caretRef.current ?? input.length;
    setCaret(element, caret);
    caretRef.current = null;
  }, [input, editTick]);

  const setCaretAndFocus = (caret: number) => {
    caretRef.current = caret;
    setEditTick(tick => tick + 1);
  };

  const handleChange = (raw: string, caret: number) => {
    const next = formatPlateTyping(raw, caret);
    caretRef.current = next.caret;
    setEditTick(tick => tick + 1);
    setInput(next.value);
    setFieldError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    void runLookup(input);
  };

  const useSample = (plate: string) => {
    setInput(plate);
    setFieldError('');
    inputRef.current?.focus();
    void runLookup(plate);
  };

  const focusInput = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  return (
    <>
      <section className="cz-console" aria-labelledby="lookup-title">
        <div className="cz-console-top">
          <p className="cz-console-kicker">
            <span className="cz-live-dot" aria-hidden="true" />
            Tra cứu công khai
          </p>
        </div>
        <h2 id="lookup-title">Nhập biển số xe</h2>
        <p className="cz-console-sub">Xem hồ sơ, ảnh bằng chứng và mức phạt kèm căn cứ pháp lý.</p>

        <form className="cz-lookup-form" onSubmit={submit} noValidate>
          <label className="cz-plate-label" htmlFor="plate-input">Biển số</label>
          <div className={`cz-plate-unit${fieldError ? ' is-invalid' : ''}`}>
            <div className="cz-plate-field">
              <span className="cz-plate-strip" aria-hidden="true">VN</span>
              <input
                ref={inputRef}
                id="plate-input"
                className="cz-plate-input"
                value={input}
                onChange={event => handleChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                placeholder="51K-123.45"
                maxLength={MAX_PLATE_LENGTH}
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="search"
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? 'plate-help plate-error' : 'plate-help'}
              />
            </div>
            <button type="submit" className="cz-lookup-btn" disabled={loading}>
              {loading ? <span className="cz-spinner" aria-hidden="true" /> : <SearchIcon width={19} height={19} />}
              {loading ? 'Đang tra…' : 'Tra cứu'}
            </button>
          </div>
          <p id="plate-help" className="cz-help">
            Ô tô hoặc xe máy. Nhập liền, có dấu chấm hay gạch đều được — 59X123456 tự thành 59-X1 234.56.
          </p>
          {fieldError && <p id="plate-error" className="cz-field-error" role="alert">{fieldError}</p>}
        </form>

        <div className="cz-samples" aria-label="Biển gợi ý để thử">
          <span className="cz-samples-label">Thử nhanh</span>
          <div className="cz-samples-row">
            {SAMPLE_PLATES.map(plate => (
              <button
                key={plate}
                type="button"
                className="cz-sample"
                onClick={() => useSample(plate)}
                disabled={loading}
                aria-label={`Tra cứu biển gợi ý ${plate}`}
              >
                <PlateChip plate={plate} size="sm" />
              </button>
            ))}
          </div>
          <p className="cz-samples-note">Ba biển để thử ở ba trạng thái hồ sơ khác nhau.</p>
        </div>

        <ul className="cz-expect" aria-label="Thông tin bạn nhận được">
          <li><CheckIcon width={16} height={16} /> Hồ sơ đầy đủ</li>
          <li><CheckIcon width={16} height={16} /> Ảnh trước–sau vạch</li>
          <li><CheckIcon width={16} height={16} /> Căn cứ NĐ 168/2024</li>
        </ul>
      </section>

      <section
        ref={resultsRef}
        className={`cz-results${state.phase === 'idle' ? ' is-idle' : ''}`}
        aria-labelledby={state.phase === 'idle' ? undefined : 'results-title'}
        aria-busy={loading}
        tabIndex={-1}
      >
        <p className="cz-sr-only" role="status" aria-live="polite">{state.message}</p>

        {state.phase !== 'idle' && (
          <>
            <div className="cz-results-head">
              <div>
                <p className="cz-kicker">Kết quả tra cứu</p>
                <h2 id="results-title">
                  {(state.phase === 'loading' || state.phase === 'success' || state.phase === 'empty') && (
                    <>Biển <PlateChip plate={state.query} size="sm" /></>
                  )}
                  {state.phase === 'error' && <>Chưa tra được biển {state.query}</>}
                </h2>
              </div>
              <p className="cz-results-meta">
                {loading && 'Đang đối chiếu dữ liệu camera'}
                {state.phase === 'success' && `${state.items.length} hồ sơ · Cập nhật từ hệ thống khu Bắc`}
                {state.phase === 'empty' && 'Biển hợp lệ · 0 hồ sơ công khai'}
                {state.phase === 'error' && 'Kết nối chưa thành công'}
              </p>
            </div>

            {loading && (
              <div className="cz-loading" aria-hidden="true">
                <div className="cz-skeleton cz-skeleton-record">
                  <div className="cz-skeleton cz-skeleton-line is-short" />
                  <div className="cz-skeleton cz-skeleton-line" />
                  <div className="cz-skeleton cz-skeleton-grid">
                    <span /><span /><span /><span />
                  </div>
                </div>
                <div className="cz-skeleton cz-skeleton-row" />
                <div className="cz-skeleton cz-skeleton-row" />
              </div>
            )}

            {state.phase === 'error' && (
              <div className="cz-state cz-state-error" role="alert">
                <span className="cz-state-icon"><AlertIcon width={26} height={26} /></span>
                <div>
                  <h3>Hệ thống chưa trả được kết quả</h3>
                  <p>{state.message}</p>
                  <div className="cz-state-actions">
                    <button type="button" className="cz-btn cz-btn-primary" onClick={() => void runLookup(state.query)}>
                      Thử lại
                    </button>
                    <button type="button" className="cz-btn cz-btn-ghost" onClick={focusInput}>Sửa biển số</button>
                  </div>
                </div>
              </div>
            )}

            {state.phase === 'empty' && (
              <div className="cz-state cz-state-empty">
                <div className="cz-empty-plate" aria-hidden="true">
                  <span>VN</span>
                  <b>—</b>
                </div>
                <div>
                  <h3>Chưa có vi phạm cho biển này</h3>
                  <p>
                    Biển số hợp lệ nhưng chưa có hồ sơ công khai. Nếu bạn vừa nhận thông báo, thử lại sau hoặc đăng nhập
                    để xem hồ sơ gắn với tài khoản của mình.
                  </p>
                  <div className="cz-state-actions">
                    <button type="button" className="cz-btn cz-btn-primary" onClick={focusInput}>
                      Tra biển khác
                    </button>
                    <button type="button" className="cz-btn cz-btn-ghost" onClick={onRequireLogin}>
                      <LockIcon width={17} height={17} /> {mode === 'public' ? 'Khu tài khoản' : 'Đăng nhập'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {state.phase === 'success' && records.length > 0 && (
              <>
                <RecordCard
                  record={records[0]}
                  onOpen={() => setSelected(records[0])}
                />

                {records.length > 1 && (
                  <>
                    <h3 className="cz-list-title">
                      Hồ sơ khác trong lần tra cứu <span>{records.length - 1}</span>
                    </h3>
                    <ul className="cz-violation-list">
                      {records.slice(1).map(record => {
                        const tone = violationStatusTone(record.status);
                        return (
                          <li key={record.id} className="cz-violation">
                            <div className="cz-v-main">
                              <span className="cz-v-label">Vi phạm</span>
                              <p className="cz-v-title">{record.label}</p>
                              <p className="cz-v-sub">
                                <code>{record.code || '—'}</code>
                                {record.place ? ` · ${record.place}` : ''}
                              </p>
                            </div>
                            <div>
                              <span className="cz-v-label">Thời gian</span>
                              <p>{formatDateTime(record.occurredAt)}</p>
                            </div>
                            <div>
                              <span className="cz-v-label">Trạng thái</span>
                              <span className={`cz-status cz-status-${tone}`}>
                                <span className="cz-status-dot" aria-hidden="true" />
                                {violationStatusLabel(record.status)}
                              </span>
                            </div>
                            <div>
                              <span className="cz-v-label">Mức phạt</span>
                              <p>{formatPenalty(record.penalty)}</p>
                            </div>
                            <button
                              type="button"
                              className="cz-btn cz-btn-ghost cz-v-action"
                              onClick={() => setSelected(record)}
                              aria-label={`Xem chi tiết: ${record.label}, biển ${record.plate}`}
                            >
                              Chi tiết
                              <ChevronRightIcon width={17} height={17} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                <div className="cz-next-step">
                  <ShieldIcon width={22} height={22} />
                  <p>
                    <strong>Bạn cho rằng hồ sơ chưa đúng?</strong> Mở chi tiết để xem ảnh bằng chứng, căn cứ điều khoản
                    và gửi khiếu nại ngay tại đây.
                  </p>
                  <button type="button" className="cz-btn cz-btn-ghost cz-next-action" onClick={() => setSelected(records[0])}>
                    Mở hồ sơ mới nhất <ArrowRightIcon width={17} height={17} />
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {selected && (
        <ViolationDrawer
          record={selected}
          mode={mode}
          onClose={() => setSelected(null)}
          onStatusChange={status => {
            setStatusOverrides(previous => ({ ...previous, [selected.id]: status }));
            setSelected(previous => (previous ? { ...previous, status } : previous));
          }}
          onRequireLogin={() => { setSelected(null); onRequireLogin(); }}
        />
      )}
    </>
  );
}
