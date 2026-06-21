import type { RefObject } from "react";

import { CoachIcon } from "@/components/CoachIcon";
import type { CoachComposerModel } from "./composerViewModel";

type CoachComposerRefs = {
  imageInputRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

type CoachComposerActions = {
  onImageSelected: (file?: File) => void;
  onClearImage: () => void;
  onInputChange: (value: string) => void;
  onStartDictation: () => void;
  onSendMessage: () => void;
  onStopThinking: () => void;
};

type CoachComposerProps = {
  model: CoachComposerModel;
  refs: CoachComposerRefs;
  actions: CoachComposerActions;
};

export function CoachComposer({ model, refs, actions }: CoachComposerProps) {
  return (
    <footer className="coach-composer sticky bottom-0 z-10 border-t px-3 py-1.5 backdrop-blur">
      {model.selectedImage && (
        <div className="coach-image-preview">
          <img src={model.selectedImage.dataUrl} alt={model.selectedImage.alt} />
          <span className="truncate">{model.selectedImage.name}</span>
          <button type="button" onClick={actions.onClearImage} aria-label="Quitar imagen" title="Quitar imagen">
            ×
          </button>
        </div>
      )}
      <div className="coach-input-row flex items-end gap-2">
        <input
          ref={refs.imageInputRef}
          type="file"
          accept={model.fileInput.accept}
          className="hidden"
          onChange={(event) => actions.onImageSelected(event.target.files?.[0])}
        />
        <div className="coach-text-input-shell flex-1">
          <button
            type="button"
            onClick={() => refs.imageInputRef.current?.click()}
            disabled={model.imageButton.disabled}
            className={model.imageButton.className}
            aria-label={model.imageButton.ariaLabel}
            title={model.imageButton.title}
          >
            +
          </button>
          <textarea
            ref={refs.textareaRef}
            rows={1}
            value={model.input}
            disabled={model.textarea.disabled}
            onChange={(event) => actions.onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                actions.onSendMessage();
              }
            }}
            placeholder={model.textarea.placeholder}
            className="coach-textarea block w-full resize-none rounded-xl border py-1.5 pl-11 pr-3 text-base outline-none"
          />
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={actions.onStartDictation}
          disabled={model.microphoneButton.disabled}
          className={model.microphoneButton.className}
          aria-label={model.microphoneButton.ariaLabel}
          title={model.microphoneButton.title}
        >
          {model.microphoneButton.icon && <CoachIcon name={model.microphoneButton.icon} />}
        </button>
        <button
          type="button"
          onClick={() => (model.sendButton.icon === "stop" ? actions.onStopThinking() : actions.onSendMessage())}
          disabled={model.sendButton.disabled}
          className={model.sendButton.className}
          aria-label={model.sendButton.ariaLabel}
          title={model.sendButton.title}
        >
          {model.sendButton.icon && <CoachIcon name={model.sendButton.icon} />}
        </button>
      </div>
    </footer>
  );
}
