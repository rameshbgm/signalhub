function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[
        character
      ]!
  );
}

function safeColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b";
}

export function renderStatusBadge(label: string, color: string) {
  const leftWidth = 48;
  const rightWidth = Math.max(92, Math.min(240, label.length * 7 + 18));
  const width = leftWidth + rightWidth;
  const escapedLabel = escapeXml(label);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="status: ${escapedLabel}">
<title>${escapedLabel}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-opacity=".08"/></linearGradient>
<clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${leftWidth}" height="20" fill="#334155"/><rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${safeColor(color)}"/><rect width="${width}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11">
<text x="${leftWidth / 2}" y="14">status</text>
<text x="${leftWidth + rightWidth / 2}" y="14">${escapedLabel}</text>
</g>
</svg>`;
}
