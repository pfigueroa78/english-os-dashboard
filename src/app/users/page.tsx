"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

type UserRow = {
  userEmail: string;
  learnerId: string;
  name: string;
  preferredChannel: string;
  currentUnit: string;
  currentLesson: string;
  currentCEFR: string;
  lastActivity: string;
  active: string;
  role: string;
  createdAt: string;
  lastLogin: string;
  accessSource: string;
};

export default function UsersPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");

  async function sendDailyReports() {
    setReportLoading(true);
    setReportMessage("");

    try {
      const response = await fetch("/api/english-os/daily-report", {
        method: "POST",
      });

      const result = await response.json();

      if (!result.ok) {
        setReportMessage(result.error || "Unable to send daily reports.");
        return;
      }

      const summary = result.report?.result;

      setReportMessage(
        `Reports sent. Active users: ${summary?.totalActiveUsers ?? "?"}, sent: ${summary?.sent ?? "?"}, failed: ${summary?.failed ?? "?"}.`
      );
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReportLoading(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/english-os/users", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!result.ok) {
        setError(result.error || "Unable to load users.");
        setUsers([]);
        return;
      }

      setUsers(result.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadUsers();
    }

    if (isLoaded && !isSignedIn) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          Loading users...
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">English OS Users</h1>
          <p className="text-slate-400">Sign in to access user administration.</p>
          <SignInButton mode="redirect">
            <button className="rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">English OS Users</h1>
              <p className="text-slate-400">Admin access required.</p>
            </div>
            <UserButton />
          </header>

          <div className="rounded-2xl bg-red-950 border border-red-800 p-6 text-red-100">
            {error}
          </div>

          <Link href="/" className="text-blue-400 underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">English OS Users</h1>
            <p className="text-slate-400">
              Registered learners and access status.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/" className="text-blue-400 underline">
              Dashboard
            </Link>
            <UserButton />
            <button
              onClick={sendDailyReports}
              disabled={reportLoading}
              className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50"
            >
              {reportLoading ? "Sending..." : "Send Daily Reports"}
            </button>


          </div>
        </header>
        {reportMessage && (
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-4 text-sm text-slate-200">
            {reportMessage}
          </div>
        )}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Active</th>
                  <th className="text-left p-3">CEFR</th>
                  <th className="text-left p-3">Current Unit</th>
                  <th className="text-left p-3">Current Lesson</th>
                  <th className="text-left p-3">Last Activity</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.userEmail} className="border-t border-slate-800">
                    <td className="p-3 font-medium">{user.name || "—"}</td>
                    <td className="p-3">{user.userEmail}</td>
                    <td className="p-3">
                      <span className="rounded-full bg-slate-800 px-3 py-1">
                        {user.role || "learner"}
                      </span>
                    </td>
                    <td className="p-3">{String(user.active)}</td>
                    <td className="p-3">{user.currentCEFR || "—"}</td>
                    <td className="p-3 max-w-xs truncate">{user.currentUnit || "—"}</td>
                    <td className="p-3 max-w-xs truncate">{user.currentLesson || "—"}</td>
                    <td className="p-3">{formatDate(String(user.lastActivity || ""))}</td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td className="p-6 text-slate-400" colSpan={8}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  if (!value) return "—";
  return value.includes("T") ? value.split("T")[0] : value;
}
