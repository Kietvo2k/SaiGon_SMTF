export interface LookupPlate { plate: string; vehicleClass: 'car' | 'motorbike'; }

// Backend đối chiếu cả hai dạng khi biển viết liền có thể thuộc hai loại xe.
export function normalizeLookupPlate(raw: string): LookupPlate | null {
  const text = raw.trim().toUpperCase();
  if (!/^[0-9A-Z.\-\s]+$/.test(text)) return null;
  const match = /^(\d{2})([A-Z]\d?)(\d{5})$/.exec(text.replace(/[.\-\s]/g, ''));
  if (!match) return null;
  const [, province, series, digits] = match;
  const number = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (/^\d{2}-/.test(text) && series.length === 2) return {plate:`${province}-${series} ${number}`,vehicleClass:'motorbike'};
  return {plate:`${province}${series}-${number}`,vehicleClass:'car'};
}
