import * as path from 'path';

export interface ParsedImport {
  /** The import path/module (e.g. "../foo", "lodash", "fmt") */
  source: string;
  /** 1-based line number where the import appears */
  line: number;
  /** Whether this is a relative import (starts with . or ..) */
  isRelative: boolean;
}

/**
 * Parse import statements from source text based on language.
 * Regex-based — covers ~95% of cases; may miss edge cases in comments/strings.
 */
export function parseImports(text: string, languageId: string): ParsedImport[] {
  const parser = parsers[languageId];
  if (!parser) return [];
  return parser(text);
}

/** Supported language IDs */
export const supportedLanguages = new Set([
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'c',
  'cpp',
]);

// --- Language-specific parsers ---

type Parser = (text: string) => ParsedImport[];

const parsers: Record<string, Parser> = {
  javascript: parseJsTs,
  typescript: parseJsTs,
  javascriptreact: parseJsTs,
  typescriptreact: parseJsTs,
  python: parsePython,
  go: parseGo,
  rust: parseRust,
  java: parseJavaKotlin,
  kotlin: parseJavaKotlin,
  c: parseCCpp,
  cpp: parseCCpp,
};

function isRelative(source: string): boolean {
  return source.startsWith('.') || source.startsWith('/');
}

/**
 * JS/TS: import ... from '...', import '...', require('...'), export ... from '...', dynamic import('...')
 */
function parseJsTs(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = text.split('\n');

  // Patterns that capture import sources
  const patterns = [
    // import ... from '...' or import ... from "..."
    /\bimport\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/,
    // import '...' or import "..." (side-effect import)
    /\bimport\s+['"]([^'"]+)['"]/,
    // export ... from '...'
    /\bexport\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/,
    // require('...') or require("...")
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    // dynamic import('...')
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        results.push({
          source: match[1],
          line: i + 1,
          isRelative: isRelative(match[1]),
        });
        break; // One import per line
      }
    }
  }

  return results;
}

/**
 * Python: import xxx, from xxx import yyy
 */
function parsePython(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // from xxx import yyy
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import\b/);
    if (fromMatch) {
      const source = fromMatch[1];
      results.push({
        source,
        line: i + 1,
        isRelative: source.startsWith('.'),
      });
      continue;
    }

    // import xxx, import xxx as yyy, import xxx, yyy
    const importMatch = line.match(/^import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/);
    if (importMatch) {
      // Split by comma to handle `import os, sys`
      const modules = importMatch[1].split(',');
      for (const mod of modules) {
        const name = mod.trim().split(/\s+as\s+/)[0].trim();
        if (name) {
          results.push({
            source: name,
            line: i + 1,
            isRelative: name.startsWith('.'),
          });
        }
      }
    }
  }

  return results;
}

/**
 * Go: import "..." and import (...) blocks
 */
function parseGo(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = text.split('\n');
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Single-line: import "fmt" or import alias "fmt"
    if (!inBlock) {
      const singleMatch = line.match(/^import\s+(?:\w+\s+)?["']([^"']+)["']/);
      if (singleMatch) {
        results.push({
          source: singleMatch[1],
          line: i + 1,
          isRelative: singleMatch[1].startsWith('.'),
        });
        continue;
      }

      // Start of import block
      if (line.match(/^import\s*\(/)) {
        inBlock = true;
        continue;
      }
    }

    if (inBlock) {
      if (line === ')') {
        inBlock = false;
        continue;
      }

      // Inside block: "fmt" or alias "github.com/..."
      const blockMatch = line.match(/(?:\w+\s+)?["']([^"']+)["']/);
      if (blockMatch) {
        results.push({
          source: blockMatch[1],
          line: i + 1,
          isRelative: blockMatch[1].startsWith('.'),
        });
      }
    }
  }

  return results;
}

/**
 * Rust: use crate::..., use std::..., extern crate ...
 */
function parseRust(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // use crate::foo::bar or use std::collections::HashMap
    const useMatch = line.match(/^(?:pub\s+)?use\s+([\w:]+)/);
    if (useMatch) {
      const source = useMatch[1];
      results.push({
        source,
        line: i + 1,
        isRelative: source.startsWith('crate::') || source.startsWith('self::') || source.startsWith('super::'),
      });
      continue;
    }

    // extern crate foo
    const externMatch = line.match(/^extern\s+crate\s+(\w+)/);
    if (externMatch) {
      results.push({
        source: externMatch[1],
        line: i + 1,
        isRelative: false,
      });
    }
  }

  return results;
}

/**
 * Java/Kotlin: import xxx.yyy.Zzz;
 */
function parseJavaKotlin(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^import\s+(?:static\s+)?([\w.*]+)\s*;?/);
    if (match) {
      results.push({
        source: match[1],
        line: i + 1,
        isRelative: false, // Java/Kotlin imports are always fully qualified
      });
    }
  }

  return results;
}

/**
 * C/C++: #include <...> and #include "..."
 */
function parseCCpp(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // #include <header> or #include "header"
    const match = line.match(/^#\s*include\s+[<"]([^>"]+)[>"]/);
    if (match) {
      results.push({
        source: match[1],
        line: i + 1,
        isRelative: line.includes('"'), // "" is relative, <> is system
      });
    }
  }

  return results;
}

// --- Import resolution for dependency graph ---

/** Extensions to try when resolving relative imports (JS/TS ecosystem) */
const jsExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

/**
 * Resolve a relative import source to a workspace-relative file path.
 * Returns null if the import is external (package) or can't be resolved.
 */
export function resolveImportPath(
  importSource: string,
  importingFile: string,
  knownFiles: Set<string>,
  languageId: string
): string | null {
  // Only resolve relative imports
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null;
  }

  const dir = path.dirname(importingFile);
  const resolved = path.normalize(path.join(dir, importSource));

  // For JS/TS, try multiple extensions
  if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(languageId)) {
    for (const ext of jsExtensions) {
      const candidate = resolved + ext;
      if (knownFiles.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // For other languages, the import usually includes the extension or maps directly
  if (knownFiles.has(resolved)) {
    return resolved;
  }

  // Try with common extensions for the language
  const langExtensions: Record<string, string[]> = {
    python: ['.py', '/__init__.py'],
    go: ['.go'],
    rust: ['.rs'],
    c: ['.h', '.c'],
    cpp: ['.hpp', '.h', '.cpp'],
  };

  const exts = langExtensions[languageId] || [];
  for (const ext of exts) {
    const candidate = resolved + ext;
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}
