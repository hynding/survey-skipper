import { useState } from 'react';

/** The public link and iframe snippet for a survey. */
export function shareLinks(definitionId: string, base = `${window.location.origin}${window.location.pathname}`): { link: string; embed: string; snippet: string } {
  const id = encodeURIComponent(definitionId);
  const link = `${base}#/s/${id}`;
  const embed = `${base}#/embed/${id}`;
  const snippet = [
    `<iframe src="${embed}" title="Survey" style="width:100%;border:0" height="480" id="survey-${id}"></iframe>`,
    '<script>',
    '  addEventListener("message", (e) => {',
    `    const frame = document.getElementById("survey-${id}");`,
    '    if (e.source !== frame.contentWindow) return;',
    '    if (e.data.type === "survey-skipper:resize") frame.height = e.data.height;',
    '    if (e.data.type === "survey-skipper:complete") console.log("Survey finished", e.data);',
    '  });',
    '</script>',
  ].join('\n');
  return { link, embed, snippet };
}

/** Shows a survey's share link and embed code, with copy buttons. */
export function Share({ definitionId }: { definitionId: string }) {
  const { link, snippet } = shareLinks(definitionId);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (what: string, text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(what);
      },
      () => {
        setCopied(null);
      },
    );
  };
  return (
    <details className="share">
      <summary>Share</summary>
      <label className="prompt" htmlFor="share-link">Link</label>
      <div className="share-row">
        <input id="share-link" readOnly value={link} onFocus={(e) => { e.target.select(); }} />
        <button type="button" onClick={() => { copy('link', link); }}>{copied === 'link' ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="note">Add query values to set the respondent’s context, for example <code>?source=newsletter</code>.</p>
      <label className="prompt" htmlFor="share-embed">Embed on a page</label>
      <textarea id="share-embed" readOnly rows={9} value={snippet} onFocus={(e) => { e.target.select(); }} />
      <button type="button" onClick={() => { copy('embed', snippet); }}>{copied === 'embed' ? 'Copied' : 'Copy embed code'}</button>
    </details>
  );
}
