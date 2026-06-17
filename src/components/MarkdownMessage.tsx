"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

const LABELS_RE =
  /(Learning objective|Personal focus|Real-life context|Pattern|Meaning|Form|Examples|Common mistake|Try|Example|Now you|Model answer|Progress note|Important):/g;

function normalizeMarkdownContent(content: string) {
  let normalized = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n");

  normalized = normalized
    .replace(/\s+(Personal focus:)/g, "\n\n$1")
    .replace(/\s+(Real-life context:)/g, "\n\n$1")
    .replace(/\s+(Pattern\s+\d+:)/g, "\n\n### $1")
    .replace(/(?<!\n)(#{2,3}\s+)/g, "\n\n$1")
    .replace(/([^\n])\s+(Pattern:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(Meaning:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(Form:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(Examples:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(⚠️\s*Common mistake:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(Common mistake:)/g, "$1\n\n⚠️ $2")
    .replace(/([^\n])\s+(Try:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(Now you:)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(Model answer:)/g, "$1\n\n$2")
    .replace(/^>\s*([^\n]+?)\s+(⚠️\s*Common mistake:)/gm, "> $1\n\n$2")
    .replace(/^>\s*([^\n]+?)\s+(Common mistake:)/gm, "> $1\n\n⚠️ $2")
    .replace(/^>\s*([^\n]+?)\s+(Try:)/gm, "> $1\n\n$2")
    .replace(LABELS_RE, "**$1:**")
    .replace(/\n\s*\n(?=\s*[-*]\s+)/g, "\n")
    .replace(/\n\s*\n(?=\s*\d+[.)]\s+)/g, "\n")
    .replace(/\n\s*\n(?=\s*>\s+)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    const text = String(content || "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="english-os-message-markdown group relative text-slate-50">
      <div className="not-prose mb-3 flex justify-end">
        <button
          type="button"
          onClick={copyContent}
          className="rounded-full border border-slate-500/40 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:border-blue-400 hover:bg-slate-900 hover:text-white"
          aria-label="Copy coach response"
        >
          {copied ? "Copied" : "Copy response"}
        </button>
      </div>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-1.5 mt-3 text-2xl font-bold text-slate-50 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 text-xl font-bold text-slate-50 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 text-lg font-bold text-slate-50 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-base font-semibold text-slate-50 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-1.5 leading-7 text-slate-100 last:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-50">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-100">{children}</em>,
          ul: ({ children }) => (
            <ul className="mb-1.5 ml-5 list-disc space-y-0 text-slate-100">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-1.5 ml-5 list-decimal space-y-0 text-slate-100">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7 text-slate-100 [&>ol]:mb-1 [&>ol]:mt-1 [&>p]:mb-0 [&>ul]:mb-1 [&>ul]:mt-1">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-4 border-blue-500 bg-slate-900/70 px-3 py-2 text-slate-100">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className);

            if (isBlock) {
              return (
                <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 p-3 text-sm leading-6 text-slate-100">
                  {children}
                </code>
              );
            }

            return (
              <code className="rounded-md bg-slate-950 px-1.5 py-0.5 text-sm text-cyan-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-xl bg-slate-950 p-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-xl border border-slate-700">
              <table className="min-w-full border-collapse text-sm text-slate-100">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-950 text-slate-100">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-slate-800 last:border-b-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border-r border-slate-800 px-3 py-1.5 text-left font-bold text-slate-100 last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-slate-800 px-3 py-1.5 align-top text-slate-100 last:border-r-0">
              {children}
            </td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cyan-300 underline decoration-cyan-300/60 underline-offset-4 hover:text-cyan-200"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-slate-700" />,
        }}
      >
        {normalizeMarkdownContent(content)}
      </ReactMarkdown>
    </div>
  );
}
