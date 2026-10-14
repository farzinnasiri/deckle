"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Download, Share2, X, ZoomIn, ZoomOut } from "lucide-react";
import { PaperMarks } from "./paper";
import { paperVariables } from "@/lib/materials";
import { title, defaultPaper, type Piece } from "@/lib/writing";
import {
  SHARE_FORMATS,
  shareExcerpt,
  imageName,
  xPostUrl,
  mobileSharingDevice,
} from "@/lib/share";
import { renderShareImage } from "@/lib/share-image";
import { machineAudio } from "@/lib/audio";
export function SharePaper({
  piece,
  onClose,
}: {
  piece: Piece;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    image = useRef<HTMLDivElement>(null);
  const [formatId, setFormatId] = useState<string>("portrait"),
    [attempt, setAttempt] = useState(0),
    [zoom, setZoom] = useState(1),
    [mobile, setMobile] = useState(false);
  const format = SHARE_FORMATS.find((f) => f.id === formatId)!;
  const excerpt = useMemo(
    () => shareExcerpt(piece.document, format, zoom),
    [piece.document, format, zoom],
  );
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setMobile(
      mobileSharingDevice(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints,
      ),
    );
    dialog.current?.showModal();
    void machineAudio.unlock().then(() => machineAudio.paperShuffle());
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let alive = true,
      url: string | undefined;
    setBusy(true);
    setError("");
    setMessage("");
    void (async () => {
      if (!alive || !image.current) return;
      const blob = await renderShareImage(image.current, format);
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setPhoto({
        file: new File([blob], imageName(title(piece), format), {
          type: "image/png",
        }),
        url,
      });
      setBusy(false);
    })().catch(() => {
      if (alive) {
        setError("Couldn't create this image. Try another format or retry.");
        setBusy(false);
      }
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [format, piece, attempt, zoom]);
  const download = () => {
    if (!photo || busy) return;
    const link = document.createElement("a");
    link.href = photo.url;
    link.download = photo.file.name;
    link.click();
    setMessage("Image downloaded.");
  };
  const share = async () => {
    if (!photo || busy) return;
    if (navigator.canShare?.({ files: [photo.file] })) {
      try {
        await navigator.share({ files: [photo.file] });
        setMessage("");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setMessage(
            "Sharing isn't available here. Download the image instead.",
          );
      }
      return;
    }
    download();
    setMessage("Image downloaded. Share it from your photos or files.");
  };
  return (
    <dialog
      ref={dialog}
      className="share-dialog"
      aria-labelledby="share-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2 id="share-title">Share your paper</h2>
        <button onClick={onClose} aria-label="Close sharing">
          <X size={20} />
        </button>
      </header>
      <div className="share-preview" aria-busy={busy}>
        {!busy && photo && !error ? (
          <img
            src={photo.url}
            alt={`Image preview of ${title(piece)}${excerpt.truncated ? ", opening excerpt" : ""}`}
          />
        ) : (
          <div>
            <p role="status">{error || "Preparing your image…"}</p>
            {error && (
              <button onClick={() => setAttempt(attempt + 1)}>Retry</button>
            )}
          </div>
        )}
      </div>
      <div className="share-zoom" role="group" aria-label="Text zoom">
        <button
          aria-label="Zoom text out"
          disabled={zoom <= 0.8}
          onClick={() =>
            setZoom((value) =>
              Math.max(0.8, Math.round((value - 0.1) * 10) / 10),
            )
          }
        >
          <ZoomOut size={18} />
        </button>
        <button aria-label="Reset text zoom" onClick={() => setZoom(1)}>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        </button>
        <button
          aria-label="Zoom text in"
          disabled={zoom >= 1.4}
          onClick={() =>
            setZoom((value) =>
              Math.min(1.4, Math.round((value + 0.1) * 10) / 10),
            )
          }
        >
          <ZoomIn size={18} />
        </button>
      </div>
      <div className="share-formats" role="group" aria-label="Image format">
        {SHARE_FORMATS.map((f) => (
          <button
            key={f.id}
            aria-pressed={formatId === f.id}
            onClick={() => setFormatId(f.id)}
            title={`${f.width} × ${f.height}`}
          >
            <span
              className="format-outline"
              style={{ aspectRatio: `${f.width} / ${f.height}` }}
              aria-hidden="true"
            />
            <span>{f.name}</span>
            <small>{f.ratio}</small>
          </button>
        ))}
      </div>
      <div className="share-buttons">
        <button
          disabled={busy || !photo || !!error}
          onClick={download}
          aria-label="Download PNG"
          title="Download PNG"
        >
          <Download size={20} />
        </button>
        <a
          href={xPostUrl(piece)}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={busy || !photo || !!error}
          onClick={(event) => {
            if (busy || !photo || error) {
              event.preventDefault();
              return;
            }
            download();
            setMessage(
              "Attach the downloaded image in X. Your text is already in the composer.",
            );
          }}
          aria-label="Share to X"
          title="Share to X"
        >
          <span className="x-mark" aria-hidden="true">
            𝕏
          </span>
        </a>
        <button
          disabled={
            busy ||
            !photo ||
            !!error ||
            !mobile ||
            !navigator.canShare?.({ files: photo ? [photo.file] : [] })
          }
          onClick={() => void share()}
          aria-label="Share to Instagram"
          title={
            mobile
              ? "Choose Instagram in your phone's share sheet"
              : "Instagram image sharing is available on phones"
          }
        >
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle
              cx="17.5"
              cy="6.5"
              r="1"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </button>
        <button
          disabled={busy || !photo || !!error}
          aria-label="Share image with another app"
          onClick={() => void share()}
        >
          <Share2 size={17} />
        </button>
      </div>
      {message && (
        <p className="share-note" role="status">
          {message}
        </p>
      )}
      <div
        className="share-export"
        ref={image}
        aria-hidden="true"
        style={
          {
            height: (format.height * 840) / format.width,
            "--share-text-zoom": zoom,
          } as CSSProperties
        }
      >
        <article
          style={
            paperVariables(
              piece.document.paper || defaultPaper,
            ) as CSSProperties
          }
        >
          <div className="share-export-heading">
            <span>
              {piece.document.stamp?.name || "A WRITER"} ·{" "}
              {new Date(piece.created).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <h1>{title(piece)}</h1>
          </div>
          <PaperMarks document={excerpt.document} idPrefix="share" />
          <footer>
            <span>deckle</span>
          </footer>
        </article>
      </div>
    </dialog>
  );
}
