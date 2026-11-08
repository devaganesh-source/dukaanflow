
"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileAudio,
  ImagePlus,
  Mic,
  Square,
  X,
} from "lucide-react";

type Kind = "photo" | "voice";

type Attachment = {
  file: File;
  kind: Kind;
  mime: string;
};

type Props = {
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onTranscript: (transcript: string) => boolean | void;
};

const MAX_BYTES = 3 * 1024 * 1024;

const PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VOICE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
]);

function mimeFor(file: File, kind: Kind) {
  const declared = file.type
    .split(";")[0]
    .trim()
    .toLowerCase();

  const allowed =
    kind === "photo" ? PHOTO_TYPES : VOICE_TYPES;

  if (allowed.has(declared)) return declared;

  const ext = file.name
    .split(".")
    .pop()
    ?.toLowerCase();

  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    webm: "audio/webm",
    ogg: "audio/ogg",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    aac: "audio/aac",
  };

  const guessed = byExtension[ext ?? ""] ?? "";

  return allowed.has(guessed) ? guessed : "";
}

function encodeFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () =>
      reject(
        new Error("Unable to read the selected file.")
      );

    reader.onload = () => {
      const value = reader.result;

      if (
        typeof value !== "string" ||
        !value.includes(",")
      ) {
        reject(
          new Error(
            "Unable to encode the selected file."
          )
        );
        return;
      }

      resolve(value.slice(value.indexOf(",") + 1));
    };

    reader.readAsDataURL(file);
  });
}

function messageFrom(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }

  return "Could not extract text. You can type the order manually.";
}

