# pi-reasoning-switch

Set the model's thinking (reasoning) level from inside pi with the `/reasoning` command.

## Install

```bash
# From GitHub (any of these v1 references work; the floating tags track the latest stable v1.x release)
pi install git:github.com/imtim/pi-reasoning-switch@v1
pi install git:github.com/imtim/pi-reasoning-switch@v1.0
pi install git:github.com/imtim/pi-reasoning-switch@v1.0.0

# Local clone (for development)
pi install /path/to/pi-reasoning-switch
```

## Usage

| Command | Effect |
| --- | --- |
| `/reasoning` | Open an interactive selector listing every level the current model supports, including `off` — plus a `Memory: ON/OFF` toggle and an `All models` unified-level row |
| `/reasoning <level>` | Set a level directly: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |

Tab-completion lists the levels after `/reasoning `. (pi's own built-in `/thinking` command is unrelated to this extension and keeps working.)

## Behavior

- **Follows pi's model configuration** — the selector options come from the active model's config: non-reasoning models only offer `off`, and levels marked `null` in the model's `thinkingLevelMap` are hidden.
- **Clamping** — pi clamps the requested level to the active model's capabilities. The confirmation notification always shows the level actually in effect.
- **Non-interactive safety** — outside the TUI (`pi -p`, json mode) a bare `/reasoning` shows a hint instead of trying to open a picker.
- **Per-model thinking memory** — the extension remembers the thinking level you explicitly set for each `provider/model` pair and re-applies it whenever that model is selected again (via `Ctrl+P` cycling, `/model`, or session restore). The same model id on different providers keeps independent levels (e.g. `opencode-go/deepseek-v4-flash` vs `deepseek/deepseek-v4-flash`). Set a level on a model — max, low, whatever — switch away, switch back: the remembered level is restored.

  Only explicit changes are recorded. Inherited/clamped levels that pi applies as a side effect of switching models are discarded, so switching around never overwrites a level you set deliberately.

## Unified level (All models)

The `All models` row in the `/reasoning` selector sets one thinking level for every model. Pick a level (or `Default (per-model)` to clear it). While a unified level is active it wins over per-model memory on every switch and at session start: each model gets the level clamped down until supported (e.g. `max` on a model that tops out at `high` → `high`). The current model is re-leveled immediately when you pick a level. Per-model recording stays dormant while a unified level is active, so the memory is not polluted by the forced levels; it resumes untouched when you go back to `Default`.

## Memory file

Levels, the memory toggle, and the unified level are persisted to `~/.pi/pi-reasoning-switch-state.json` (`{ "memoryEnabled": true, "globalLevel": "max" | null, "levels": { "provider/model": "level" } }`). Delete the file to reset everything. Models without a recorded level keep pi's default behavior (inherit the previous level, clamped to the model's capabilities).

The `Memory: ON/OFF` row in the `/reasoning` selector is a master switch: `OFF` stops both recording new levels and restoring remembered ones — switching then behaves like vanilla pi (inherit + clamp). Existing records are kept in the file and resume applying when switched back `ON`.

## Development

- `extensions/thinking-switch.ts` — the whole extension (single file, no runtime dependencies beyond pi's bundled packages).

## Package layout

```
pi-reasoning-switch/
├── package.json            # pi manifest (pi.extensions -> ./extensions)
├── extensions/
│   └── thinking-switch.ts
└── README.md
```
