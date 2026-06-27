"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { CoachPageView } from "@/modules/coach-page/CoachPageView";
import { useCoachPageController } from "@/modules/coach-page/useCoachPageController";

export default function CoachPage() {
  const { auth, refs, viewModel, dispatch } = useCoachPageController();

  return (
    <CoachPageView
      viewModel={viewModel}
      refs={refs}
      dispatch={dispatch}
      userMenu={!auth.e2eDemo && auth.isLoaded && auth.isSignedIn ? <UserButton /> : null}
      renderSignInButton={(label) => (
        <SignInButton mode="modal">
          <button className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500">
            {label}
          </button>
        </SignInButton>
      )}
    />
  );
}
