import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface QRScannerProps {
    onScan: (result: string) => void;
    onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Start scanning
        const qrScannerId = "qr-reader";
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        const scanner = new Html5Qrcode(qrScannerId);
        scannerRef.current = scanner;

        const startScanner = async () => {
            try {
                // Try environment facing camera first
                try {
                    await scanner.start(
                        { facingMode: "environment" },
                        config,
                        (decodedText) => {
                            onScan(decodedText);
                            stopScanner();
                        },
                        () => { }
                    );
                } catch (envError) {
                    console.warn("Failed to start environment camera, trying user facing/default:", envError);
                    // Fallback to default camera (useful for PC/Webcam)
                    await scanner.start(
                        { facingMode: "user" },
                        config,
                        (decodedText) => {
                            onScan(decodedText);
                            stopScanner();
                        },
                        () => { }
                    );
                }
            } catch (err) {
                console.error("Failed to start scanner:", err);
                setError("无法打开摄像头，请确保已授予摄像头权限。");
            }
        };

        startScanner();

        return () => {
            stopScanner();
        };
    }, [onScan]);

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
            } catch (err) {
                console.error("Failed to stop scanner:", err);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between text-white z-20"
                style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
            >
                <h3 className="text-lg font-medium tracking-tight">扫码添加</h3>
                <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 rounded-full h-10 w-10">
                    <X className="h-6 w-6" />
                </Button>
            </div>

            {/* Surface for camera */}
            <div className="relative w-full aspect-square max-w-sm rounded-3xl overflow-hidden border-0 shadow-2xl ring-1 ring-white/10 isolate transform-gpu">
                <div id="qr-reader" className="w-full h-full bg-slate-900" />

                {/* Overlay scanning effect */}
                <div className="absolute inset-0 z-10 pointer-events-none">
                    {/* Darkened overlay around scan area if desired, or just corners */}
                    {/* We use just corners for a cleaner look */}

                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-[6px] border-l-[6px] border-primary rounded-tl-2xl m-6 opacity-80" />
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-[6px] border-r-[6px] border-primary rounded-tr-2xl m-6 opacity-80" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[6px] border-l-[6px] border-primary rounded-bl-2xl m-6 opacity-80" />
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[6px] border-r-[6px] border-primary rounded-br-2xl m-6 opacity-80" />

                    {/* Scan line */}
                    <div className="absolute top-0 left-0 w-full h-full p-6">
                        <div className="w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_20px_rgba(var(--primary),0.8)] animate-scan-line" />
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-8 p-4 bg-destructive/90 text-white rounded-xl text-sm font-medium text-center max-w-xs shadow-lg backdrop-blur-md animate-in slide-in-from-bottom-4">
                    {error}
                </div>
            )}

            <div className="mt-8 text-white/80 text-center z-20">
                <div className="flex flex-col items-center gap-4">
                    <p className="text-xs uppercase tracking-widest font-mono opacity-60">
                        将二维码放入框内
                    </p>
                </div>
            </div>

            <style>{`
        @keyframes scan-line {
            0% { transform: translateY(0); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(320px); opacity: 0; }
        }
        .animate-scan-line {
            animation: scan-line 2s ease-in-out infinite;
        }
        /* CSS to force rounded corners on the video element generated by html5-qrcode */
        #qr-reader video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            border-radius: 1.5rem !important; /* Matches rounded-3xl */
        }
        #qr-reader {
            border-radius: 1.5rem !important;
            overflow: hidden !important;
        }
      `}</style>
        </div>
    );
}
