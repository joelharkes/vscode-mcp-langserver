# VSCode MCP Language Server Bridge Extension

## Context

Claude Code can connect to MCP servers to gain new tools. VSCode already runs language servers (TypeScript, Python, etc.) that provide rich code intelligence. This extension bridges the gap: it runs an MCP server inside VSCode that exposes language server features as MCP tools, letting Claude Code access diagnostics, go-to-definition, hover info, completions, and refactoring capabilities.

**Key insight:** VSCode's `vscode.commands.executeCommand` APIs (`vscode.executeDefinitionProvider`, etc.) are **language-agnostic** — they work for any language that has a registered provider. So this extension is inherently language-agnostic from day one, even though we'll test with TypeScript first.

## Architecture

```
Claude Code  ──(Streamable HTTP)──>  VSCode Extension (MCP Server)  ──(VSCode API)──>  Language Servers
```

- **Transport:** Streamable HTTP (single POST endpoint on localhost)
- **MCP SDK:** `@modelcontextprotocol/sdk` with `NodeStreamableHTTPServerTransport`
- **HTTP Server:** Express (well-tested with MCP SDK, lightweight enough for extension)
- **Session mode:** Stateless (each request independent — simpler, sufficient for local use)
- **Auto-start:** Extension activates on workspace open, starts HTTP server automatically

## Key Design Decisions

1. **Language-agnostic by default:** All tools use VSCode's generic `executeCommand` APIs, not TS-specific ones. Works with any language that has a registered provider.
2. **Stateless HTTP:** No session management needed. Simpler code, no cleanup issues.
3. **`apply` parameter on refactoring tools:** Claude can choose to preview changes (get the edit list) or apply directly. Defaults to preview (safer).
4. **Relative file paths:** Tools accept paths relative to workspace root. The extension resolves them against `vscode.workspace.workspaceFolders[0]`.
5. **Express for HTTP:** Proven pattern with the MCP SDK. Avoids compatibility issues with raw `http` module.

## VSCode Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mcpLangserver.port` | `3333` | HTTP port for the MCP server |
| `mcpLangserver.autoStart` | `true` | Start MCP server automatically on workspace open |

---

## TODO

### Step 1: Scaffold the VSCode Extension ✅
- [x] Scaffold TypeScript VSCode extension (ID: `mcp-langserver`)
- [x] Set activation event to `onStartupFinished`
- [x] Install deps: `@modelcontextprotocol/sdk`, `express`, `zod`
- [x] Set up project structure (`src/tools/`, `src/utils/`)

### Step 2: MCP Server + HTTP Transport ✅
- [x] Create `src/server.ts` — MCP Server + Express + Streamable HTTP transport (stateless)
- [x] Create `src/extension.ts` — activate/deactivate lifecycle wiring
- [x] Add VSCode settings for port and auto-start
- [x] Accept header middleware workaround for MCP SDK compatibility
- [x] Verify end-to-end with Claude Code

### Step 3: Implement `get_diagnostics` Tool ✅
- [x] Create `src/utils/vscode-bridge.ts` — `resolveUri()`, `formatDiagnosticsReport()`, `locationToJson()`
- [x] Create `src/utils/position.ts` — shared Zod schemas for file/position params
- [x] Create `src/tools/diagnostics.ts` — compiler-style output (1-based lines, grouped by file, summary counts, related info)
- [x] Create `src/tools/register.ts` — wrapper to bypass TS2589 deep Zod generics
- [x] Verify end-to-end: Claude Code connects and calls `get_diagnostics`

### Step 4: Implement Read-Only Tools ✅
- [x] `get_hover` — `vscode.executeHoverProvider` → markdown content
- [x] `go_to_definition` — `vscode.executeDefinitionProvider` → locations (grouped by file)
- [x] `find_references` — `vscode.executeReferenceProvider` → references (grouped by file)
- [x] `get_completions` — `vscode.executeCompletionItemProvider` → items (default limit 50, sortable)
- [x] `get_document_symbols` — `vscode.executeDocumentSymbolProvider` → indented symbol tree
- [x] All tools use 1-based line/character input (converted to 0-based internally)
- [x] All tools output AI-friendly text format (not JSON)

### Step 5: Implement Refactoring Tools ✅
- [x] `rename_symbol` — `vscode.executeRenameProvider` → WorkspaceEdit (with `apply` param)
- [x] `move_file` (stretch) — WorkspaceEdit `renameFile` + update imports

