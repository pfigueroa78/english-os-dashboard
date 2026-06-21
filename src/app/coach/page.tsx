"use client";

import type { CSSProperties } from "react";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { CoachIcon } from "@/components/CoachIcon";
import { CoachComposer } from "@/modules/coach-chat/CoachComposer";
import { CoachMessageList } from "@/modules/coach-chat/CoachMessageList";
import { CoachSplitHandle } from "@/modules/coach-layout/CoachSplitHandle";
import { CoachTopBar } from "@/modules/coach-layout/CoachTopBar";
import { useCoachPageController } from "@/modules/coach-page/useCoachPageController";
import { CoachClassMaterialsPanel } from "@/modules/coach-resources/CoachClassMaterialsPanel";
import { CoachDiagnosticsPanel } from "@/modules/coach-resources/CoachDiagnosticsPanel";
import { CoachGuidesPanel } from "@/modules/coach-resources/CoachGuidesPanel";
import { CoachLearningPulsePanel } from "@/modules/coach-resources/CoachLearningPulsePanel";
import { CoachQuickHelpPanel } from "@/modules/coach-resources/CoachQuickHelpPanel";
import { CoachStudyPanel } from "@/modules/coach-resources/CoachStudyPanel";

const PROGRESS_STATUS = "Evaluación pendiente";

export default function CoachPage() {
  const coach = useCoachPageController();
  const { auth, state, refs, models, actions } = coach;
  const layoutStyle = { "--coach-sidebar-width": `${state.sidebarWidth}px` } as CSSProperties;

  if (!auth.authReady && !auth.e2eDemo) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-6 text-white">
        <p>Loading English OS...</p>
      </main>
    );
  }

  if (!auth.signedIn) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold">English OS Coach</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Sign in to continue your guided English learning path.</p>
          <SignInButton mode="modal">
            <button className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500">Sign in</button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <main className="coach-shell h-[100dvh] max-w-full overflow-hidden" data-theme={state.theme} data-text-size={state.textSize}>
      <div className="mx-auto flex h-[100dvh] min-w-0 flex-col overflow-hidden p-2">
        <header className="hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">English OS</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">English OS Coach</h1>
              <p className="mt-1 text-sm text-slate-300">Profesor IA para clase guiada, práctica y evaluación.</p>
              <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">{state.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 sm:inline-flex">Clase guiada</span>
              {!auth.e2eDemo && auth.isLoaded && auth.isSignedIn && <UserButton />}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Unidad actual</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{state.contextLoading ? "Loading..." : state.activeStudyUnitLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Clase de hoy</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{state.currentLesson || "Guided class"}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-amber-200/80">Progreso de clase</p>
              <p className="mt-1 truncate text-sm font-semibold text-amber-100">{PROGRESS_STATUS}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button type="button" onClick={actions.startTodayClass} disabled={state.loading || !state.activeStudyUnit} className="rounded-2xl bg-blue-600 px-3 py-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">
              Empezar explicación
            </button>
            <button type="button" onClick={actions.requestHint} disabled={state.loading || !state.activeStudyUnit} className="rounded-2xl border border-yellow-500/50 bg-yellow-500/10 px-3 py-3 text-xs font-bold text-yellow-100 hover:bg-yellow-500/20 disabled:opacity-50">
              Dame una pista
            </button>
            <button type="button" onClick={actions.requestUnitGrammar} disabled={state.loading || !state.activeStudyUnit} className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-xs font-bold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">
              Gramática
            </button>
            <button type="button" onClick={actions.requestUnitVocabulary} disabled={state.loading || !state.activeStudyUnit} className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-3 text-xs font-bold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50">
              Vocabulario
            </button>
          </div>
          {state.contextError && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{state.contextError}</div>}
        </header>

        <CoachTopBar
          model={models.topBarModel}
          sidebarOpen={state.sidebarOpen}
          theme={state.theme}
          textSize={state.textSize}
          hydrated={state.hydrated}
          panelIcon={<CoachIcon name={state.sidebarOpen ? "panelOpen" : "panel"} />}
          userMenu={!auth.e2eDemo && auth.isLoaded && auth.isSignedIn ? <UserButton /> : null}
          onToggleSidebar={() => actions.setSidebarOpen((open) => !open)}
          onThemeChange={actions.setTheme}
          onDecreaseText={actions.decreaseTextSize}
          onIncreaseText={actions.increaseTextSize}
        />

        {state.error && <div className="mb-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{state.error}</div>}

        <div
          className={`coach-layout grid min-h-0 min-w-0 max-w-full flex-1 gap-2 ${state.sidebarOpen ? "coach-layout-open" : "coach-layout-closed"}`}
          style={layoutStyle}
        >
          {state.sidebarOpen && <aside id="coach-sidebar" className="coach-sidebar min-w-0 max-w-full space-y-2 overflow-x-hidden">
            <CoachStudyPanel
              model={models.studyPanelModel}
              onStudyUnitChange={actions.handleStudyUnitChange}
              onStudyUnitBlur={actions.handleStudyUnitBlur}
              onUseSavedPosition={actions.handleUseSavedPosition}
              onStartClass={actions.startTodayClass}
            />

            <CoachLearningPulsePanel
              model={models.learningPulsePanelModel}
            />

            <CoachDiagnosticsPanel
              model={models.diagnosticsPanelModel}
              onRunDiagnostics={actions.runDiagnostics}
            />

            <CoachGuidesPanel
              model={models.guidesPanelModel}
              onCreateGrammarWorkbook={actions.createGrammarWorkbook}
              onCreateVocabularyWorkbook={actions.createVocabularyWorkbook}
              onRequestGrammarGuide={actions.requestUnitGrammar}
              onRequestVocabularyGuide={actions.requestUnitVocabulary}
            />

            <CoachQuickHelpPanel
              model={models.quickHelpPanelModel}
              onSelectAgent={actions.setActiveAgentId}
              onRunAgent={actions.handleRunAgent}
            />

            <CoachClassMaterialsPanel
              model={models.classMaterialsPanelModel}
              onToggleResource={actions.toggleResource}
              onPracticeResource={actions.requestResourcePractice}
            />
          </aside>}

          {state.sidebarOpen && <CoachSplitHandle onResizeStart={actions.startSidebarResize} />}

          <section className="coach-chat coach-chat-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border">
            <div className="coach-messages min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
              <CoachMessageList
                model={models.messageListModel}
                actions={{
                  onToggleSpeech: actions.toggleSpeech,
                  onStopOrRestartSpeech: (content, index) => (state.speakingMessageIndex === index ? actions.stopSpeech() : actions.speakMessage(content, index)),
                  onToggleFeedback: actions.toggleMessageFeedback,
                  onReportMessage: actions.reportMessage,
                  onCopyMessage: actions.copyMessage,
                  onStopThinking: actions.stopThinking,
                }}
              />
              <div ref={refs.bottomRef} />
            </div>

            <CoachComposer
              model={models.composerModel}
              refs={{
                imageInputRef: refs.imageInputRef,
                textareaRef: refs.textareaRef,
              }}
              actions={{
                onImageSelected: actions.handleImageSelected,
                onClearImage: actions.clearImage,
                onInputChange: actions.setInput,
                onStartDictation: actions.startDictation,
                onSendMessage: actions.sendMessage,
                onStopThinking: actions.stopThinking,
              }}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
