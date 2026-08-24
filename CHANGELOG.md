# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- `/thinking` alias — newer pi versions ship a built-in `/thinking` command that intercepts the name before extension commands run, so the alias was dead weight and triggered a startup conflict warning. Use `/reasoning`; the built-in `/thinking` keeps working as before.

## [1.0.0] - 2026-08-19

### Added

- `/reasoning` command — open an interactive selector listing every level the current model supports, plus a Memory ON/OFF toggle and an `All models` unified-level row. Set a level directly with `/reasoning <level>`.
- `/thinking` alias kept for muscle memory.
- Per-model thinking memory — the extension remembers the thinking level explicitly set for each `provider/model` pair and re-applies it whenever that model is selected again (Ctrl+P cycling, `/model`, session restore). The same model id on different providers keeps independent levels.
- `Memory: ON/OFF` master toggle in the selector — turns off both recording new levels and restoring remembered ones; existing records are kept and resume when switched back ON.
- `All models` unified level — one level applied across every model, clamped down per model. The current model is re-leveled immediately when picked. Per-model recording stays dormant while a unified level is active.
- State persisted to `~/.pi/pi-reasoning-switch-state.json` — delete the file to reset.
- Tab-completion lists the levels after `/reasoning `.

### Changed

- Package renamed from `pi-thinking-switch` to `pi-reasoning-switch`; `/thinking` kept as an alias.
- `/reasoning` selector options follow pi's model configuration via `getSupportedThinkingLevels` — non-reasoning models only offer `off`, and levels marked `null` in the model's `thinkingLevelMap` are hidden.
- Requested levels are clamped to the active model's capabilities; the confirmation notification always shows the level actually in effect.
- Outside the TUI (`pi -p`, json mode) a bare `/reasoning` shows a hint instead of opening a picker.
- Only explicit level changes are recorded as per-model memory; inherited/clamped levels that pi applies as a side effect of switching models are discarded, so deliberate choices are never overwritten.

### Removed

- Status-bar thinking indicator (use the in-session `/reasoning` selector instead).

[Unreleased]: https://github.com/imtim/pi-reasoning-switch/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/imtim/pi-reasoning-switch/releases/tag/v1.0.0