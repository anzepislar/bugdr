import { useCallback, type RefObject } from "react";

/** The card SVG as a 1080×1080 PNG canvas: serialize → <img> → canvas. */
async function renderCard(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class"); // the on-screen CSS size; the file keeps width/height 1080
  clone.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    canvas.getContext("2d")!.drawImage(img, 0, 0, 1080, 1080);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downloads or copies a 1080×1080 share card SVG as a PNG. No html2canvas needed, and the card has no external
 * images or foreignObject, so the canvas is never tainted.
 */
export function useCardDownload(cardRef: RefObject<SVGSVGElement | null>) {
  const download = useCallback(
    async (filename: string) => {
      if (!cardRef.current) return;
      const link = document.createElement("a");
      link.download = filename;
      link.href = (await renderCard(cardRef.current)).toDataURL("image/png");
      link.click();
    },
    [cardRef],
  );

  /** Puts the PNG on the clipboard. The ClipboardItem gets a promise so Safari still sees the click. */
  const copy = useCallback(async () => {
    const svg = cardRef.current;
    if (!svg) throw new Error("No card");
    const png = renderCard(svg).then(
      (canvas) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png")),
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  }, [cardRef]);

  return { download, copy };
}
