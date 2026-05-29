"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WebKitAudioWindow = Window &
    typeof globalThis & {
        webkitAudioContext?: typeof AudioContext
    }

interface AudioRecorderProps {
    onAudioCaptured: (audioBlob: Blob) => void
    onAudioRemoved: () => void
    className?: string
}

export function AudioRecorder({ onAudioCaptured, onAudioRemoved, className }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationFrameRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl)
            }
        }
    }, [audioUrl])

    const drawVisualizer = (analyser: AnalyserNode, dataArray: Uint8Array<ArrayBuffer>) => {
        if (!canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const width = canvas.width
        const height = canvas.height

        analyser.getByteFrequencyData(dataArray)

        ctx.clearRect(0, 0, width, height)

        const barWidth = (width / dataArray.length) * 2.5
        let barHeight = 0
        let x = 0

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2

            ctx.fillStyle = "rgb(248, 113, 113)"
            ctx.fillRect(x, height - barHeight, barWidth, barHeight)

            x += barWidth + 1
        }

        animationFrameRef.current = requestAnimationFrame(() => drawVisualizer(analyser, dataArray))
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            const AudioContextConstructor = window.AudioContext || (window as WebKitAudioWindow).webkitAudioContext
            if (!AudioContextConstructor) {
                stream.getTracks().forEach((track) => track.stop())
                throw new Error("AudioContext is not supported in this browser.")
            }

            const audioContext = new AudioContextConstructor()
            const source = audioContext.createMediaStreamSource(stream)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 64
            source.connect(analyser)
            const bufferLength = analyser.frequencyBinCount
            const dataArray = new Uint8Array(bufferLength)
            drawVisualizer(analyser, dataArray)

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
                const url = URL.createObjectURL(audioBlob)
                setAudioUrl(url)
                onAudioCaptured(audioBlob)
                stream.getTracks().forEach((track) => track.stop())
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
                void audioContext.close()
            }

            mediaRecorder.start()
            setIsRecording(true)
            setRecordingTime(0)

            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1)
            }, 1000)

        } catch (error) {
            console.error("Error accessing microphone:", error)
            import("@/components/toast").then(({ toast }) => {
                toast("Microphone access denied. Please check your settings.", "error")
            })
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    }

    const togglePlayback = () => {
        if (!audioPlayerRef.current || !audioUrl) return

        if (isPlaying) {
            audioPlayerRef.current.pause()
        } else {
            audioPlayerRef.current.play()
        }
        setIsPlaying(!isPlaying)
    }

    const handleDelete = () => {
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl)
        }
        setAudioUrl(null)
        setIsPlaying(false)
        onAudioRemoved()
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause()
            audioPlayerRef.current.currentTime = 0
        }
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, "0")}`
    }

    return (
        <div className={cn("flex w-full flex-col items-center gap-4", className)}>
            {audioUrl ? (
                <div className="field-card flex w-full items-center gap-3 p-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-lg bg-slate-950/70 text-white hover:bg-slate-900"
                        onClick={togglePlayback}
                        aria-label={isPlaying ? "Pause recorded voice note" : "Play recorded voice note"}
                    >
                        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                    </Button>

                    <div className="flex flex-1 flex-col justify-center gap-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full w-full bg-blue-400/70" />
                        </div>
                        <p className="font-mono text-xs text-slate-400">
                            Voice Note Recorded
                        </p>
                    </div>

                    <audio
                        ref={audioPlayerRef}
                        src={audioUrl}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden"
                    />

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-lg text-red-300 hover:bg-red-500/10 hover:text-red-200"
                        onClick={handleDelete}
                        aria-label="Delete recorded voice note"
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>
                </div>
            ) : (
                <div className="field-card grid w-full grid-cols-[1fr_auto] items-center gap-3 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
                            isRecording ? "border-red-300/30 bg-red-500/15 text-red-200" : "border-blue-300/25 bg-blue-500/10 text-blue-200"
                        )}>
                            <Mic className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">Voice note</p>
                            <p className="truncate text-xs text-slate-400">
                                {isRecording ? `Recording ${formatTime(recordingTime)}` : "Capture spoken scope"}
                            </p>
                        </div>
                    </div>

                    <div className="relative">
                        {isRecording && (
                            <div className="absolute inset-0 animate-ping rounded-lg bg-red-500/20" />
                        )}

                        <Button
                            variant={isRecording ? "destructive" : "default"}
                            className={cn(
                                "relative flex h-11 min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-xl transition-all duration-300",
                                isRecording ? "scale-105 bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-500"
                            )}
                            onClick={isRecording ? stopRecording : startRecording}
                            aria-label={isRecording ? "Stop recording voice note" : "Record voice note"}
                        >
                            {isRecording ? (
                                <>
                                    <Square className="h-4 w-4 fill-current" />
                                    <span>Stop</span>
                                </>
                            ) : (
                                <>
                                    <Mic className="h-4 w-4" />
                                    <span>Record</span>
                                </>
                            )}
                        </Button>
                    </div>

                    {isRecording && (
                        <canvas
                            ref={canvasRef}
                            width={160}
                            height={30}
                            className="col-span-2 h-8 w-full opacity-80"
                        />
                    )}
                </div>
            )}
        </div>
    )
}