export default function MediaOrderCapture({
  disabled = false,
  onBusyChange,
  onTranscript,
}: Props) {
  const [attachment, setAttachment] =
    useState<Attachment | null>(null);

  const [recording, setRecording] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const recorder = useRef<MediaRecorder | null>(
    null
  );

  const stream = useRef<MediaStream | null>(null);

  const timer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const mounted = useRef(true);

  useEffect(() => {
    onBusyChange(recording || extracting);
  }, [recording, extracting, onBusyChange]);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      if (timer.current) {
        clearTimeout(timer.current);
      }

      if (recorder.current?.state === "recording") {
        recorder.current.stop();
      }

      stream.current
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, []);

  function selectFile(file: File, kind: Kind) {
    setError("");
    setNotice("");

    if (
      file.size < 32 ||
      file.size > MAX_BYTES
    ) {
      setAttachment(null);
      setError(
        "File size must be between 32 bytes and 3 MB."
      );
      return;
    }

    const mime = mimeFor(file, kind);

    if (!mime) {
      setAttachment(null);

      setError(
        kind === "photo"
          ? "Select a JPEG, PNG or WebP photo."
          : "Select a WebM, OGG, WAV, MP3, MP4, M4A or AAC recording."
      );

      return;
    }

    setAttachment({ file, kind, mime });
  }

  async function startRecording() {
    if (disabled || recording || extracting) {
      return;
    }

    setError("");
    setNotice("");

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Microphone recording is not supported in this browser."
      );
      return;
    }

    try {
      const audio =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      if (!mounted.current) {
        audio
          .getTracks()
          .forEach((track) => track.stop());
        return;
      }

      stream.current = audio;

      const format = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const instance = format
        ? new MediaRecorder(audio, {
            mimeType: format,
            audioBitsPerSecond: 64000,
          })
        : new MediaRecorder(audio);

      const mime = instance.mimeType
        .split(";")[0]
        .toLowerCase();

      if (!VOICE_TYPES.has(mime)) {
        audio
          .getTracks()
          .forEach((track) => track.stop());

        stream.current = null;

        setError(
          "This browser uses an unsupported recording format."
        );
        return;
      }

      const chunks: Blob[] = [];

      instance.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
        }
      };

      instance.onstop = () => {
        if (timer.current) {
          clearTimeout(timer.current);
        }

        audio
          .getTracks()
          .forEach((track) => track.stop());

        stream.current = null;
        recorder.current = null;

        if (!mounted.current) return;

        setRecording(false);

        const extension =
          mime === "audio/mp4"
            ? "m4a"
            : mime.split("/")[1];

        const file = new File(
          chunks,
          `voice-note.${extension}`,
          { type: mime }
        );

        selectFile(file, "voice");

        if (
          file.size >= 32 &&
          file.size <= MAX_BYTES
        ) {
          setNotice(
            "Recording ready. Select Extract text."
          );
        }
      };

      instance.onerror = () => {
        if (mounted.current) {
          setError(
            "Recording failed. Try uploading audio instead."
          );
        }
      };

      recorder.current = instance;

      instance.start(1000);
      setAttachment(null);
      setRecording(true);

      setNotice(
        "Recording… speak in Hindi, Hinglish or English."
      );

      timer.current = setTimeout(() => {
        if (instance.state === "recording") {
          instance.stop();
        }
      }, 30000);
    } catch {
      stream.current
        ?.getTracks()
        .forEach((track) => track.stop());

      stream.current = null;

      setError(
        "Microphone permission was denied or recording could not start."
      );
    }
  }

  async function extract() {
    if (
      !attachment ||
      disabled ||
      recording ||
      extracting
    ) {
      return;
    }

    setError("");
    setNotice("");
    setExtracting(true);

    try {
      const response = await fetch(
        "/api/text-orders/transcribe-media",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: attachment.kind,
            mime_type: attachment.mime,
            data_base64: await encodeFile(
              attachment.file
            ),
          }),
          cache: "no-store",
        }
      );

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(messageFrom(data));
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("transcript" in data) ||
        typeof data.transcript !== "string" ||
        !data.transcript.trim() ||
        data.transcript.length > 2000
      ) {
        throw new Error(
          "Invalid transcription returned. Please type the order manually."
        );
      }

      if (
        onTranscript(data.transcript.trim()) ===
        false
      ) {
        setNotice(
          "Your existing message was kept."
        );
        return;
      }

      setAttachment(null);

      setNotice(
        "Text added. Check quantities before selecting Analyze order."
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Media extraction failed."
      );
    } finally {
      if (mounted.current) {
        setExtracting(false);
      }
    }
  }

  const busy =
    disabled || recording || extracting;

  const buttonClass =
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#176b52] transition hover:bg-[#edf5ef] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1">
        <label
          title="Attach a photo"
          className={
            buttonClass + " cursor-pointer"
          }
        >
          <ImagePlus size={18} aria-hidden="true" />

          <span className="hidden sm:inline">
            Photo
          </span>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            aria-label="Attach an order-list photo"
            className="sr-only"
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              event.target.value = "";

              if (file) {
                selectFile(file, "photo");
              }
            }}
          />
        </label>

        <label
          title="Attach a voice note"
          className={
            buttonClass + " cursor-pointer"
          }
        >
          <FileAudio size={18} aria-hidden="true" />

          <span className="hidden sm:inline">
            Audio
          </span>

          <input
            type="file"
            accept="audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,.m4a"
            disabled={busy}
            aria-label="Attach a voice note"
            className="sr-only"
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              event.target.value = "";

              if (file) {
                selectFile(file, "voice");
              }
            }}
          />
        </label>

        {recording ? (
          <button
            type="button"
            onClick={() =>
              recorder.current?.stop()
            }
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700"
          >
            <Square size={16} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            title="Record a voice note"
            onClick={() =>
              void startRecording()
            }
            className={buttonClass}
          >
            <Mic size={18} />
            <span className="hidden sm:inline">
              Record
            </span>
          </button>
        )}

        {attachment && (
          <div className="flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-[#eef5ee] px-2 py-1 text-xs text-[#17372c]">
            <span
              className="max-w-36 truncate"
              title={attachment.file.name}
            >
              {attachment.file.name}
            </span>

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAttachment(null)
              }
              aria-label="Remove attachment"
              className="rounded p-1 hover:bg-[#dbe8db]"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {attachment && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void extract()}
            className="min-h-10 rounded-lg bg-[#e6f2e8] px-3 text-xs font-semibold text-[#176b52] disabled:opacity-50"
          >
            {extracting
              ? "Extracting…"
              : "Extract text"}
          </button>
        )}
      </div>

      {recording && (
        <p
          className="px-2 text-xs text-red-700"
          role="status"
        >
          Recording (30s maximum)…
        </p>
      )}

      {notice && (
        <p
          className="px-2 py-1 text-xs text-[#176b52]"
          role="status"
        >
          {notice}
        </p>
      )}

      {error && (
        <p
          className="px-2 py-1 text-xs text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
