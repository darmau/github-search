/** 1234 → "1.2K" */
export function formatCount(n: number): string {
  const compactNumber = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return compactNumber.format(n)
}

/** 1234567 → "1,234,567" */
export function formatNumber(n: number): string {
  const numberFormat = new Intl.NumberFormat("en");
  return numberFormat.format(n)
}