### Step 6: Setup UX ✅
- [x] VSCode command: `MCP Langserver: Show Setup Instructions` (notification + copy to clipboard)
- [x] Status bar item showing MCP server status (running/stopped + port)
- [x] First-run welcome popup using `globalState`

### Step 7: Set Query Tools (Bulk Operations) ✅
Current tools are point queries (single file, single symbol). This step adds set queries that operate across many files at once — addressing the gap where an AI would need hundreds of individual calls for bulk structural analysis.

#### 7a. `query_workspace_symbols` tool ✅
- [x] Add `formatWorkspaceSymbols()` to `src/utils/vscode-bridge.ts`
- [x] Create `src/tools/query_workspace_symbols.ts`
- [x] Register in `src/tools/index.ts`

#### 7b. Import parser infrastructure + `find_imports` tool ✅
- [x] Create `src/utils/import-parser.ts` — `parseImports(text, languageId)` with regex patterns for JS/TS, Python, Go, Rust, Java/Kotlin, C/C++
- [x] Add `formatImportsReport()` to `src/utils/vscode-bridge.ts`
- [x] Create `src/tools/find_imports.ts`
- [x] Register in `src/tools/index.ts`

#### 7c. Enhance `get_document_symbols` with glob + kind filter ✅
- [x] Add `filterSymbolsByKind()` and `formatMultiFileSymbols()` to `src/utils/vscode-bridge.ts`
- [x] Modify `src/tools/get_document_symbols.ts` — add optional `glob` and `kind` params
- [x] Ensure backward compatibility (single `file` param still works identically)

#### 7d. `get_dependency_graph` tool ✅
- [x] Add `resolveImportPath()` to `src/utils/import-parser.ts`
- [x] Add `formatDependencyGraph()` to `src/utils/vscode-bridge.ts`
- [x] Create `src/tools/get_dependency_graph.ts`
- [x] Register in `src/tools/index.ts`

---

## Implementation Details

### Project structure
```
src/
  extension.ts                    # Extension entry point (activate/deactivate)
  server.ts                       # MCP server setup + Express HTTP server
  tools/
    index.ts                      # Tool registration barrel
    get_diagnostics.ts            # get_diagnostics tool
    get_hover.ts                  # get_hover tool
    go_to_definition.ts           # go_to_definition tool
    find_references.ts            # find_references tool
    get_completions.ts            # get_completions tool
    get_document_symbols.ts       # get_document_symbols tool (supports glob)
    rename_symbol.ts              # rename_symbol tool
    move_file.ts                  # move_file tool
    query_workspace_symbols.ts    # query_workspace_symbols tool (set query)
    find_imports.ts               # find_imports tool (set query)
    get_dependency_graph.ts       # get_dependency_graph tool (set query)
  utils/
    vscode-bridge.ts              # Helpers to convert VSCode types to plain text
    position.ts                   # Common parameter schemas (file, line, character)
    register.ts                   # registerTool() wrapper (bypasses TS2589)
    import-parser.ts              # Regex-based multi-language import parser
```

### Tool Specifications

**`get_diagnostics`**
- Params: `{ file?: string }` (optional — if omitted, returns all workspace diagnostics)
- API: `vscode.languages.getDiagnostics(uri?)`
- Returns: Compiler-style text report (1-based lines, grouped by file, summary counts, related info)

**`get_hover`**
- Params: `{ file, line, character }` (1-based)
- API: `vscode.executeHoverProvider(uri, position)`
- Returns: Markdown content (type signatures, documentation)

**`go_to_definition`**
- Params: `{ file, line, character }` (1-based)
- API: `vscode.executeDefinitionProvider(uri, position)`
- Returns: Locations grouped by file (`file:line:col` format, 1-based)

**`find_references`**
- Params: `{ file, line, character }` (1-based)
- API: `vscode.executeReferenceProvider(uri, position)`
- Returns: References grouped by file with count summary

**`get_completions`**
- Params: `{ file, line, character, limit? }` (1-based, limit default 50)
- API: `vscode.executeCompletionItemProvider(uri, position)`
- Returns: Sorted text list: `label  kind  detail`

**`get_document_symbols`**
- Params: `{ file }`
- API: `vscode.executeDocumentSymbolProvider(uri)`
- Returns: Indented symbol tree: `name  kind  line:col-line:col`

