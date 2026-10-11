import { useCallback, type RefObject } from "react";

/**
 * Downloads a 1080×1080 share card SVG as a PNG: serialize → <img> → canvas. No html2canvas needed, and the
 * card has no external images or foreignObject, so the canvas is never tainted.
 */
export function useCardDownload(cardRef: RefObject<SVGSVGElement | null>) {
  const download = useCallback(
    async (filename: string) => {
      const svg = cardRef.current;
      if (!svg) return;
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
        const link = document.createElement("a");
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [cardRef],
  );
  return { download };
}
