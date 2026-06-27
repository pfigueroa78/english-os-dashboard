import type { CSSProperties, ReactNode, RefObject } from "react";

import { CoachIcon } from "@/components/CoachIcon";
import { CoachSplitHandle } from "@/modules/coach-layout/CoachSplitHandle";
import { CoachTopBar } from "@/modules/coach-layout/CoachTopBar";
import { CoachChatView } from "./CoachChatView";
import { CoachSidebarView } from "./CoachSidebarView";
import type { CoachPageDispatch, CoachPageViewModel } from "./pageViewModel";

type CoachPageViewRefs = {
  bottomRef: RefObject<HTMLDivElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

type CoachPageViewProps = {
  viewModel: CoachPageViewModel;
  refs: CoachPageViewRefs;
  dispatch: CoachPageDispatch;
  userMenu?: ReactNode;
  renderSignInButton: (label: string) => ReactNode;
};

export function CoachPageView({ viewModel, refs, dispatch, userMenu, renderSignInButton }: CoachPageViewProps) {
  if (viewModel.authGate.state === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-6 text-white">
        <p>{viewModel.authGate.title}</p>
      </main>
    );
  }

  if (viewModel.authGate.state === "signed_out") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold">{viewModel.authGate.title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{viewModel.authGate.description}</p>
          {renderSignInButton(viewModel.authGate.signInLabel)}
        </div>
      </main>
    );
  }

  const layoutStyle = { "--coach-sidebar-width": `${viewModel.shell.sidebar.widthPx}px` } as CSSProperties;

  return (
    <main
      className="coach-shell h-[100dvh] max-w-full overflow-hidden"
      data-theme={viewModel.shell.theme}
      data-text-size={viewModel.shell.textSize}
    >
      <div className="mx-auto flex h-[100dvh] min-w-0 flex-col overflow-hidden p-2">
        <CoachTopBar
          model={viewModel.topBar}
          sidebarOpen={viewModel.shell.sidebar.open}
          theme={viewModel.shell.theme}
          textSize={viewModel.shell.textSize}
          hydrated={viewModel.shell.hydrated}
          panelIcon={<CoachIcon name={viewModel.shell.sidebar.open ? "panelOpen" : "panel"} />}
          userMenu={userMenu}
          onToggleSidebar={() => dispatch({ type: "layout.sidebarToggled" })}
          onThemeChange={(theme) => dispatch({ type: "layout.themeChanged", theme })}
          onDecreaseText={() => dispatch({ type: "layout.textSizeChanged", direction: -1 })}
          onIncreaseText={() => dispatch({ type: "layout.textSizeChanged", direction: 1 })}
        />

        {viewModel.globalError.visible && (
          <div className="mb-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
            {viewModel.globalError.message}
          </div>
        )}

        <div
          className={`coach-layout grid min-h-0 w-full min-w-0 max-w-full flex-1 gap-2 ${
            viewModel.shell.sidebar.open ? "coach-layout-open" : "coach-layout-closed"
          }`}
          style={layoutStyle}
        >
          <CoachSidebarView viewModel={viewModel.sidebar} dispatch={dispatch} />

          {viewModel.sidebar.visible && (
            <CoachSplitHandle onResizeStart={(clientX) => dispatch({ type: "layout.sidebarResizeStarted", clientX })} />
          )}

          <CoachChatView viewModel={viewModel.chat} composer={viewModel.composer} refs={refs} dispatch={dispatch} />
        </div>
      </div>
    </main>
  );
}