**`rename_symbol`**
- Params: `{ file: string, line: number, character: number, newName: string, apply?: boolean }`
- API: `vscode.executeRenameProvider(uri, position, newName)` → WorkspaceEdit
- If `apply: false` (default): serialize edit to JSON
- If `apply: true`: call `vscode.workspace.applyEdit(edit)`

**`move_file`** (stretch goal)
- Params: `{ oldPath: string, newPath: string, apply?: boolean }`
- Creates WorkspaceEdit with `renameFile`, triggers import updates
- **Caveat:** Import updating relies on language extensions participating in VSCode's `onWillRenameFiles` event. TS and Pylance do; not all languages will. Our code stays generic — result quality depends on the language server.

**`query_workspace_symbols`** (set query)
- Params: `{ query: string, kind?: string, limit?: number }` (limit default 50)
- API: `vscode.executeWorkspaceSymbolProvider(query)` → `SymbolInformation[]`
- Optional `kind` filter (e.g. "Function", "Class") applied post-query
- Returns: Symbols grouped by file: `name  kind  line:col`
- Note: Query semantics vary by language server (fuzzy, prefix, substring)

**`find_imports`** (set query)
- Params: `{ file?: string, glob?: string, limit?: number }` (at least one of file/glob required, limit default 100)
- API: `vscode.workspace.openTextDocument(uri)` → regex-parse imports
- Language support: JS/TS (`import/require/export from`), Python (`import/from`), Go (`import`), Rust (`use/extern crate`), Java/Kotlin (`import`), C/C++ (`#include`)
- Returns: Imports per file with line numbers and relative/external classification
- Note: Regex-based — covers ~95% of cases, may miss edge cases in comments/strings

**`get_document_symbols`** (enhanced — now supports glob)
- Params: `{ file?: string, glob?: string, kind?: string, limit?: number }` (at least one of file/glob required, limit default 50 for glob)
- When `file` only: identical to current behavior
- When `glob`: runs document symbol provider on all matching files, returns multi-file tree
- Optional `kind` filter keeps only matching symbols (preserving parent context)

**`get_dependency_graph`** (set query)
- Params: `{ glob?: string, depth?: number, limit?: number }` (glob defaults to all source files, depth default 1 max 5, limit default 200)
- Built on `parseImports()` from import-parser — resolves relative imports to workspace files
- Returns: Adjacency list — each file with its internal (→ file) and external ([ext] package) dependencies
- Import resolution tries common extensions (.ts, .tsx, .js, .jsx, /index.ts, etc.)

### Known Limitations & Considerations (Set Query Tools)

1. **Import parser doesn't strip comments.** A commented-out import like `// import { foo } from 'bar'` will be matched as a real import. Acceptable for ~95% of real code; a comment-stripping pass can be added later if false positives become noisy.

2. **`query_workspace_symbols` requires a non-empty query.** LSP's `workspace/symbol` doesn't support empty queries (most language servers return nothing). Unlike `get_document_symbols` with a glob which dumps everything, this tool requires knowing what you're searching for. The Zod schema enforces `min(1)`.

3. **Dependency graph resolves relative imports only.** Package imports (e.g. `lodash`, `@scope/pkg`) are listed as `[ext]` but never resolved to `node_modules` files. The graph shows workspace-internal structure only.

4. **Python relative import resolution is limited.** `from .foo import bar` and `import os` are parsed, but Python's package structure (`from mypackage.submodule import X` where `mypackage` is a workspace directory) isn't resolved — those show up as external rather than internal in the dependency graph. Fixing this would require understanding Python's `__init__.py`-based package layout.

5. **`filterSymbolsByKind` clones symbols via `Object.create(Object.getPrototypeOf(sym))`.** In VSCode's extension host `DocumentSymbol` objects are plain objects so this works. If the API ever returns sealed/frozen objects it would break — could switch to just filtering without cloning since results are ephemeral.

6. **`get_document_symbols` schema change is backward-compatible but `file` is now optional.** Existing callers passing `file` work identically. A call with no params now returns a text error message instead of a Zod validation error — slightly different error path but functionally equivalent.

### Verification

1. **Build:** `npm run compile` should succeed
2. **Run extension:** F5 in VSCode → Extension Development Host
3. **Test MCP server:** `curl -X POST http://localhost:3333/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test"}},"id":1}'`
4. **Test with Claude Code:** Add MCP config to `.mcp.json`, ask Claude to check for TS errors
5. **Test each tool:** Open a TS project, verify each tool returns sensible results
