import { CoachIcon } from "@/components/CoachIcon";
import { MarkdownMessage } from "@/components/MarkdownMessage";

export type CoachChatMessage = {
  role: "user" | "coach";
  content: string;
  image?: {
    dataUrl: string;
    name?: string;
  };
};

export type CoachMessageFeedback = "like" | "dislike";

type CoachMessageListProps = {
  messages: CoachChatMessage[];
  loading: boolean;
  agentLoading: boolean;
  activeAgentName: string;
  copiedMessageIndex: number | null;
  messageFeedback: Record<number, CoachMessageFeedback>;
  speakingMessageIndex: number | null;
  speechPaused: boolean;
  onToggleSpeech: (content: string, index: number) => void;
  onStopOrRestartSpeech: (content: string, index: number) => void;
  onToggleFeedback: (index: number, feedback: CoachMessageFeedback) => void;
  onReportMessage: (content: string, index: number) => void;
  onCopyMessage: (content: string, index: number) => void;
  onStopThinking: () => void;
};

export function CoachMessageList({
  messages,
  loading,
  agentLoading,
  activeAgentName,
  copiedMessageIndex,
  messageFeedback,
  speakingMessageIndex,
  speechPaused,
  onToggleSpeech,
  onStopOrRestartSpeech,
  onToggleFeedback,
  onReportMessage,
  onCopyMessage,
  onStopThinking,
}: CoachMessageListProps) {
  return (
    <>
      {messages.map((message, index) => (
        <article key={index} className={`coach-message ${message.role === "user" ? "coach-message-user" : "coach-message-teacher"}`}>
          {message.role === "user" ? (
            <>
              <p className="coach-user-message-line">
                <span className="coach-user-message-label">Tú —</span>
                <span className="coach-user-message-content">{message.content}</span>
              </p>
              {message.image && (
                <figure className="coach-message-image not-prose">
                  <img src={message.image.dataUrl} alt={message.image.name || "Imagen enviada por el estudiante"} />
                </figure>
              )}
            </>
          ) : (
            <>
              <div className="coach-message-label">
                <p>Profesor dijo:</p>
              </div>
              <div className="coach-message-actions not-prose">
                <button
                  type="button"
                  onClick={() => onToggleSpeech(message.content, index)}
                  className={`coach-round-button ${speakingMessageIndex === index ? "coach-speaking-button" : ""}`}
                  aria-label={speakingMessageIndex === index && !speechPaused ? "Pausar lectura" : speechPaused && speakingMessageIndex === index ? "Continuar lectura" : "Escuchar respuesta del profesor"}
                  title={speakingMessageIndex === index && !speechPaused ? "Pausar" : speechPaused && speakingMessageIndex === index ? "Continuar" : "Escuchar"}
                >
                  <CoachIcon name={speakingMessageIndex === index && !speechPaused ? "pause" : "play"} />
                </button>
                <button
                  type="button"
                  onClick={() => onStopOrRestartSpeech(message.content, index)}
                  className="coach-round-button"
                  aria-label={speakingMessageIndex === index ? "Detener lectura" : "Reiniciar lectura"}
                  title={speakingMessageIndex === index ? "Detener" : "Reiniciar"}
                >
                  <CoachIcon name={speakingMessageIndex === index ? "stop" : "restart"} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFeedback(index, "like")}
                  className={`coach-round-button ${messageFeedback[index] === "like" ? "coach-feedback-active" : ""}`}
                  aria-label={messageFeedback[index] === "like" ? "Quitar me gusta" : "Marcar respuesta como útil"}
                  aria-pressed={messageFeedback[index] === "like"}
                  title={messageFeedback[index] === "like" ? "Quitar me gusta" : "Me gusta"}
                >
                  <CoachIcon name="thumbsUp" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFeedback(index, "dislike")}
                  className={`coach-round-button ${messageFeedback[index] === "dislike" ? "coach-feedback-active" : ""}`}
                  aria-label={messageFeedback[index] === "dislike" ? "Quitar no me gusta" : "Marcar respuesta como no útil"}
                  aria-pressed={messageFeedback[index] === "dislike"}
                  title={messageFeedback[index] === "dislike" ? "Quitar no me gusta" : "No me gusta"}
                >
                  <CoachIcon name="thumbsDown" />
                </button>
                <button type="button" onClick={() => onReportMessage(message.content, index)} className="coach-round-button" aria-label="Reportar error en esta respuesta" title="Reportar error">
                  <CoachIcon name="flag" />
                </button>
                <button type="button" onClick={() => onCopyMessage(message.content, index)} className="coach-round-button" aria-label="Copiar mensaje" title={copiedMessageIndex === index ? "Copiado" : "Copiar"}>
                  <CoachIcon name={copiedMessageIndex === index ? "check" : "copy"} />
                </button>
              </div>
              <div className="prose max-w-none whitespace-pre-wrap text-sm sm:text-base">
                <MarkdownMessage content={message.content} />
              </div>
            </>
          )}
        </article>
      ))}
      {(loading || agentLoading) && (
        <div className="coach-thinking text-sm" aria-live="polite">
          <span>{agentLoading ? `${activeAgentName} está pensando` : "El profesor está pensando"}</span>
          <span className="coach-thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
          <button type="button" onClick={onStopThinking} className="coach-thinking-stop" aria-label="Parar respuesta del profesor" title="Parar">
            <CoachIcon name="stop" />
          </button>
        </div>
      )}
    </>
  );
}
