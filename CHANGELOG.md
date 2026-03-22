# Changelog

## [1.0.0] - 2026-03-22

### Added

- MCP server running inside VS Code, exposing language server features over Streamable HTTP
- **Read-only tools:** `get_diagnostics`, `get_hover`, `go_to_definition`, `find_references`, `get_completions`, `get_document_symbols`
- **Refactoring tools:** `rename_symbol`, `move_file`
- **Bulk query tools:** `query_workspace_symbols`, `find_imports`, `get_dependency_graph`
- **Semantic tools:** `get_code_actions`, `get_call_hierarchy`, `find_implementations`, `get_type_hierarchy`
- Language-agnostic — works with any language that has a VS Code language server
- Configurable port and auto-start settings
- Status bar indicator showing server status
- Setup instructions command with clipboard copy
