import { useEffect, useRef, useState } from "react";

interface QrScannerProps {
  /** Called when a QR code is detected */
  onScan: (data: string) => void;
  /** Called when user taps X to close */
  onClose: () => void;
}

/**
 * Live QR code scanner using Web Camera API + jsQR.
 *
 * Opens the back camera as a live video feed, scans each frame for
 * QR codes using jsQR (pure JS), and calls onScan when one is found.
 * No native plugins, no photo-taking — just point and scan.
 *
 * Works in WKWebView on iOS 14.5+.
 */
export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanningRef = useRef(true);

  useEffect(() => {
    let animFrameId: number;
    let jsQR: typeof import("jsqr").default;

    async function start() {
      // Load jsQR
      const mod = await import("jsqr");
      jsQR = mod.default;

      // Get camera stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scan();
        }
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("NotAllowed") || msg.includes("Permission")) {
          setError("Camera access denied. Open Settings → webhouse.app → Camera to enable.");
        } else {
          setError(`Camera error: ${msg}`);
        }
      }
    }

    function scan() {
      if (!scanningRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrameId = requestAnimationFrame(scan);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        animFrameId = requestAnimationFrame(scan);
        return;
      }

      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (result?.data) {
        scanningRef.current = false;
        onScan(result.data);
        return;
      }

      animFrameId = requestAnimationFrame(scan);
    }

    void start();

    return () => {
      scanningRef.current = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black safe-top safe-bottom">
      {/* Close button */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 safe-top"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-sm text-white/70">Scan QR code</span>
        <div className="w-10" />
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : (
        <>
          {/* Live camera feed */}
          <video
            ref={videoRef}
            className="flex-1 object-cover"
            playsInline
            muted
            autoPlay
          />
          {/* Scan target overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-2 border-brand-gold/60 rounded-2xl" />
          </div>
          <p className="absolute bottom-8 left-0 right-0 text-center text-sm text-white/60 safe-bottom">
            Point at the QR code on your CMS screen
          </p>
        </>
      )}

      {/* Hidden canvas for frame analysis */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
