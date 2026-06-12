import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-4 mt-6 text-3xl font-bold text-white first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 mt-5 text-2xl font-bold text-white first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-4 text-xl font-bold text-white first:mt-0">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="mb-2 mt-3 text-lg font-semibold text-white first:mt-0">
            {children}
          </h4>
        ),
        p: ({ children }) => (
          <p className="mb-3 leading-8 text-slate-100 last:mb-0">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-bold text-white">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-slate-100">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-4 ml-6 list-disc space-y-2 text-slate-100">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-slate-100">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-7">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-4 border-blue-500 bg-slate-900/70 px-4 py-3 text-slate-200">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const isBlock = Boolean(className);

          if (isBlock) {
            return (
              <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">
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
          <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-0">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-full border-collapse text-sm text-slate-100">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-950">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-slate-800 last:border-b-0">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="border-r border-slate-800 px-3 py-2 text-left font-bold text-white last:border-r-0">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-r border-slate-800 px-3 py-2 align-top last:border-r-0">
            {children}
          </td>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-cyan-300 underline decoration-cyan-500/60 underline-offset-4 hover:text-cyan-200"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-6 border-slate-700" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
