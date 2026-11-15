export const DAY = 86_400_000;
export const HKT = 8 * 3_600_000;
export const PLAN_ID = 'christmas-2026';
export const dateKey = (ms) => new Date(ms + HKT).toISOString().slice(0, 10);
export const midnight = (date) => Date.parse(date + 'T00:00:00+08:00');
export const dayDate = (plan, index) => plan.start + index * DAY;
export const endDate = (plan) => dayDate(plan, plan.days.length - 1);
export const readable = (plan, index, now) =>
  Number.isInteger(index) && index >= 0 && index < plan.days.length && dayDate(plan, index) <= now;
export const todayIndex = (plan, now) =>
  Math.min(plan.days.length - 1, Math.max(0, Math.floor((now - plan.start) / DAY)));
export const defaultPlan = {
  id: PLAN_ID,
  title: 'Christmas Countdown',
  subtitle: '24 Days of Luke',
  mode: 'countdown',
  start: midnight('2026-12-01'),
  days: Array.from({length: 24}, (_, index) => 'LUK ' + (index + 1)),
};
export const stages = [
  ['蛋', 'Egg'], ['蛋殼裂開', 'Cracking Egg'], ['初生雛鳥', 'Hatchling'],
  ['幼鳥', 'Little Bird'], ['展翅練習', 'Growing Bird'], ['年輕雄鷹', 'Young Eagle'], ['雄鷹', 'Eagle'],
];
export function stageIndex(count, total) {
  if (count <= 0) return 0;
  if (count >= total) return 6;
  const progress = Math.floor(24 * count / total);
  return 1 + [4, 8, 13, 18].filter((boundary) => progress >= boundary).length;
}
export function currentPlan(plans, now) {
  const sorted = [...plans].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return sorted.filter((plan) => plan.start <= now).at(-1) ?? sorted[0];
}
export function parseDays(text, books) {
  const entries = text.trim().split(/[\n,，]+/).map((part) => part.trim().toUpperCase());
  if (entries.length > 366) throw Error('每個計劃最多 366 日。');
  return entries.map((entry) => {
    const match = /^(\w{3})\s+([1-9]\d{0,2})$/.exec(entry);
    if (!match || !Object.hasOwn(books, match[1]) || +match[2] > books[match[1]][1]) {
      throw Error('請檢查章節代碼與章數，例如 LUK 1：' + entry);
    }
    return match[1] + ' ' + match[2];
  });
}
export function sequence(book, first, last, books) {
  if (!Object.hasOwn(books, book) || !Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > books[book][1]) {
    throw Error('請輸入該書卷內的有效章數範圍。');
  }
  return Array.from({length: last - first + 1}, (_, i) => book + ' ' + (first + i));
}
