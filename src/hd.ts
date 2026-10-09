/** ?hd=2 renders the same 390x844 scene on a 2x canvas (crisp clips); scenes zoom their camera to match. */
export const HD = Math.max(1, Math.min(4, Number(new URLSearchParams(window.location.search).get('hd')) || 1));
