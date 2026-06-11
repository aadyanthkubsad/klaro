/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { XCircle, Settings, ScanText, History, Sun, Focus, Crop, Download, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { aiService } from '../../services/aiService';

interface CameraScanProps {
  setView: (v: string) => void;
  setRevisionKit: (kit: any) => void;
}

export const CameraScan = ({ setView, setRevisionKit }: CameraScanProps) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    // We'll show a "Start Camera" screen first or try to start if we already have permission session-wise
    // In many environments, starting immediately is fine if the user previously allowed, 
    // but a manual trigger is more reliable for the first time.
    const checkPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'camera' as any });
        if (result.state === 'granted') {
          startCamera();
        }
      } catch (e) {
        // Fallback for browsers that don't support permissions API for camera
        console.warn("Permissions API check failed:", e);
      }
    };
    checkPermission();

    return () => {
      stopTracks();
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const startCamera = async () => {
    setHasStarted(true);
    try {
      setError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support camera access.");
      }
      
      // Stop existing tracks before starting new ones
      stopTracks();

      const primaryConstraints = { 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
        setStream(mediaStream);
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (firstErr: any) {
        // Fallback to basic constraints if high-res/facingMode fails or timeouts
        console.warn("Primary camera constraints failed, trying fallback:", firstErr);
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(fallbackStream);
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      let errorMessage = "Unable to access camera.";
      
      const msg = (err.message || "").toLowerCase();
      const errName = err.name || "";
      
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || msg.includes('denied') || msg.includes('permission')) {
        errorMessage = "Camera access denied. Please allow camera permissions in your browser settings and refresh or Click 'Retry'.";
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || msg.includes('not found')) {
        errorMessage = "No camera found on this device. Please use the 'Upload' or 'Paste Text' option.";
      } else {
        errorMessage = "Error: " + (err.message || "Unknown error occurred while accessing the camera.");
      }
      
      setError(errorMessage);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        processImage(undefined, dataUrl);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError(null);

      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf', 'text/plain'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|pdf|txt)$/i)) {
        setError('Unsupported file type. Please upload a JPG, PNG, PDF, or TXT file.');
        return;
      }
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`);
        return;
      }

      if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setShowManual(true);
          setManualText(text);
          processImage(text);
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setShowManual(false);
          setCapturedImage(dataUrl);
          processImage(undefined, dataUrl);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const [manualText, setManualText] = useState('');

  const processImage = async (extractedText?: string, overrideImage?: string) => {
    setIsProcessing(true);
    setError(null);
    stopCamera();
    
    try {
      let kitData;
      const currentImg = overrideImage || (!showManual ? capturedImage : null);
      
      if (currentImg && !extractedText) {
        // We have a captured image, use it directly
        const base64Data = currentImg.split(',')[1];
        const mimeType = currentImg.split(',')[0].split(':')[1].split(';')[0];
        
        kitData = await aiService.generateRevisionKit({
          sourceType: 'image',
          imageBase64: base64Data,
          mimeType: mimeType
        });
      } else {
        // Use text input
        const textToProcess = extractedText || (showManual ? manualText : "") || "General Learning Topic";
        kitData = await aiService.generateRevisionKit({
          topic: textToProcess,
          sourceType: 'text'
        });
      }
      
      setRevisionKit(kitData);
      setView('selection');
    } catch (err: any) {
      console.error('Generation failed:', err);
      setError(err.message || 'Unknown AI error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      // ... capture logic ...
      processImage(); // For now, we simulate extraction since we can't do OCR easily without a library
    }
  };

  const [showManual, setShowManual] = useState(false);

  return (
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="min-h-[80vh] flex flex-col items-center justify-center py-10 relative w-full"
    >
      <button 
        onClick={() => {
          stopCamera();
          setView('dashboard');
        }}
        className="absolute left-6 top-6 p-2 text-on-surface-variant hover:text-rose-500 transition-colors z-20"
        title="Exit Camera"
      >
        <XCircle size={32} />
      </button>

      <div className="text-center mb-10 max-w-lg w-full px-6">
        <h2 className="text-3xl font-black mb-2 tracking-tight uppercase">One-Click Revision Kit</h2>
        <p className="text-on-surface-variant font-medium">
          {isProcessing ? "Analyzing Topic & Generating Kit..." : showManual ? "Paste your text content below to generate a revision kit" : "Align textbook page within the frame and click to capture"}
        </p>
      </div>

      <div className="w-full max-w-4xl relative">
        {!showManual ? (
          <div className="aspect-[16/9] relative rounded-3xl overflow-hidden shadow-2xl border-4 border-surface-container bg-slate-800 group">
            {!hasStarted ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center p-8">
                <div className="w-20 h-20 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-6">
                  <ScanText size={40} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Camera Access Required</h3>
                <p className="text-white/60 mb-8 max-w-xs">Allow camera access to scan your textbook or notes for instant revision kits.</p>
                <button 
                  onClick={startCamera}
                  className="px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all"
                >
                  Enable Camera
                </button>
              </div>
            ) : !capturedImage ? (
              <>
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover contrast-115 saturate-110 brightness-110"
                />
                {error && !isProcessing && !capturedImage && !showManual && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-8 text-center z-30">
                    <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mb-4">
                      <Settings size={32} />
                    </div>
                    <p className="text-white font-bold mb-4">{error}</p>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => { setError(null); setShowManual(true); stopCamera(); }}
                        className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-bold text-sm"
                      >
                        Use Manual Upload
                      </button>
                      <button 
                        onClick={startCamera}
                        className="px-6 py-2 bg-primary text-white rounded-full font-bold text-sm"
                      >
                        Retry Camera
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : capturedImage.startsWith('data:application/') ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white">
                <FileText size={64} className="text-primary mb-4" />
                <h3 className="text-xl font-bold">Document Uploaded</h3>
                <p className="text-white/60">{isProcessing ? "Processing content..." : "Ready to generate"}</p>
              </div>
            ) : (
              <img 
                src={capturedImage} 
                alt="Captured" 
                className="w-full h-full object-cover"
              />
            )}
            
            {hasStarted && !capturedImage && !error && (
              <div className="absolute inset-0 flex items-center justify-center p-12 lg:p-20">
                <div className="w-full h-full relative pointer-events-none">
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-3xl shadow-[0_0_20px_rgba(0,88,190,0.5)]" />
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-3xl shadow-[0_0_20px_rgba(0,88,190,0.5)]" />
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-3xl shadow-[0_0_20px_rgba(0,88,190,0.5)]" />
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-3xl shadow-[0_0_20px_rgba(0,88,190,0.5)]" />
                  <motion.div 
                    animate={{ top: ['20%', '80%', '20%'] }} 
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="absolute inset-x-0 h-0.5 bg-primary/60 shadow-[0_0_15px_#0058be] z-10" 
                  />
                </div>
              </div>
            )}

            {hasStarted && !capturedImage && !error && (
              <div className="absolute bottom-0 inset-x-0 p-8 flex items-center justify-between bg-gradient-to-t from-slate-900/40 to-transparent">
                <button className="p-4 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white/20 transition-colors">
                  <Sun size={24} />
                </button>
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 rounded-full bg-white flex items-center justify-center p-1.5 border-4 border-white/30 active:scale-90 transition-transform group/shutter"
                >
                  <div className="w-full h-full bg-white rounded-full border-4 border-surface-container" />
                </button>
                <button className="p-4 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white/20 transition-colors">
                  <History size={24} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border-4 border-surface-container rounded-3xl p-8 shadow-2xl">
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste your study notes, textbook excerpt, or research paper content here..."
              className="w-full h-64 p-6 bg-surface-container-low rounded-2xl border-none focus:ring-2 focus:ring-primary text-on-surface font-medium resize-none text-lg"
            />
            <div className="mt-6 flex justify-end">
              <button
                disabled={!manualText || isProcessing}
                onClick={() => processImage()}
                className="px-12 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-3 shadow-lg"
              >
                {isProcessing ? "Processing..." : "Generate Revision Kit"}
                <ScanText size={20} />
              </button>
            </div>
          </div>
        )}

        {isProcessing && !error && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center rounded-3xl z-30">
            <div className="flex gap-1 mb-4">
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: [1, 2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.2 }}
                  className="w-1.5 h-6 bg-white rounded-full"
                />
              ))}
            </div>
            {capturedImage && <p className="text-white font-black uppercase tracking-widest text-sm mb-2 text-primary-container">Image uploaded successfully</p>}
            <p className="text-white font-black uppercase tracking-[0.3em] text-xs">Generating revision kit...</p>
          </div>
        )}

        {capturedImage && !isProcessing && !error && !showManual && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-3xl z-20">
            <div className="flex gap-4">
              <button 
                onClick={() => { processImage(); }}
                className="px-8 py-3 bg-primary text-white rounded-full font-bold shadow-lg transition-colors flex items-center gap-2"
              >
                <ScanText size={20} /> Generate Kit
              </button>
              <button 
                 onClick={() => { setCapturedImage(null); startCamera(); }}
                 className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-full font-bold shadow-lg transition-colors"
               >
                 Clear Photo
              </button>
            </div>
          </div>
        )}

        {error && !isProcessing && (capturedImage || showManual) && (

          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center rounded-3xl z-30 p-8 text-center border-4 border-rose-500/50">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mb-4">
              <Settings size={32} />
            </div>
            <p className="text-white font-bold mb-4 text-lg max-w-md break-words">{error}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => { setError(null); }}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-bold shadow-lg transition-colors text-sm"
              >
                Dismiss
              </button>
              <button
                onClick={() => { processImage(); }}
                className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full font-bold shadow-lg transition-colors text-sm"
              >
                Retry
              </button>
              {capturedImage && !showManual && (
                 <button
                   onClick={() => { setError(null); setCapturedImage(null); startCamera(); }}
                   className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-full font-bold shadow-lg transition-colors text-sm"
                 >
                   Clear Photo
                 </button>
              )}
              <button
                onClick={() => { setError(null); setCapturedImage(null); setShowManual(true); stopCamera(); }}
                className="px-6 py-2 bg-primary hover:brightness-110 text-white rounded-full font-bold shadow-lg transition-colors text-sm"
              >
                Type/Paste Text Instead
              </button>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload}
        accept="image/*,.pdf,.txt"
        className="hidden" 
      />

      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex gap-4">
          <button 
            onClick={() => {
              setError(null);
              if (!showManual) stopCamera();
              else startCamera();
              setShowManual(!showManual);
            }}
            className="flex items-center gap-3 px-10 py-3 bg-white border border-primary text-primary font-bold rounded-full hover:bg-primary hover:text-white transition-all shadow-md"
          >
            {showManual ? <ScanText size={20} /> : <FileText size={20} />}
            {showManual ? "Use Camera Scan" : "Type/Paste Text"}
          </button>
          <button 
            onClick={() => {
              stopCamera();
              fileInputRef.current?.click();
            }}
            className="flex items-center gap-3 px-10 py-3 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-full hover:bg-surface-container-high transition-colors"
          >
            <Download size={20} />
            Upload File
          </button>
        </div>
        <span className="text-xs font-bold text-outline tracking-wider uppercase">Supported formats: JPG, PNG, PDF, TXT</span>
      </div>

      <div className="mt-12 w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Sun, label: 'Good Lighting', desc: 'Avoid shadows and direct glares.' },
          { icon: Focus, label: 'Steady Focus', desc: 'Hold still for a second for sharp recognition.' },
          { icon: Crop, label: 'Capture All', desc: 'Ensure paragraph is within frame.' },
        ].map((tip, i) => (
          <div key={i} className="p-6 bg-surface-container-low border border-outline-variant rounded-2xl flex items-start gap-4 card-shadow font-inter">
            <div className="p-2.5 bg-primary-container/10 text-primary-container rounded-xl">
              <tip.icon size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold">{tip.label}</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-1">{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
