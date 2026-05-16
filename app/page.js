"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  const workerRef = useRef(null);

  // Tesseract worker init
  useEffect(() => {
    let cancelled = false;
    async function initWorker() {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker("eng", 1, {
        logger: () => {},
      });
      if (!cancelled) workerRef.current = w;
    }
    initWorker();
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
    };
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
    setBusy(true);

    try {
      // Step 1: OCR
      setStatus("📖 Text හොයනවා (OCR)...");
      let extractedText = "";

      if (workerRef.current) {
        const { data } = await workerRef.current.recognize(imgData);
        extractedText = data.text?.trim() || "";
      }

      if (!extractedText || extractedText.length < 5) {
        setTranslations((prev) => ({
          ...prev,
          [pageNum]: "(මෙම පිටුවේ text හොයාගත නොහැකි විය — cover හෝ image only page)",
        }));
        setStatus("");
        setBusy(false);
        return;
      }

      // Step 2: Clean text
      const cleanText = extractedText
        .replace(/[^\x20-\x7E\n]/g, " ")
        .replace(/\s{3,}/g, "\n")
        .trim();

      // Step 3: Google Translate via proxy
      setStatus("🌐 සිංහලට translate කරනවා...");

      // Long text chunk කරන්න (Google limit)
      const chunks = splitIntoChunks(cleanText, 800);
      const translatedChunks = [];

      for (const chunk of chunks) {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, source: "en", target: "si" }),
        });
        const data = await res.json();
        if (data.translation) {
          translatedChunks.push(data.translation);
        } else {
          translatedChunks.push(`[translate error: ${data.error}]`);
        }
      }

      const finalTranslation = translatedChunks.join("\n\n");
      setTranslations((prev) => ({ ...prev, [pageNum]: finalTranslation }));
      setStatus("");
    } catch (err) {
      setTranslations((prev) => ({
        ...prev,
        [pageNum]: `දෝෂයකි: ${err.message}`,
      }));
      setStatus("");
    }

    setBusy(false);
  }, []);

  function splitIntoChunks(text, maxLen) {
    const sentences = text.split(/\n+/);
    const chunks = [];
    let current = "";
    for (const s of sentences) {
      if ((current + "\n" + s).length > maxLen) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += (current ? "\n" : "") + s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length ? chunks : [text.slice(0, maxLen)];
  }

  const goToPage = useCallback(
    async (pageNum, doc) => {
      const d = doc || pdfDoc;
      if (!d || pageNum < 1 || pageNum > totalPages) return;
      setCurrentPage(pageNum);
      setBusy(true);
      setStatus("📄 Page load කරනවා...");

      let imgData = pageImages[pageNum];
      if (!imgData) {
        imgData = await renderPageToCanvas(d, pageNum);
        setPageImages((prev) => ({ ...prev, [pageNum]: imgData }));
      } else {
        // Cached image canvas-ට draw කරන්න
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext("2d").drawImage(img, 0, 0);
          }
        };
        img.src = imgData;
      }

      if (!translations[pageNum]) {
        await ocrAndTranslate(imgData, pageNum);
      } else {
        setBusy(false);
        setStatus("");
      }
    },
    [pdfDoc, totalPages, pageImages, translations, renderPageToCanvas, ocrAndTranslate]
  );

  const loadPDF = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      setStatus("📂 PDF load කරනවා...");

      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

      const arrayBuffer = await file.arrayBuffer();
      const doc = await getDocument({ data: arrayBuffer }).promise;

      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setFileName(file.name);
      setCurrentPage(1);
      setPageImages({});
      setTranslations({});

      await goToPage(1, doc);
    },
    [goToPage]
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
              <span className={styles.techNote}>
                Tesseract OCR + Google Translate
              </span>
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
              title="නැවත"
            >
              ←
            </button>

            <span className={styles.fileLabel}>
              {fileName.length > 25
                ? fileName.slice(0, 25) + "..."
                : fileName}
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
            {/* Original page */}
            <div className={styles.pagePanel}>
              <canvas ref={canvasRef} className={styles.pageCanvas} />
            </div>

            {/* Translation */}
            <div className={styles.transPanel}>
              <div className={styles.transPanelHead}>
                <span className={styles.transHeadLabel}>සිංහල පරිවර්තනය</span>
                {busy && <span className={styles.busyDot} />}
                {!busy && translationText && (
                  <span className={styles.doneTag}>✓</span>
                )}
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
