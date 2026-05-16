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
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  const [renderingPage, setRenderingPage] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const translateAbortRef = useRef(null);

  const renderPage = useCallback(
    async (doc, pageNum) => {
      if (!doc) return;
      setRenderingPage(true);
      try {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const imgData = canvas.toDataURL("image/jpeg", 0.85);
        setPageImages((prev) => ({ ...prev, [pageNum]: imgData }));
        return imgData;
      } finally {
        setRenderingPage(false);
      }
    },
    []
  );

  const translatePage = useCallback(
    async (pageNum, imgData) => {
      if (!imgData) return;
      if (translations[pageNum]) return;

      setLoadingTranslation(true);
      try {
        const base64 = imgData.split(",")[1];
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (data.translation) {
          setTranslations((prev) => ({
            ...prev,
            [pageNum]: data.translation,
          }));
        } else {
          setTranslations((prev) => ({
            ...prev,
            [pageNum]: `දෝෂයකි: ${data.error || "නොදන්නා දෝෂය"}`,
          }));
        }
      } catch (err) {
        setTranslations((prev) => ({
          ...prev,
          [pageNum]: `දෝෂයකි: ${err.message}`,
        }));
      } finally {
        setLoadingTranslation(false);
      }
    },
    [translations]
  );

  const goToPage = useCallback(
    async (newPage, doc) => {
      const docToUse = doc || pdfDoc;
      if (!docToUse || newPage < 1 || newPage > totalPages) return;
      setCurrentPage(newPage);

      let imgData = pageImages[newPage];
      if (!imgData) {
        imgData = await renderPage(docToUse, newPage);
      } else {
        const canvas = canvasRef.current;
        if (canvas) {
          const img = new Image();
          img.onload = () => {
            const ctx = canvas.getContext("2d");
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
          };
          img.src = imgData;
        }
      }

      await translatePage(newPage, imgData);
    },
    [pdfDoc, totalPages, pageImages, renderPage, translatePage]
  );

  const loadPDF = useCallback(
    async (file) => {
      if (!file) return;
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) loadPDF(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") loadPDF(file);
  };

  const translationText = translations[currentPage];
  const currentImg = pageImages[currentPage];

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
              PDF file upload කරන්න — pages automatically සිංහලට translate වේ
            </p>
            <div className={styles.uploadBtn}>PDF තෝරන්න</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      ) : (
        <div className={styles.readerScreen}>
          <div className={styles.topBar}>
            <button
              className={styles.resetBtn}
              onClick={() => {
                setPdfDoc(null);
                setFileName("");
                setCurrentPage(1);
                setTotalPages(0);
                setPageImages({});
                setTranslations({});
              }}
            >
              ← නැවත
            </button>
            <span className={styles.fileNameLabel} title={fileName}>
              {fileName.length > 30 ? fileName.slice(0, 30) + "..." : fileName}
            </span>
            <span className={styles.pageBadge}>
              {currentPage} / {totalPages}
            </span>
            <button
              className={styles.navBtn}
              disabled={currentPage <= 1 || loadingTranslation || renderingPage}
              onClick={() => goToPage(currentPage - 1)}
            >
              ←
            </button>
            <button
              className={styles.navBtn}
              disabled={
                currentPage >= totalPages || loadingTranslation || renderingPage
              }
              onClick={() => goToPage(currentPage + 1)}
            >
              →
            </button>
          </div>

          <div className={styles.readerBody}>
            <div className={styles.pagePanel}>
              <canvas ref={canvasRef} className={styles.pageCanvas} />
              {renderingPage && (
                <div className={styles.pageOverlay}>
                  <div className={styles.spinner} />
                </div>
              )}
            </div>

            <div className={styles.transPanel}>
              <div className={styles.transPanelHeader}>
                <span className={styles.transLabel}>සිංහල පරිවර්තනය</span>
                {loadingTranslation && (
                  <span className={styles.translatingBadge}>
                    <div className={styles.spinnerSmall} /> පරිවර්තනය වෙමින්...
                  </span>
                )}
                {translationText && !loadingTranslation && (
                  <span className={styles.doneBadge}>✓ සූදානම්</span>
                )}
              </div>
              <div className={styles.transContent}>
                {loadingTranslation && !translationText ? (
                  <div className={styles.transLoading}>
                    <div className={styles.spinner} />
                    <p>AI සිංහලට පරිවර්තනය කරමින්...</p>
                  </div>
                ) : translationText ? (
                  <pre className={styles.transText}>{translationText}</pre>
                ) : (
                  <p className={styles.transPlaceholder}>
                    page render වෙමින්...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
