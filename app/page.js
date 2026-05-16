"use client";

import { useState, useRef, useCallback } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pageImages, setPageImages] = useState({});
  const [translations, setTranslations] = useState({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Tesseract worker — on demand හදනවා, useEffect නෑ
  const getWorker = useCallback(async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: () => {},
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
    });
    return worker;
  }, []);

  const renderPageToCanvas = useCallback(async (doc, pageNum) => {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = canvasRef.current;
    if (!canvas) return null;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  const ocrAndTranslate = useCallback(async (imgData, pageNum) => {
    // Step 1: OCR
    setStatus("📖 Text හොයනවා...");
    let extractedText = "";

    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(imgData);
      extractedText = data.text?.trim() || "";
      await worker.terminate();
    } catch (e) {
      console.error("OCR error:", e);
    }

    if (!extractedText || extractedText.length < 4) {
      setTranslations((prev) => ({
        ...prev,
        [pageNum]: "(පිටුවේ හඳුනාගත හැකි text නොමැත)",
      }));
      return;
    }

    // Step 2: Clean
    const clean = extractedText
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Step 3: Translate via proxy
    setStatus("🌐 සිංහලට translate කරනවා...");

    const chunks = splitChunks(clean, 800);
    const results = [];

    for (const chunk of chunks) {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, source: "en", target: "si" }),
        });
        const data = await res.json();
        results.push(data.translation || `[error: ${data.error}]`);
      } catch (e) {
        results.push(`[translate failed: ${e.message}]`);
      }
    }

    setTranslations((prev) => ({
      ...prev,
      [pageNum]: results.join("\n\n"),
    }));
  }, [getWorker]);

  function splitChunks(text, max) {
    const lines = text.split(/\n+/);
    const chunks = [];
    let cur = "";
    for (const line of lines) {
      if ((cur + "\n" + line).length > max) {
        if (cur) chunks.push(cur.trim());
        cur = line;
      } else {
        cur += (cur ? "\n" : "") + line;
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks.length ? chunks : [text.slice(0, max)];
  }

  const goToPage = useCallback(
    async (pageNum, doc) => {
      const d = doc || pdfDoc;
      if (!d || pageNum < 1 || pageNum > totalPages || busy) return;

      setBusy(true);
      setCurrentPage(pageNum);
      setStatus("📄 Page render කරනවා...");

      try {
        // Render
        let imgData = pageImages[pageNum];
        if (!imgData) {
          imgData = await renderPageToCanvas(d, pageNum);
          if (imgData) {
            setPageImages((prev) => ({ ...prev, [pageNum]: imgData }));
          }
        } else {
          // Draw cached image onto canvas
          await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.getContext("2d").drawImage(img, 0, 0);
              }
              resolve();
            };
            img.src = imgData;
          });
        }

        // Translate if not cached
        if (!translations[pageNum] && imgData) {
          await ocrAndTranslate(imgData, pageNum);
        }
      } catch (err) {
        setTranslations((prev) => ({
          ...prev,
          [pageNum]: `දෝෂයකි: ${err.message}`,
        }));
      }

      setStatus("");
      setBusy(false);
    },
    [pdfDoc, totalPages, busy, pageImages, translations, renderPageToCanvas, ocrAndTranslate]
  );

  const loadPDF = useCallback(
    async (file) => {
      if (!file || busy) return;
      setBusy(true);
      setStatus("📂 PDF load කරනවා...");

      try {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

        const arrayBuffer = await file.arrayBuffer();
        const doc = await getDocument({ data: arrayBuffer }).promise;

        const pages = doc.numPages;
        setPdfDoc(doc);
        setTotalPages(pages);
        setFileName(file.name);
        setCurrentPage(1);
        setPageImages({});
        setTranslations({});
        setBusy(false);
        setStatus("");

        // goToPage with fresh doc reference
        setBusy(true);
        setStatus("📄 Page render කරනවා...");

        const { getDocument: _g, GlobalWorkerOptions: _gw, ...rest } = await import("pdfjs-dist");
        const canvas = canvasRef.current;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        if (canvas) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        }
        const imgData = canvas ? canvas.toDataURL("image/jpeg", 0.9) : null;
        if (imgData) {
          setPageImages({ 1: imgData });
          await ocrAndTranslate(imgData, 1);
        }
      } catch (err) {
        setStatus(`දෝෂයකි: ${err.message}`);
      }

      setStatus("");
      setBusy(false);
    },
    [busy, ocrAndTranslate]
  );

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") loadPDF(file);
  };

  const translationText = translations[currentPage];

  return (
    <div className={styles.container}>
      {!pdfDoc ? (
        <div className={styles.uploadScreen}>
          <div
            className={styles.uploadZone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className={styles.uploadIcon}>📖</div>
            <h1 className={styles.uploadTitle}>Manga සිංහල පරිවර්තකය</h1>
            <p className={styles.uploadSub}>
              PDF upload කරන්න — API key නෑ, සම්පූර්ණයෙන්ම free!
              <br />
              <span className={styles.techNote}>Tesseract OCR + Google Translate</span>
            </p>
            <div className={styles.uploadBtn}>PDF තෝරන්න</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) loadPDF(f);
            }}
          />
        </div>
      ) : (
        <div className={styles.readerScreen}>
          <div className={styles.topBar}>
            <button
              className={styles.iconBtn}
              onClick={() => {
                setPdfDoc(null);
                setFileName("");
                setCurrentPage(1);
                setTotalPages(0);
                setPageImages({});
                setTranslations({});
                setBusy(false);
                setStatus("");
              }}
            >
              ←
            </button>
            <span className={styles.fileLabel}>
              {fileName.length > 25 ? fileName.slice(0, 25) + "..." : fileName}
            </span>
            <span className={styles.pageBadge}>
              {currentPage} / {totalPages}
            </span>
            <button
              className={styles.iconBtn}
              disabled={currentPage <= 1 || busy}
              onClick={() => goToPage(currentPage - 1)}
            >
              ‹
            </button>
            <button
              className={styles.iconBtn}
              disabled={currentPage >= totalPages || busy}
              onClick={() => goToPage(currentPage + 1)}
            >
              ›
            </button>
          </div>

          {status && (
            <div className={styles.statusBar}>
              <span className={styles.spinnerInline} /> {status}
            </div>
          )}

          <div className={styles.readerBody}>
            <div className={styles.pagePanel}>
              <canvas ref={canvasRef} className={styles.pageCanvas} />
            </div>
            <div className={styles.transPanel}>
              <div className={styles.transPanelHead}>
                <span className={styles.transHeadLabel}>සිංහල පරිවර්තනය</span>
                {busy && <span className={styles.busyDot} />}
                {!busy && translationText && <span className={styles.doneTag}>✓</span>}
              </div>
              <div className={styles.transBody}>
                {busy && !translationText ? (
                  <div className={styles.transWaiting}>
                    <div className={styles.spinner} />
                    <p>{status || "සකස් වෙමින්..."}</p>
                  </div>
                ) : translationText ? (
                  <pre className={styles.transText}>{translationText}</pre>
                ) : (
                  <p className={styles.transHint}>පිටුව load වෙමින්...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
