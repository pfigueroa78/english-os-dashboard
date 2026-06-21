import type { CoachIconName } from "@/components/CoachIcon";

export type CoachChatMessage = {
  role: "user" | "coach";
  content: string;
  image?: {
    dataUrl: string;
    name?: string;
  };
};

export type CoachMessageFeedback = "like" | "dislike";

export type CoachMessageActionModel = {
  icon: CoachIconName;
  className: string;
  ariaLabel: string;
  title: string;
  pressed?: boolean;
};

export type CoachMessageListItemModel = {
  index: number;
  role: "user" | "coach";
  content: string;
  image?: {
    dataUrl: string;
    name?: string;
    alt: string;
  };
  userLabel?: string;
  teacherLabel?: string;
  speechAction?: CoachMessageActionModel;
  stopOrRestartAction?: CoachMessageActionModel;
  likeAction?: CoachMessageActionModel;
  dislikeAction?: CoachMessageActionModel;
  reportAction?: CoachMessageActionModel;
  copyAction?: CoachMessageActionModel;
};

export type CoachThinkingModel = {
  visible: boolean;
  label: string;
};

export type CoachMessageListModel = {
  messages: CoachMessageListItemModel[];
  thinking: CoachThinkingModel;
};

export function toCoachMessageListModel(params: {
  messages: CoachChatMessage[];
  loading: boolean;
  agentLoading: boolean;
  activeAgentName: string;
  copiedMessageIndex: number | null;
  messageFeedback: Record<number, CoachMessageFeedback>;
  speakingMessageIndex: number | null;
  speechPaused: boolean;
}): CoachMessageListModel {
  return {
    messages: params.messages.map((message, index) => toCoachMessageListItemModel(message, index, params)),
    thinking: {
      visible: params.loading || params.agentLoading,
      label: params.agentLoading ? `${params.activeAgentName} está pensando` : "El profesor está pensando",
    },
  };
}

function toCoachMessageListItemModel(
  message: CoachChatMessage,
  index: number,
  params: {
    copiedMessageIndex: number | null;
    messageFeedback: Record<number, CoachMessageFeedback>;
    speakingMessageIndex: number | null;
    speechPaused: boolean;
  },
): CoachMessageListItemModel {
  const base: CoachMessageListItemModel = {
    index,
    role: message.role,
    content: message.content,
    image: message.image
      ? {
          dataUrl: message.image.dataUrl,
          name: message.image.name,
          alt: message.image.name || "Imagen enviada por el estudiante",
        }
      : undefined,
  };

  if (message.role === "user") {
    return {
      ...base,
      userLabel: "Tú —",
    };
  }

  const isSpeaking = params.speakingMessageIndex === index;
  const isPaused = isSpeaking && params.speechPaused;
  const isReading = isSpeaking && !params.speechPaused;
  const feedback = params.messageFeedback[index];
  const copied = params.copiedMessageIndex === index;

  return {
    ...base,
    teacherLabel: "Profesor dijo:",
    speechAction: {
      icon: isReading ? "pause" : "play",
      className: `coach-round-button ${isSpeaking ? "coach-speaking-button" : ""}`.trim(),
      ariaLabel: isReading ? "Pausar lectura" : isPaused ? "Continuar lectura" : "Escuchar respuesta del profesor",
      title: isReading ? "Pausar" : isPaused ? "Continuar" : "Escuchar",
    },
    stopOrRestartAction: {
      icon: isSpeaking ? "stop" : "restart",
      className: "coach-round-button",
      ariaLabel: isSpeaking ? "Detener lectura" : "Reiniciar lectura",
      title: isSpeaking ? "Detener" : "Reiniciar",
    },
    likeAction: {
      icon: "thumbsUp",
      className: `coach-round-button ${feedback === "like" ? "coach-feedback-active" : ""}`.trim(),
      ariaLabel: feedback === "like" ? "Quitar me gusta" : "Marcar respuesta como útil",
      title: feedback === "like" ? "Quitar me gusta" : "Me gusta",
      pressed: feedback === "like",
    },
    dislikeAction: {
      icon: "thumbsDown",
      className: `coach-round-button ${feedback === "dislike" ? "coach-feedback-active" : ""}`.trim(),
      ariaLabel: feedback === "dislike" ? "Quitar no me gusta" : "Marcar respuesta como no útil",
      title: feedback === "dislike" ? "Quitar no me gusta" : "No me gusta",
      pressed: feedback === "dislike",
    },
    reportAction: {
      icon: "flag",
      className: "coach-round-button",
      ariaLabel: "Reportar error en esta respuesta",
      title: "Reportar error",
    },
    copyAction: {
      icon: copied ? "check" : "copy",
      className: "coach-round-button",
      ariaLabel: "Copiar mensaje",
      title: copied ? "Copiado" : "Copiar",
    },
  };
}
