// Định dạng biển số ngay khi nhập, kiểu biển Việt Nam.
// Ô tô: 51K-123.45 · Xe máy: 59-X1 234.56 · Giữ nguyên vị trí con trỏ.

import { normalizeLookupPlate, type LookupPlate } from '../../lib/lookup';

const ALNUM = /[^0-9A-Za-z]/g;
const ALNUM_ONE = /[0-9A-Z]/;

export const MAX_PLATE_CHARS = 9;
export const MAX_PLATE_LENGTH = 14;

export function plateCompact(raw: string): string {
  return raw.toUpperCase().replace(ALNUM, '').slice(0, MAX_PLATE_CHARS);
}

function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}.${digits.slice(3, 5)}`;
}

function caretAfterAlnum(value: string, alnumCount: number): number {
  if (alnumCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (ALNUM_ONE.test(value[index])) {
      seen += 1;
      if (seen === alnumCount) return index + 1;
    }
  }
  return value.length;
}

export interface PlateTyping {
  value: string;
  caret: number;
}

// Người dùng gõ dấu "-" ngay sau 2 số tỉnh ⇒ ý định biển xe máy (59-X1 234.56).
function wantsMotorbikeLayout(raw: string): boolean {
  return /^\s*\d{2}\s*-/.test(raw);
}

export function formatPlateTyping(raw: string, caret: number = raw.length): PlateTyping {
  const safeCaret = Math.min(Math.max(caret, 0), raw.length);
  const alnumBefore = raw.slice(0, safeCaret).replace(ALNUM, '').length;
  const compact = plateCompact(raw);
  if (!compact) return { value: '', caret: 0 };

  const province = compact.slice(0, 2);
  const rest = compact.slice(2);
  // Biển 9 ký tự có series chữ+số (59X1 23456) là xe máy; biển 8 ký tự
  // 51K12345 vẫn là ô tô. Chỉ chốt khi đã đủ 9 ký tự để không phá biển ô tô.
  const motorbike = wantsMotorbikeLayout(raw)
    || (compact.length === 9 && /^[A-Z]\d$/.test(rest.slice(0, 2)));

  if (!rest) {
    // Giữ dấu "-" vừa gõ sau mã tỉnh để ý định biển xe máy không bị mất.
    if (motorbike) return { value: `${province}-`, caret: `${province}-`.length };
    return { value: province, caret: caretAfterAlnum(province, alnumBefore) };
  }

  // Biển đủ 9 ký tự (2 tỉnh + 2 series + 5 số) mới chắc chắn series 2 ký tự.
  const seriesLength = motorbike || compact.length >= 9 ? 2 : 1;
  const series = rest.slice(0, seriesLength);
  const digits = rest.slice(seriesLength);

  const value = motorbike
    ? `${province}-${series}${digits ? ` ${groupDigits(digits)}` : ''}`
    : `${province}${series}${digits ? `-${groupDigits(digits)}` : ''}`;

  return { value, caret: caretAfterAlnum(value, alnumBefore) };
}

export interface CitizenPlateLookup extends LookupPlate {
  fallback?: LookupPlate;
}

// Dùng chung cho ô nhập và lớp gọi API: biển compact 9 ký tự dạng 59X123456
// được hiểu là xe máy 59-X1 234.56, kèm dạng ô tô để fallback nếu tra rỗng.
export function normalizeCitizenPlate(raw: string): CitizenPlateLookup | null {
  const base = normalizeLookupPlate(raw);
  if (!base) return null;
  const compact = plateCompact(raw);
  if (compact.length !== 9 || !/^[A-Z]\d$/.test(compact.slice(2, 4))) return base;

  const province = compact.slice(0, 2);
  const series = compact.slice(2, 4);
  const number = `${compact.slice(4, 7)}.${compact.slice(7, 9)}`;
  return {
    plate: `${province}-${series} ${number}`,
    vehicleClass: 'motorbike',
    fallback: {
      plate: `${province}${series}-${number}`,
      vehicleClass: 'car',
    },
  };
}

export function formatPlateValue(raw: string): string {
  return formatPlateTyping(raw).value;
}

// Đặt con trỏ sau khi React đã render giá trị mới.
export function setCaret(input: HTMLInputElement | null, caret: number): void {
  if (!input) return;
  const position = Math.min(caret, input.value.length);
  input.setSelectionRange(position, position);
}
