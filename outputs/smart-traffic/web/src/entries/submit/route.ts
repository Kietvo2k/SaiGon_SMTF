export function isVercelDemoRoute(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === 'vercel'
    || import.meta.env.VITE_SMTF_SUBMIT === '1';
}
