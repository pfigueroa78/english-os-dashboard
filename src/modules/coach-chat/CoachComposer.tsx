import type { RefObject } from "react";

import { CoachIcon } from "@/components/CoachIcon";

type SelectedCoachImage = {
  dataUrl: string;
  name?: string;
};

type CoachComposerProps = {
  input: string;
  selectedImage: SelectedCoachImage | null;
  hydrated: boolean;
  loading: boolean;
  listening: boolean;
  imageInputRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onImageSelected: (file?: File) => void;
  onClearImage: () => void;
  onInputChange: (value: string) => void;
  onStartDictation: () => void;
  onSendMessage: () => void;
  onStopThinking: () => void;
};

export function CoachComposer({
  input,
  selectedImage,
  hydrated,
  loading,
  listening,
  imageInputRef,
  textareaRef,
  onImageSelected,
  onClearImage,
  onInputChange,
  onStartDictation,
  onSendMessage,
  onStopThinking,
}: CoachComposerProps) {
  const canSubmit = hydrated && (loading || input.trim() || selectedImage);

  return (
    <footer className="coach-composer sticky bottom-0 z-10 border-t px-3 py-1.5 backdrop-blur">
      {selectedImage && (
        <div className="coach-image-preview">
          <img src={selectedImage.dataUrl} alt={selectedImage.name || "Imagen seleccionada"} />
          <span className="truncate">{selectedImage.name || "Imagen para vocabulario"}</span>
          <button type="button" onClick={onClearImage} aria-label="Quitar imagen" title="Quitar imagen">
            ×
          </button>
        </div>
      )}
      <div className="coach-input-row flex items-end gap-2">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onImageSelected(event.target.files?.[0])}
        />
        <div className="coach-text-input-shell flex-1">
          <button type="button" onClick={() => imageInputRef.current?.click()} disabled={!hydrated || loading} className="coach-inline-plus-button" aria-label="Agregar foto para vocabulario" title="Agregar foto">
            +
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            disabled={!hydrated}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSendMessage();
              }
            }}
            placeholder="Escribe tu respuesta en inglés o pide una explicación..."
            className="coach-textarea block w-full resize-none rounded-xl border py-1.5 pl-11 pr-3 text-base outline-none"
          />
        </div>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={onStartDictation} disabled={!hydrated || loading} className={`coach-round-button coach-mic-button ${listening ? "coach-mic-active" : ""}`} aria-label={listening ? "Detener micrófono" : "Dictar con micrófono"} title={listening ? "Detener micrófono" : "Micrófono"}>
          <CoachIcon name="mic" />
        </button>
        <button type="button" onClick={() => (loading ? onStopThinking() : onSendMessage())} disabled={!canSubmit} className="coach-send-button disabled:cursor-not-allowed disabled:opacity-40" aria-label={loading ? "Parar respuesta del profesor" : "Enviar respuesta"} title={loading ? "Parar" : "Enviar"}>
          <CoachIcon name={loading ? "stop" : "send"} />
        </button>
      </div>
    </footer>
  );
}
