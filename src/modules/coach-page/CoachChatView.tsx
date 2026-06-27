import type { RefObject } from "react";

import { CoachComposer } from "@/modules/coach-chat/CoachComposer";
import { CoachMessageList } from "@/modules/coach-chat/CoachMessageList";
import type { CoachComposerModel } from "@/modules/coach-chat/composerViewModel";
import type { CoachChatViewModel, CoachPageDispatch } from "./pageViewModel";

type CoachChatViewRefs = {
  bottomRef: RefObject<HTMLDivElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

type CoachChatViewProps = {
  viewModel: CoachChatViewModel;
  composer: CoachComposerModel;
  refs: CoachChatViewRefs;
  dispatch: CoachPageDispatch;
};

export function CoachChatView({ viewModel, composer, refs, dispatch }: CoachChatViewProps) {
  return (
    <section className="coach-chat coach-chat-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border">
      <div className="coach-messages min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
        <CoachMessageList
          model={viewModel.messages}
          actions={{
            onToggleSpeech: (_content, messageIndex) => dispatch({ type: "message.speechToggled", messageIndex }),
            onStopOrRestartSpeech: (_content, messageIndex) =>
              dispatch({ type: "message.speechStopOrRestartRequested", messageIndex }),
            onToggleFeedback: (messageIndex, feedback) =>
              dispatch({ type: "message.feedbackToggled", messageIndex, feedback }),
            onReportMessage: (_content, messageIndex) => dispatch({ type: "message.reportRequested", messageIndex }),
            onCopyMessage: (_content, messageIndex) => dispatch({ type: "message.copyRequested", messageIndex }),
            onStopThinking: () => dispatch({ type: "composer.thinkingStopped" }),
          }}
        />
        <div ref={refs.bottomRef} />
      </div>

      <CoachComposer
        model={composer}
        refs={{
          imageInputRef: refs.imageInputRef,
          textareaRef: refs.textareaRef,
        }}
        actions={{
          onImageSelected: (file) => dispatch({ type: "composer.imageSelected", file }),
          onClearImage: () => dispatch({ type: "composer.imageCleared" }),
          onInputChange: (value) => dispatch({ type: "composer.inputChanged", value }),
          onStartDictation: () => dispatch({ type: "composer.dictationToggled" }),
          onSendMessage: () => dispatch({ type: "composer.messageSubmitted" }),
          onStopThinking: () => dispatch({ type: "composer.thinkingStopped" }),
        }}
      />
    </section>
  );
}
