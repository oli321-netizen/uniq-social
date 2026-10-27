export const CAPTION_FONTS = [
  { id: "Montserrat", css: "HookMontserrat", file: "Montserrat-Bold.ttf" },
  { id: "Anton", css: "HookAnton", file: "Anton-Regular.ttf" },
  { id: "Bebas Neue", css: "HookBebas", file: "BebasNeue-Regular.ttf" },
  { id: "Poppins", css: "HookPoppins", file: "Poppins-Bold.ttf" },
  { id: "Inter", css: "HookInter", file: "Inter-Bold.ttf" },
  { id: "Lilita One", css: "HookLilita", file: "LilitaOne-Regular.ttf" },
] as const;

export type CaptionFontId = (typeof CAPTION_FONTS)[number]["id"];

export function cssFamily(font: string) {
  const found = CAPTION_FONTS.find((item) => item.id === font);
  return found ? `"${found.css}", Impact, sans-serif` : "Impact, sans-serif";
}

export const FONT_FACE_CSS = CAPTION_FONTS.map(
  (font) =>
    `@font-face{font-family:"${font.css}";src:url("/fonts/${font.file}") format("truetype");font-weight:700;font-style:normal;font-display:swap;}`
).join("");
