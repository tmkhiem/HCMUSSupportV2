import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

export const renderMarkdownFullImplementation = (text: string): React.ReactNode[] => {
  return [
    <ReactMarkdown
      key="md"
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]} // allows trusted HTML inside markdown
      components={{
        // Optional: consistent link behavior
        a: ({ href, children, ...props }) => (
          <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>,
  ];
};
