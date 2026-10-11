import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

// The rank up share card (frontend RankUpCard) as a 1080×1080 PNG for email: satori lays it out as SVG with the
// text as paths (so the server needs no fonts), resvg rasterizes it.

export const RANK_COLORS = {
  Intern: "#9ca3af",
  Junior: "#60a5fa",
  Mid: "#2dd4bf",
  Senior: "#fbbf24",
  Staff: "#fb923c",
  Principal: "#c084fc",
  Distinguished: "#fbbf24",
};
export const rankColor = (rank) => RANK_COLORS[rank] ?? "#8BACFF";

const require = createRequire(import.meta.url);
const font = (weight) =>
  readFile(require.resolve(`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`));
let fonts;
const loadFonts = () =>
  (fonts ??= Promise.all([font(400), font(700)]).then(([regular, bold]) => [
    { name: "JetBrains Mono", data: regular, weight: 400 },
    { name: "JetBrains Mono", data: bold, weight: 700 },
  ]));

/** satori element: h("div", style, ...children). */
const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children } });

// The font subset has no "→", so the arrow is drawn.
const arrow = {
  type: "svg",
  props: {
    width: 28,
    height: 20,
    viewBox: "0 0 28 20",
    style: { margin: "0 14px" },
    children: { type: "path", props: { d: "M2 10h22M16 3l8 7-8 7", stroke: "#4b5563", strokeWidth: 2.5, fill: "none" } },
  },
};

const stat = (label, value) =>
  h(
    "div",
    { flexDirection: "column", alignItems: "center", gap: 12 },
    h("span", { color: "#ACB2BE", fontSize: 20, letterSpacing: 2 }, label),
    h("span", { color: "#F2F3F5", fontSize: 48, fontWeight: 700 }, value),
  );

/** PNG buffer of the card. */
export async function rankCardPng({ newRank, previousRank, problemsSolved, totalPoints, currentStreak, username }) {
  const accent = rankColor(newRank);
  const bar = { backgroundColor: "#202226", justifyContent: "space-between", alignItems: "center" };
  const svg = await satori(
    h(
      "div",
      {
        width: 1080,
        height: 1080,
        flexDirection: "column",
        backgroundColor: "#151618",
        border: `3px solid ${accent}`,
        boxSizing: "border-box", // the border inside the 1080 square, not 6px past it
        borderRadius: 24,
        overflow: "hidden",
        fontFamily: "JetBrains Mono",
      },
      h(
        "div",
        { ...bar, padding: "32px 48px", borderBottom: "1px solid #383C43" },
        h("span", { color: "#F2F3F5", fontSize: 36, fontWeight: 700 }, "bug.dr"),
        h("span", { color: "#ACB2BE", fontSize: 24 }, "bugdr.app"),
      ),
      h(
        "div",
        { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 80px" },
        h("div", { color: "#ACB2BE", fontSize: 22, letterSpacing: 8, marginBottom: 48 }, "RANKED UP"),
        h("div", { color: accent, fontSize: 96, fontWeight: 700, marginBottom: 24 }, newRank),
        h("div", { color: "#4b5563", fontSize: 28, alignItems: "center", marginBottom: 64 }, previousRank, arrow, newRank),
        h("div", { width: "100%", height: 1, backgroundColor: "#383C43", marginBottom: 48 }),
        h(
          "div",
          { justifyContent: "space-around", width: "100%" },
          stat("PROBLEMS", String(problemsSolved)),
          stat("POINTS", totalPoints.toLocaleString("en-US")),
          stat("STREAK", `${currentStreak}d`),
        ),
      ),
      h(
        "div",
        { ...bar, padding: "28px 48px", borderTop: "1px solid #383C43" },
        h("span", { color: "#ACB2BE", fontSize: 24 }, `@${username}`),
        h("span", { color: "#4b5563", fontSize: 20 }, "bugdr.app"),
      ),
    ),
    { width: 1080, height: 1080, fonts: await loadFonts() },
  );
  return new Resvg(svg).render().asPng();
}
