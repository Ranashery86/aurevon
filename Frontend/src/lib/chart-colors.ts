// Shared per-service bar color mapping so every chart instance in the app uses
// the same colors for the same service. Colors stay within the navy/coral brand
// palette — never plain white, which is reserved for the donut chart's
// "remaining"/background slice.
export const SERVICE_BAR_COLORS: Record<string, string> = {
  "AI Content Writing": "#2a9d8f", // muted teal
  "Lead Generation": "#0f2a4a", // dark navy (brand)
  "Website Crawler": "#ff6b5b", // coral-orange accent (brand)
  Other: "#e0a83f", // warm amber (aggregated/unknown-key usage)
};

// Fallback for any future/unknown service. Warm amber keeps the palette
// cohesive instead of falling back to a random or white color.
export const DEFAULT_SERVICE_BAR_COLOR = "#e0a83f";

export function serviceBarColor(name: string): string {
  return SERVICE_BAR_COLORS[name] ?? DEFAULT_SERVICE_BAR_COLOR;
}