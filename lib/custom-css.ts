const MAX_CUSTOM_CSS_BYTES = 20 * 1024;
const FORBIDDEN = /@import|@font-face|url\s*\(|expression\s*\(|javascript:|-moz-binding|behavior\s*:|<\s*\/?\s*style/i;

export function sanitizeCustomCss(input: string) {
  const css = input.trim();
  if (!css) return null;
  if (Buffer.byteLength(css, "utf8") > MAX_CUSTOM_CSS_BYTES) {
    throw new Error("Custom CSS must be 20 KB or smaller");
  }
  if (FORBIDDEN.test(css)) {
    throw new Error("Custom CSS cannot load external resources or contain executable constructs");
  }
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  const normalized: string[] = [];
  while ((match = rule.exec(withoutComments))) {
    if (withoutComments.slice(cursor, match.index).trim()) {
      throw new Error("Custom CSS contains unsupported nested rules");
    }
    const selector = match[1].trim();
    const declarations = match[2].trim();
    if (!selector || !declarations || selector.startsWith("@")) {
      throw new Error("Custom CSS contains an unsupported rule");
    }
    if (/[<>]/.test(selector) || /[<>]/.test(declarations)) {
      throw new Error("Custom CSS contains invalid characters");
    }
    normalized.push(`${selector} { ${declarations} }`);
    cursor = rule.lastIndex;
  }
  if (!normalized.length || withoutComments.slice(cursor).trim()) {
    throw new Error("Custom CSS could not be parsed");
  }
  return normalized.join("\n");
}

export function scopeCustomCss(css: string | null | undefined, pageId: string) {
  if (!css) return null;
  const root = `[data-status-page="${pageId}"]`;
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_rule, selectors: string, declarations: string) => {
    const scoped = selectors
      .split(",")
      .map((selector) => selector.trim())
      .map((selector) => {
        if (selector === ":root" || selector === "html" || selector === "body") return root;
        return `${root} ${selector}`;
      })
      .join(", ");
    return `${scoped} {${declarations}}`;
  });
}
