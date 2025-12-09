"use client"

import { useState, useRef } from "react"
import { Mic, Square, Trash2, Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AudioRecorderProps {
    onAudioCaptured: (audioBlob: Blob) => void
    onAudioRemoved: () => void
}

export function AudioRecorder({ onAudioCaptured, onAudioRemoved }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

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
        <div className="w-full">
            {audioUrl ? (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={togglePlayback}
                    >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>

                    <div className="flex-1 h-1 bg-primary/20 rounded-full overflow-hidden">
                        {/* Simple progress bar could go here */}
                        <div className="w-full h-full bg-primary/20" />
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
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                        onClick={handleDelete}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <Button
                    variant={isRecording ? "destructive" : "outline"}
                    className={cn(
                        "w-full h-12 flex items-center justify-center gap-2 transition-all",
                        isRecording && "animate-pulse"
                    )}
                    onClick={isRecording ? stopRecording : startRecording}
                >
                    {isRecording ? (
                        <>
                            <Square className="h-4 w-4 fill-current" />
                            Stop Recording ({formatTime(recordingTime)})
                        </>
                    ) : (
                        <>
                            <Mic className="h-4 w-4" />
                            Record Voice Note
                        </>
                    )}
                </Button>
            )}
        </div>
    )
}
