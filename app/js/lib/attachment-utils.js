/**
 * AttachmentUtils — pure classification and size-cap rules for prompt
 * panel attachments. Extracted from prompt-panel.js so the rules can be
 * unit-tested in isolation (the full panel boot is too heavy for
 * vitest + jsdom).
 *
 * Five kinds: 'image' | 'audio' | 'video' | 'pdf' | 'text'. Anything
 * else returns null — callers should surface an "unsupported file"
 * error.
 *
 * MIME type is the primary signal. When the browser reports empty or
 * `application/octet-stream` (common for dragged-in media and code
 * files), we fall back to filename extension matching.
 */
const AttachmentUtils = (() => {

  const MAX_COUNT = 4;

  const CAPS = Object.freeze({
    image: 5  * 1024 * 1024, // 5MB
    pdf:   10 * 1024 * 1024, // 10MB
    text:  1  * 1024 * 1024, // 1MB
    audio: 20 * 1024 * 1024, // 20MB (Gemini inline cap)
    video: 20 * 1024 * 1024, // 20MB (Gemini inline cap)
  });

  const FALLBACK_MODEL = 'gemini-2.5-flash';

  const TEXT_MIME_PREFIXES = ['text/'];
  const TEXT_MIME_EXTRAS = [
    'application/json', 'application/xml', 'application/yaml', 'application/x-yaml',
    'application/javascript', 'application/typescript', 'application/sql',
    'application/x-sh', 'application/toml',
    'application/rtf', 'text/rtf',
    'application/graphql', 'application/x-latex', 'application/x-tex',
    'application/x-yaml', 'application/x-toml',
    'application/ld+json', 'application/x-ndjson', 'application/jsonl',
    'application/x-httpd-php',
  ];

  const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|weba)$/i;
  const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|mkv|mpeg|mpg|avi|3gp|3g2|wmv|flv)$/i;

  const TEXT_EXTENSIONS = new RegExp('\\.(' + [
    'txt', 'md', 'markdown', 'mdx', 'rtf', 'log', 'rst', 'org', 'adoc', 'asciidoc', 'tex', 'bib',
    'csv', 'tsv', 'json', 'ndjson', 'jsonl', 'geojson', 'ya?ml', 'xml', 'diff', 'patch', 'srt', 'vtt',
    'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'dockerignore', 'dockerfile', 'gitignore',
    'tf', 'tfvars', 'hcl', 'cmake', 'bazel', 'bzl', 'gradle', 'sbt',
    'graphql', 'gql', 'proto', 'thrift', 'cypher', 'rq',
    'html?', 'htm', 'css', 'scss', 'sass', 'less',
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'svelte', 'vue', 'astro',
    'py', 'pyi', 'pyw',
    'c', 'h', 'cpp', 'cxx', 'cc', 'hpp', 'hxx', 'cs', 'swift', 'rs', 'go', 'mod', 'sum',
    'java', 'kt', 'kts', 'scala', 'sc', 'groovy', 'dart', 'zig', 'nim', 'nims', 'v',
    'r', 'rmd', 'jl', 'ml', 'mli', 'fs', 'fsx', 'fsi', 'hs', 'lhs',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'pl', 'lua', 'rb', 'php', 'tcl',
    'm', 'mm',
    'asm', 's', 'sv', 'svh', 'vhdl', 'vhd',
    'sol', 'move', 'cairo',
    'clj', 'cljs', 'cljc', 'edn', 'ex', 'exs', 'erl', 'hrl',
    'sql',
  ].join('|') + ')$', 'i');

  function classify(file) {
    if (!file) return null;
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('audio/')) return 'audio';
    if (type.startsWith('video/')) return 'video';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (TEXT_MIME_PREFIXES.some(p => type.startsWith(p))) return 'text';
    if (TEXT_MIME_EXTRAS.includes(type)) return 'text';
    if (type === '' || type === 'application/octet-stream') {
      if (AUDIO_EXTENSIONS.test(name)) return 'audio';
      if (VIDEO_EXTENSIONS.test(name)) return 'video';
      if (TEXT_EXTENSIONS.test(name))  return 'text';
    }
    return null;
  }

  function maxBytes(kind) {
    return CAPS[kind] != null ? CAPS[kind] : CAPS.text;
  }

  /* Capability each kind requires from the target model. Text has no
     requirement — it's inlined into the prompt as a fenced block. */
  function requiredCapability(kind) {
    if (kind === 'image') return 'vision';
    if (kind === 'pdf')   return 'pdf';
    if (kind === 'audio') return 'audio';
    if (kind === 'video') return 'video';
    return null;
  }

  return { classify, maxBytes, requiredCapability, MAX_COUNT, CAPS, FALLBACK_MODEL };
})();

if (typeof window !== 'undefined') window.AttachmentUtils = AttachmentUtils;
