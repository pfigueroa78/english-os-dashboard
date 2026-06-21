import { CoachIcon } from "@/components/CoachIcon";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import type { CoachMessageFeedback, CoachMessageListModel } from "./messageListViewModel";

type CoachMessageListActions = {
  onToggleSpeech: (content: string, index: number) => void;
  onStopOrRestartSpeech: (content: string, index: number) => void;
  onToggleFeedback: (index: number, feedback: CoachMessageFeedback) => void;
  onReportMessage: (content: string, index: number) => void;
  onCopyMessage: (content: string, index: number) => void;
  onStopThinking: () => void;
};

type CoachMessageListProps = {
  model: CoachMessageListModel;
  actions: CoachMessageListActions;
};

export function CoachMessageList({ model, actions }: CoachMessageListProps) {
  return (
    <>
      {model.messages.map((message) => (
        <article key={message.index} className={`coach-message ${message.role === "user" ? "coach-message-user" : "coach-message-teacher"}`}>
          {message.role === "user" ? (
            <>
              <p className="coach-user-message-line">
                <span className="coach-user-message-label">{message.userLabel}</span>
                <span className="coach-user-message-content">{message.content}</span>
              </p>
              {message.image && (
                <figure className="coach-message-image not-prose">
                  <img src={message.image.dataUrl} alt={message.image.alt} />
                </figure>
              )}
            </>
          ) : (
            <>
              <div className="coach-message-label">
                <p>{message.teacherLabel}</p>
              </div>
              <div className="coach-message-actions not-prose">
                {message.speechAction && (
                  <button
                    type="button"
                    onClick={() => actions.onToggleSpeech(message.content, message.index)}
                    className={message.speechAction.className}
                    aria-label={message.speechAction.ariaLabel}
                    title={message.speechAction.title}
                  >
                    <CoachIcon name={message.speechAction.icon} />
                  </button>
                )}
                {message.stopOrRestartAction && (
                  <button
                    type="button"
                    onClick={() => actions.onStopOrRestartSpeech(message.content, message.index)}
                    className={message.stopOrRestartAction.className}
                    aria-label={message.stopOrRestartAction.ariaLabel}
                    title={message.stopOrRestartAction.title}
                  >
                    <CoachIcon name={message.stopOrRestartAction.icon} />
                  </button>
                )}
                {message.likeAction && (
                  <button
                    type="button"
                    onClick={() => actions.onToggleFeedback(message.index, "like")}
                    className={message.likeAction.className}
                    aria-label={message.likeAction.ariaLabel}
                    aria-pressed={message.likeAction.pressed}
                    title={message.likeAction.title}
                  >
                    <CoachIcon name={message.likeAction.icon} />
                  </button>
                )}
                {message.dislikeAction && (
                  <button
                    type="button"
                    onClick={() => actions.onToggleFeedback(message.index, "dislike")}
                    className={message.dislikeAction.className}
                    aria-label={message.dislikeAction.ariaLabel}
                    aria-pressed={message.dislikeAction.pressed}
                    title={message.dislikeAction.title}
                  >
                    <CoachIcon name={message.dislikeAction.icon} />
                  </button>
                )}
                {message.reportAction && (
                  <button
                    type="button"
                    onClick={() => actions.onReportMessage(message.content, message.index)}
                    className={message.reportAction.className}
                    aria-label={message.reportAction.ariaLabel}
                    title={message.reportAction.title}
                  >
                    <CoachIcon name={message.reportAction.icon} />
                  </button>
                )}
                {message.copyAction && (
                  <button
                    type="button"
                    onClick={() => actions.onCopyMessage(message.content, message.index)}
                    className={message.copyAction.className}
                    aria-label={message.copyAction.ariaLabel}
                    title={message.copyAction.title}
                  >
                    <CoachIcon name={message.copyAction.icon} />
                  </button>
                )}
              </div>
              <div className="prose max-w-none whitespace-pre-wrap text-sm sm:text-base">
                <MarkdownMessage content={message.content} />
              </div>
            </>
          )}
        </article>
      ))}
      {model.thinking.visible && (
        <div className="coach-thinking text-sm" aria-live="polite">
          <span>{model.thinking.label}</span>
          <span className="coach-thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
          <button type="button" onClick={actions.onStopThinking} className="coach-thinking-stop" aria-label="Parar respuesta del profesor" title="Parar">
            <CoachIcon name="stop" />
          </button>
        </div>
      )}
    </>
  );
}
