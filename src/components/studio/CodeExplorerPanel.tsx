import React, { useState } from 'react';
import { Button } from '../../ui';
import { Check, Copy, Download, FileCode2, FolderOpen } from 'lucide-react';
import type { RNCodeFile } from '../../types/app';

interface CodeExplorerPanelProps {
  files: RNCodeFile[];
  onExportBundle: () => void;
}

export function CodeExplorerPanel({ files, onExportBundle }: CodeExplorerPanelProps) {
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? 'App.tsx');
  const [copied, setCopied] = useState(false);

  const activeFile = files.find((f) => f.path === selectedPath) ?? files[0];

  const handleCopy = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-label="React Native 源码工程"
      className="flex flex-col rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs h-[clamp(510px,calc(100dvh-204px),660px)]"
    >
      {/* Top toolbar */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            React Native (Expo SDK 52 + HeroUI Native) 单片机调试工程
          </h2>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {activeFile?.summary}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onPress={handleCopy}
            className="min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-teal-600" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>复制代码</span>
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onPress={onExportBundle}
            className="min-h-[38px] px-3.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出项目包</span>
          </Button>
        </div>
      </div>

      {/* Main split: file tree + code editor */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[305px_1fr]">
        {/* File Tree */}
        <aside
          aria-label="项目文件列表"
          className="border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 p-3 overflow-y-auto"
        >
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-slate-500">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>protolink-rn</span>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {files.map((file) => {
              const isSelected = file.path === activeFile?.path;
              return (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPath(file.path);
                      setCopied(false);
                    }}
                    className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-lg text-left text-xs font-mono flex items-center gap-2 transition-colors ${
                      isSelected
                        ? 'bg-teal-600 text-white font-medium'
                        : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{file.path}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Code Viewer */}
        <div className="bg-slate-950 text-slate-100 overflow-auto p-5 font-mono text-[12.5px] leading-relaxed">
          <pre className="m-0 whitespace-pre" data-testid="rn-code-viewer">
            <code>{activeFile?.content}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
