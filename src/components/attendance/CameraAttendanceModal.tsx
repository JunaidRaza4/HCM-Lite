import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import {
  Camera,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  MapPin,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Lock,
  ArrowRight,
  Compass,
} from 'lucide-react';
import { AttendanceRecord, Company } from '../../types';
import { api } from '../../services/api';

interface CameraAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
  onSuccess: (record: AttendanceRecord, distanceMeters?: number) => void;
  onFallbackToWeb: () => void;
  mode?: 'check-in' | 'check-out';
}

export const CameraAttendanceModal: React.FC<CameraAttendanceModalProps> = ({
  isOpen,
  onClose,
  company,
  onSuccess,
  onFallbackToWeb,
  mode = 'check-in',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<number | null>(null);

  // Loading states
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Detection & Liveness states
  // status: 'idle' | 'detecting' | 'liveness_prompt' | 'liveness_verified' | 'locating' | 'submitting' | 'success' | 'error'
  const [stepStatus, setStepStatus] = useState<
    'idle' | 'detecting' | 'liveness_prompt' | 'liveness_verified' | 'locating' | 'submitting' | 'success' | 'error'
  >('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('Initializing camera & face detection...');
  const [detectedFacesCount, setDetectedFacesCount] = useState<number>(0);
  const [livenessInstruction, setLivenessInstruction] = useState<string>('');

  // Extracted telemetry
  const [capturedDescriptor, setCapturedDescriptor] = useState<number[] | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [distanceFromOffice, setDistanceFromOffice] = useState<number | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Baseline landmark for liveness head-turn check
  const baselineNoseXRef = useRef<number | null>(null);
  const livenessPassedRef = useRef<boolean>(false);

  // 1. Load Models on Mount
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadFaceModels = async () => {
      setModelsLoading(true);
      setModelLoadError(null);
      try {
        // Load tiny models from local /models directory
        await Promise.all([
          faceapi.nets.tinyFaceDetector.load('/models'),
          faceapi.nets.faceLandmark68TinyNet.load('/models'),
          faceapi.nets.faceRecognitionNet.load('/models'),
        ]);

        if (isMounted) {
          setModelsLoading(false);
          startCamera();
        }
      } catch (err: any) {
        console.error('Failed to load face-api models:', err);
        if (isMounted) {
          setModelLoadError('Failed to load AI face detection models: ' + (err.message || 'Network error'));
          setModelsLoading(false);
        }
      }
    };

    loadFaceModels();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen]);

  // 2. Start Front Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
          setStepStatus('detecting');
          setFeedbackMessage('Center your face inside the viewfinder.');
          startDetectionLoop();
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setCameraError(
        isDenied
          ? 'Camera permission denied. You can proceed using standard web check-in.'
          : 'Unable to access front camera: ' + (err.message || 'Device not found.')
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (detectionLoopRef.current) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // 3. Real-Time Detection Loop
  const startDetectionLoop = () => {
    baselineNoseXRef.current = null;
    livenessPassedRef.current = false;

    let lastCheckTime = 0;

    const detect = async (time: number) => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        detectionLoopRef.current = requestAnimationFrame(detect);
        return;
      }

      // Throttle detections to ~5 times per second (every 200ms) for smooth browser performance
      if (time - lastCheckTime > 200) {
        lastCheckTime = time;

        try {
          const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,
            scoreThreshold: 0.5,
          });

          const detections = await faceapi
            .detectAllFaces(videoRef.current, options)
            .withFaceLandmarks(true)
            .withFaceDescriptors();

          setDetectedFacesCount(detections.length);

          if (detections.length === 0) {
            // Rule: 0 faces detected
            setFeedbackMessage('No face detected. Please position your face inside the frame.');
            baselineNoseXRef.current = null;
          } else if (detections.length > 1) {
            // Rule: 2+ faces detected
            setFeedbackMessage(`Multiple faces detected (${detections.length}). Exactly ONE person is allowed.`);
            baselineNoseXRef.current = null;
          } else {
            // Exactly ONE face detected!
            const face = detections[0];
            const landmarks = face.landmarks;
            const nose = landmarks.getNose();
            const noseTip = nose[3] || nose[0]; // Tip of nose

            if (!livenessPassedRef.current) {
              setStepStatus('liveness_prompt');
              setLivenessInstruction('Turn your head slightly left or right');
              setFeedbackMessage('Live human check: Please turn your head slightly to confirm liveness.');

              if (baselineNoseXRef.current === null) {
                baselineNoseXRef.current = noseTip.x;
              } else {
                const deltaX = Math.abs(noseTip.x - baselineNoseXRef.current);
                const faceWidth = face.detection.box.width;

                // If nose shifted horizontally by >8% of face width, liveness passed!
                if (deltaX / faceWidth > 0.08) {
                  livenessPassedRef.current = true;
                  setStepStatus('liveness_verified');
                  setFeedbackMessage('✓ Liveness verified! Acquiring GPS coordinates...');

                  // Convert Float32Array to standard array for transmission
                  const descriptorArray = Array.from(face.descriptor);
                  setCapturedDescriptor(descriptorArray);

                  // Proceed to geolocation and submission
                  acquireLocationAndSubmit(descriptorArray);
                  return; // Pause detection loop during submission
                }
              }
            }
          }
        } catch (err) {
          console.error('Face detection frame error:', err);
        }
      }

      if (!livenessPassedRef.current) {
        detectionLoopRef.current = requestAnimationFrame(detect);
      }
    };

    detectionLoopRef.current = requestAnimationFrame(detect);
  };

  // 4. Acquire Geolocation and Transmit to Server
  const acquireLocationAndSubmit = async (faceDescriptor: number[]) => {
    setStepStatus('locating');
    setSubmissionError(null);

    if (!navigator.geolocation) {
      setSubmissionError('Geolocation is not supported by your browser.');
      setStepStatus('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setCurrentLocation(coords);

        // Submit to server
        setStepStatus('submitting');
        setFeedbackMessage('Verifying face embedding & office geofence on server...');

        try {
          if (mode === 'check-in') {
            const res = await api.checkIn({
              source: 'camera',
              faceDescriptor,
              location: coords,
            });

            setDistanceFromOffice(res.distanceMeters ?? 0);
            setStepStatus('success');
            setFeedbackMessage(res.message);

            setTimeout(() => {
              stopCamera();
              onSuccess(res.attendance, res.distanceMeters);
            }, 1800);
          } else {
            // Check-out mode
            const res = await api.checkOut({
              source: 'camera',
              faceDescriptor,
              location: coords,
            });

            setStepStatus('success');
            setFeedbackMessage(res.message);

            setTimeout(() => {
              stopCamera();
              onSuccess(res.attendance);
            }, 1800);
          }
        } catch (err: any) {
          console.error('Camera check-in failed on server:', err);
          setSubmissionError(err.message || 'Verification failed on server.');
          setStepStatus('error');
        }
      },
      (err) => {
        console.error('Geolocation acquisition error:', err);
        let msg = 'Could not acquire GPS position. ';
        if (err.code === err.PERMISSION_DENIED) {
          msg += 'Location permission denied. Please allow location access.';
        } else if (err.code === err.TIMEOUT) {
          msg += 'Location request timed out. Please try again in an open area.';
        } else {
          msg += err.message;
        }
        setSubmissionError(msg);
        setStepStatus('error');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  const handleRetry = () => {
    setSubmissionError(null);
    baselineNoseXRef.current = null;
    livenessPassedRef.current = false;
    setStepStatus('detecting');
    setFeedbackMessage('Center your face inside the viewfinder.');
    startDetectionLoop();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 overflow-hidden space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {mode === 'check-in' ? 'Camera Face Check-In' : 'Camera Face Check-Out'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                  AI + Geofence
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                1-face validation • Liveness motion check • Haversine &le; {company?.geofence_radius_meters || 150}m
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Models State */}
        {modelsLoading && (
          <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-300 absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Loading Vision & Face Models</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1">
                Initializing TensorFlow.js face detector, 68 facial landmarks, and descriptor recognizer...
              </p>
            </div>
          </div>
        )}

        {/* Model Loading Error */}
        {modelLoadError && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-200 text-xs space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{modelLoadError}</span>
            </div>
            <button
              onClick={onFallbackToWeb}
              className="w-full py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
            >
              Use Standard Web Check-In Instead
            </button>
          </div>
        )}

        {/* Camera Permission Denied / Error Graceful Fallback */}
        {cameraError && (
          <div className="p-5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-2xl text-amber-800 dark:text-amber-200 text-xs space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block text-sm mb-1">Camera Fallback Activated</span>
                <p className="text-slate-600 dark:text-slate-300">{cameraError}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200 dark:border-amber-800/40 flex flex-col gap-2">
              <button
                onClick={() => {
                  stopCamera();
                  onFallbackToWeb();
                }}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <span>Proceed with Standard Web Check-In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={startCamera}
                className="w-full py-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white text-[11px] text-center cursor-pointer"
              >
                Retry Camera Access
              </button>
            </div>
          </div>
        )}

        {/* Camera Viewfinder View (When active) */}
        {!modelsLoading && !modelLoadError && !cameraError && (
          <div className="space-y-4">
            {/* Viewfinder Video Frame */}
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-slate-700 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />

              {/* Viewfinder Target Corner Brackets */}
              <div className="absolute inset-4 pointer-events-none">
                {/* Top-Left */}
                <div
                  className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl transition-colors duration-300 ${
                    detectedFacesCount === 1
                      ? stepStatus === 'liveness_verified' || stepStatus === 'success'
                        ? 'border-emerald-400 shadow-emerald-400/50'
                        : 'border-indigo-400'
                      : detectedFacesCount > 1
                      ? 'border-rose-400'
                      : 'border-slate-500'
                  }`}
                />
                {/* Top-Right */}
                <div
                  className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl transition-colors duration-300 ${
                    detectedFacesCount === 1
                      ? stepStatus === 'liveness_verified' || stepStatus === 'success'
                        ? 'border-emerald-400'
                        : 'border-indigo-400'
                      : detectedFacesCount > 1
                      ? 'border-rose-400'
                      : 'border-slate-500'
                  }`}
                />
                {/* Bottom-Left */}
                <div
                  className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl transition-colors duration-300 ${
                    detectedFacesCount === 1
                      ? stepStatus === 'liveness_verified' || stepStatus === 'success'
                        ? 'border-emerald-400'
                        : 'border-indigo-400'
                      : detectedFacesCount > 1
                      ? 'border-rose-400'
                      : 'border-slate-500'
                  }`}
                />
                {/* Bottom-Right */}
                <div
                  className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-tr-xl transition-colors duration-300 ${
                    detectedFacesCount === 1
                      ? stepStatus === 'liveness_verified' || stepStatus === 'success'
                        ? 'border-emerald-400'
                        : 'border-indigo-400'
                      : detectedFacesCount > 1
                      ? 'border-rose-400'
                      : 'border-slate-500'
                  }`}
                />

                {/* Oval Face Guide */}
                <div
                  className={`absolute inset-x-12 inset-y-6 rounded-[50%] border-2 border-dashed transition-all duration-300 ${
                    detectedFacesCount === 1
                      ? 'border-emerald-400/70 shadow-lg shadow-emerald-500/20'
                      : detectedFacesCount > 1
                      ? 'border-rose-400/80 shadow-lg shadow-rose-500/20'
                      : 'border-slate-500/50'
                  }`}
                />

                {/* Animated Scanning Laser Line */}
                {stepStatus !== 'success' && stepStatus !== 'error' && (
                  <div className="absolute inset-x-8 top-0 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-lg shadow-indigo-500/80 animate-[bounce_2.5s_infinite]" />
                )}
              </div>

              {/* Status Pill Badge inside Viewfinder */}
              <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
                <div
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md border ${
                    detectedFacesCount === 1
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                      : detectedFacesCount > 1
                      ? 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      detectedFacesCount === 1
                        ? 'bg-emerald-400 animate-ping'
                        : detectedFacesCount > 1
                        ? 'bg-rose-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {detectedFacesCount === 0
                      ? 'No Face Detected'
                      : detectedFacesCount === 1
                      ? '1 Face Locked'
                      : `Multiple Faces (${detectedFacesCount})`}
                  </span>
                </div>

                {stepStatus === 'liveness_prompt' && (
                  <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/90 text-slate-950 flex items-center gap-1.5 shadow-lg animate-pulse">
                    <span>{livenessInstruction}</span>
                  </div>
                )}
              </div>

              {/* Success Overlay */}
              {stepStatus === 'success' && (
                <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-2 animate-in zoom-in-95">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-white">Verification Succeeded!</h4>
                  <p className="text-xs text-emerald-200 max-w-xs">{feedbackMessage}</p>
                  {distanceFromOffice !== null && (
                    <span className="text-[11px] text-slate-300 font-mono">
                      Distance to Office: {distanceFromOffice}m
                    </span>
                  )}
                </div>
              )}

              {/* Error Overlay */}
              {stepStatus === 'error' && (
                <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 animate-in zoom-in-95">
                  <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-bold text-white">Verification Rejected</h4>
                  <p className="text-xs text-rose-200 max-w-xs">{submissionError || feedbackMessage}</p>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Try Again</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        onFallbackToWeb();
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Standard Web Punch
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Real-Time Live Status Feedback */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/70 text-xs flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                {stepStatus === 'submitting' || stepStatus === 'locating' ? (
                  <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                ) : stepStatus === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : detectedFacesCount === 1 ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200 font-medium truncate">{feedbackMessage}</span>
              </div>

              {stepStatus === 'detecting' && detectedFacesCount !== 1 && (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onFallbackToWeb();
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold whitespace-nowrap cursor-pointer"
                >
                  Skip to Web
                </button>
              )}
            </div>

            {/* Privacy Protection Notice */}
            <div className="bg-slate-50 dark:bg-slate-900/90 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-300 block">
                  Zero Photo Storage • Privacy Guarantee
                </span>
                <span>
                  Your camera feed stays in your browser. We never upload, save, or store your photo. Only mathematical face embeddings (vectors) and GPS telemetry are verified.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
