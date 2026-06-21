import type { CoachIconName } from "@/components/CoachIcon";

export type SelectedCoachImage = {
  dataUrl: string;
  name?: string;
};

export type CoachComposerButtonModel = {
  disabled: boolean;
  ariaLabel: string;
  title: string;
  icon?: CoachIconName;
  className: string;
};

export type CoachComposerModel = {
  input: string;
  selectedImage: null | {
    dataUrl: string;
    name: string;
    alt: string;
  };
  fileInput: {
    accept: string;
  };
  textarea: {
    disabled: boolean;
    placeholder: string;
  };
  imageButton: CoachComposerButtonModel;
  microphoneButton: CoachComposerButtonModel;
  sendButton: CoachComposerButtonModel;
};

export function toCoachComposerModel(params: {
  input: string;
  selectedImage: SelectedCoachImage | null;
  hydrated: boolean;
  loading: boolean;
  listening: boolean;
}): CoachComposerModel {
  const canSubmit = params.hydrated && (params.loading || Boolean(params.input.trim()) || Boolean(params.selectedImage));
  const imageName = params.selectedImage?.name || "Imagen para vocabulario";

  return {
    input: params.input,
    selectedImage: params.selectedImage
      ? {
          dataUrl: params.selectedImage.dataUrl,
          name: imageName,
          alt: imageName,
        }
      : null,
    fileInput: {
      accept: "image/*",
    },
    textarea: {
      disabled: !params.hydrated,
      placeholder: "Escribe tu respuesta en inglés o pide una explicación...",
    },
    imageButton: {
      disabled: !params.hydrated || params.loading,
      ariaLabel: "Agregar foto para vocabulario",
      title: "Agregar foto",
      className: "coach-inline-plus-button",
    },
    microphoneButton: {
      disabled: !params.hydrated || params.loading,
      ariaLabel: params.listening ? "Detener micrófono" : "Dictar con micrófono",
      title: params.listening ? "Detener micrófono" : "Micrófono",
      icon: "mic",
      className: `coach-round-button coach-mic-button ${params.listening ? "coach-mic-active" : ""}`.trim(),
    },
    sendButton: {
      disabled: !canSubmit,
      ariaLabel: params.loading ? "Parar respuesta del profesor" : "Enviar respuesta",
      title: params.loading ? "Parar" : "Enviar",
      icon: params.loading ? "stop" : "send",
      className: "coach-send-button disabled:cursor-not-allowed disabled:opacity-40",
    },
  };
}
