export const PRICE_PER_PAGE_INR = 2;

export function calculateEvaluationPrice(pageCount) {
  const pages = Number(pageCount) || 0;
  return Math.round(pages * PRICE_PER_PAGE_INR * 100) / 100;
}

export function formatInr(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
