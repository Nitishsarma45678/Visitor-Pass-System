import { useEffect, useRef, useState } from "react";
import { decodeQR } from "@/lib/qr.js";

export default function Scanner({ onDetect }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let raf = 0, stream, jsqr;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const loop = () => {
      const v = videoRef.current;
      if (!v) { raf = requestAnimationFrame(loop); return; }
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsqr?.(img.data, canvas.width, canvas.height);
        if (code?.data) {
          cancelAnimationFrame(raf);
          onDetect(decodeQR(code.data));
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };

    (async () => {
      try {
        const mod = await import("jsqr");
        jsqr = mod.default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          raf = requestAnimationFrame(loop);
        }
      } catch (e) {
        setErr(e.message || "Camera error");
      }
    })();

    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks()?.forEach(t => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="grid gap-2">
      {err && <div className="text-sm text-red-600">{err}</div>}
      <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-video" />
    </div>
  );
}
