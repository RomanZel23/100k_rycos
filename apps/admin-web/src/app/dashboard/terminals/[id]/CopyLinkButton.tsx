'use client';

import { useState } from 'react';

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-neutral-200 hover:text-white transition-colors cursor-pointer"
      title="Kopiuj link parowania do schowka"
    >
      <span>{copied ? '✓ Skopiowano link' : '📋 Kopiuj link'}</span>
    </button>
  );
}
