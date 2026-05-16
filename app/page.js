"use client";

import { useState, useRef, useCallback } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pageImages, setPageImages] = useState({});       // raw page images
  const [overlayImages, setOverlayImages] = useState({}); // translated overlay images
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const fileInputRef = useRef(null);
  const hiddenCanvasRef = useRef(null);

  // ── helpers ──────────────────────────────────────────────

  async function translateText(text) {
    if (!text?.trim()) return "";
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "en", target: "si" }),
      });
      const d = await res.json();
      return d.translation || text;
    } catch {
      return text;
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    const lines = [];
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    const totalH = lines.length * lineHeight;
    let startY = y - totalH / 2 + lineHeight / 2;

    for (const l of lines) {
      ctx.fillText(l, x, startY);
      startY += lineHeight;
    }
  }

  // ── OCR + overlay ─────────────────────────────────────────

  const buildOverlay = useCallback(async (imgData, pageNum) => {
    setStatus("📖 Speech bubbles හොයනවා...");

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: () => {},
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
    });

    // PSM 11 = sparse text, gets individual text blocks
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    const { data } = await worker.recognize(imgData);
    await worker.terminate();

    // Get paragraph-level blocks with bounding boxes
    const blocks = data.blocks || [];

    if (!blocks.length) {
      setOverlayImages((prev) => ({ ...prev, [pageNum]: imgData }));
      return;
    }

    setStatus("🌐 සිංහලට translate කරනවා...");

    // Load original image onto hidden canvas
    const img = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = imgData;
    });

    const canvas = hiddenCanvasRef.current;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Scale factor (OCR runs on original, canvas may differ)
    const scaleX = img.width / img.width;
    const scaleY = img.height / img.height;

    // Translate each block and overlay
    for (const block of blocks) {
      const text = block.text?.trim();
      if (!text || text.length < 2) continue;

      const { x0, y0, x1, y1 } = block.bbox;
      const bx = x0 * scaleX;
      const by = y0 * scaleY;
      const bw = (x1 - x0) * scaleX;
      const bh = (y1 - y0) * scaleY;

      if (bw < 20 || bh < 10) continue;

      const translated = await translateText(text);
      if (!translated) continue;

      // White bubble background
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      const r = Math.min(bw, bh) * 0.15;
      ctx.roundRect(bx, by, bw, bh, r);
      ctx.fill();

      // Thin border
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sinhala text
      const fontSize = Math.max(11, Math.min(bh * 0.38, 18));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = "#111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      wrapText(ctx, translated, cx, cy, bw - 8, fontSize * 1.4);
    }

    const overlayData = canvas.toDataURL("image/jpeg", 0.92);
    setOverlayImages((prev) => ({ ...prev, [pageNum]: overlayData }));
  }, []);

  // ── page rendering ────────────────────────────────────────

  const renderAndProcess = useCallback(async (doc, pageNum) => {
    setBusy(true);
    setStatus("📄 Page render කරනවා...");

    try {
      let imgData = pageImages[pageNum];

      if (!imgData) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = hiddenCanvasRef.current;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        imgData = canvas.toDataURL("image/jpeg", 0.92);
        setPageImages((prev) => ({ ...prev, [pageNum]: imgData }));
      }

      if (!overlayImages[pageNum]) {
        await buildOverlay(imgData, pageNum);
      }
    } catch (err) {
      setStatus(`දෝෂය: ${err.message}`);
    }

    setStatus("");
    setBusy(false);
  }, [pageImages, overlayImages, buildOverlay]);

  const goToPage = useCallback(async (num, doc) => {
    const d = doc || pdfDoc;
    if (!d || num < 1 || num > totalPages || busy) return;
    setCurrentPage(num);
    await renderAndProcess(d, num);
  }, [pdfDoc, totalPages, busy, renderAndProcess]);

  const loadPDF = useCallback(async (file) => {
    if (!file || busy) return;
    setBusy(true);
    setStatus("📂 PDF load කරනවා...");

    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      const buf = await file.arrayBuffer();
      const doc = await getDocument({ data: buf }).promise;

      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setFileName(file.name);
      setCurrentPage(1);
      setPageImages({});
      setOverlayImages({});
      setBusy(false);

      await renderAndProcess(doc, 1);
    } catch (err) {
      setStatus(`දෝෂය: ${err.message}`);
      setBusy(false);
    }
  }, [busy, renderAndProcess]);

  // ── UI ────────────────────────────────────────────────────

  const displayImg = showOriginal
    ? pageImages[currentPage]
    : overlayImages[currentPage] || pageImages[currentPage];

  return (
    <div className={styles.container}>
      <canvas ref={hiddenCanvasRef} style={{ display: "none" }} />

      {!pdfDoc ? (
        <div className={styles.uploadScreen}>
          <div
            className={styles.uploadZone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") loadPDF(f); }}
          >
            <div className={styles.uploadIcon}>📖</div>
            <h1 className={styles.uploadTitle}>Manga සිංහල පරිවර්තකය</h1>
            <p className={styles.uploadSub}>
              Speech bubbles සිංහලට — image එකේ මතම!
              <br />
              <span className={styles.techNote}>Tesseract OCR + Google Translate</span>
            </p>
            <div className={styles.uploadBtn}>PDF තෝරන්න</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files[0]; if (f) loadPDF(f); }} />
        </div>
      ) : (
        <div className={styles.readerScreen}>
          <div className={styles.topBar}>
            <button className={styles.iconBtn} onClick={() => {
              setPdfDoc(null); setFileName(""); setCurrentPage(1);
              setTotalPages(0); setPageImages({}); setOverlayImages({});
              setBusy(false); setStatus("");
            }}>←</button>

            <span className={styles.fileLabel}>
              {fileName.length > 20 ? fileName.slice(0, 20) + "..." : fileName}
            </span>

            <span className={styles.pageBadge}>{currentPage} / {totalPages}</span>

            <button
              className={`${styles.toggleBtn} ${showOriginal ? styles.toggleActive : ""}`}
              onClick={() => setShowOriginal((v) => !v)}
            >
              {showOriginal ? "Original" : "සිංහල"}
            </button>

            <button className={styles.iconBtn} disabled={currentPage <= 1 || busy}
              onClick={() => goToPage(currentPage - 1)}>‹</button>
            <button className={styles.iconBtn} disabled={currentPage >= totalPages || busy}
              onClick={() => goToPage(currentPage + 1)}>›</button>
          </div>

          {status && (
            <div className={styles.statusBar}>
              <span className={styles.spinnerInline} /> {status}
            </div>
          )}

          <div className={styles.pageViewer}>
            {displayImg ? (
              <img src={displayImg} alt={`Page ${currentPage}`} className={styles.pageImg} />
            ) : (
              <div className={styles.pageLoading}>
                <div className={styles.spinner} />
                <p>{status || "load වෙමින්..."}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
