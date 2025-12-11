"use client"

import { useState, useRef, useEffect } from "react"
import { Mic, Square, Trash2, Play, Pause, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
    const animationFrameRef = useRef<number>()

    // Visualizer logic
    const drawVisualizer = (analyser: AnalyserNode, dataArray: Uint8Array) => {
        if (!canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const width = canvas.width
        const height = canvas.height

        analyser.getByteFrequencyData(dataArray as any)

        ctx.clearRect(0, 0, width, height)

        const barWidth = (width / dataArray.length) * 2.5
        let barHeight
        let x = 0

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2

            ctx.fillStyle = `rgb(239, 68, 68)` // Red-500
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

            // Audio Context for visualizer
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
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
                stream.getTracks().forEach(track => track.stop())
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
                audioContext.close()
            }

            mediaRecorder.start()
            setIsRecording(true)
            setRecordingTime(0)

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1)
            }, 1000)

        } catch (error) {
            console.error("Error accessing microphone:", error)
            alert("Microphone access denied. Please check your settings.")
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
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className={cn("w-full flex flex-col items-center gap-4", className)}>
            {audioUrl ? (
                <div className="w-full flex items-center gap-2 p-4 bg-muted/50 rounded-xl border border-border/50 shadow-sm">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-background shadow-sm"
                        onClick={togglePlayback}
                    >
                        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                    </Button>

                    <div className="flex-1 flex flex-col justify-center gap-1">
                        <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden w-full">
                            <div className="h-full bg-primary/50 w-full" />
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
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
                        className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                        onClick={handleDelete}
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>
                </div>
            ) : (
                <div className="relative group">
                    {/* Pulsing Effect */}
                    {isRecording && (
                        <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                    )}

                    <Button
                        variant={isRecording ? "destructive" : "default"}
                        className={cn(
                            "h-32 w-32 rounded-full flex flex-col items-center justify-center gap-2 shadow-xl transition-all duration-300",
                            isRecording ? "scale-110 bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90 hover:scale-105"
                        )}
                        onClick={isRecording ? stopRecording : startRecording}
                    >
                        {isRecording ? (
                            <>
                                <Square className="h-8 w-8 fill-current animate-pulse" />
                                <span className="text-sm font-mono font-bold">{formatTime(recordingTime)}</span>
                            </>
                        ) : (
                            <>
                                <Mic className="h-10 w-10" />
                                <span className="text-sm font-semibold">Tap to Record</span>
                            </>
                        )}
                    </Button>

                    {/* Visualizer Canvas */}
                    {isRecording && (
                        <canvas
                            ref={canvasRef}
                            width={100}
                            height={30}
                            className="absolute -bottom-12 left-1/2 -translate-x-1/2 opacity-50"
                        />
                    )}
                </div>
            )}
        </div>
    )
}

