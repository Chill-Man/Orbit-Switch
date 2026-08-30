export function WaterProgressLayers() {
  return (
    <span className="quota-water__layers" aria-hidden="true">
      <svg className="quota-water__wave quota-water__wave--rear" viewBox="0 0 400 18" preserveAspectRatio="none" focusable="false">
        <path className="quota-water__body" d="M0 5 C16 1 33 8 50 4 S84 1 102 5 S137 9 156 4 S185 1 200 5 C216 1 233 8 250 4 S284 1 302 5 S337 9 356 4 S385 1 400 5 L400 18 L0 18 Z" />
        <path className="quota-water__surface" d="M0 5 C16 1 33 8 50 4 S84 1 102 5 S137 9 156 4 S185 1 200 5 C216 1 233 8 250 4 S284 1 302 5 S337 9 356 4 S385 1 400 5" />
      </svg>
      <svg className="quota-water__wave quota-water__wave--front" viewBox="0 0 400 18" preserveAspectRatio="none" focusable="false">
        <path className="quota-water__body" d="M0 6 C12 9 26 2 43 5 S73 9 91 4 S124 1 143 5 S179 9 200 6 C212 9 226 2 243 5 S273 9 291 4 S324 1 343 5 S379 9 400 6 L400 18 L0 18 Z" />
        <path className="quota-water__surface" d="M0 6 C12 9 26 2 43 5 S73 9 91 4 S124 1 143 5 S179 9 200 6 C212 9 226 2 243 5 S273 9 291 4 S324 1 343 5 S379 9 400 6" />
      </svg>
      <span className="quota-water__caustics" />
      <span className="quota-water__bubbles" />
      <span className="quota-water__gloss" />
    </span>
  );
}
