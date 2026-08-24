/**
 * pi-reasoning-switch
 *
 * Set the model's thinking (reasoning) level with the /reasoning command.
 *
 * Usage:
 *   /reasoning           Open an interactive selector (TUI mode) listing every
 *                        level the current model supports, including "off"
 *   /reasoning <level>   Set a specific level directly:
 *                        off | minimal | low | medium | high | xhigh | max
 *
 * The selector options follow pi's model configuration: non-reasoning models
 * only offer "off", and levels marked null in the model's thinkingLevelMap are
 * hidden. The requested level is clamped by pi to the active model's
 * capabilities.
 *
 * Note: there is deliberately no /thinking command here — newer pi versions
 * ship a built-in /thinking command, and an extension command with the same
 * name would never run (pi intercepts it first) while producing a conflict
 * warning at startup.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels, clampThinkingLevel } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text, getKeybindings, type AutocompleteItem, type SelectItem } from "@earendil-works/pi-tui";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * Per-model thinking memory: remembers the thinking level that was in effect
 * for each (provider, model) pair and re-applies it whenever that model is
 * selected again. Keyed by `${provider}/${id}`, so the same model id on
 * different providers keeps independent levels.
 *
 * Persisted to ~/.pi/pi-reasoning-switch-state.json; delete that file to reset.
 */
const STATE_FILE = join(homedir(), ".pi", "pi-reasoning-switch-state.json");

/** Remembered level per model, keyed by "provider/id". */
type LevelMemory = Record<string, ThinkingLevel>;

let levelMemory: LevelMemory = {};
let memoryEnabled = true; // master toggle: off = no recording and no restoring
let globalLevel: ThinkingLevel | null = null; // unified level for all models (clamped per model)
const memoryReady: Promise<void> = loadMemory();

async function loadMemory(): Promise<void> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as { memoryEnabled?: boolean; globalLevel?: ThinkingLevel | null; levels?: LevelMemory };
    memoryEnabled = parsed.memoryEnabled ?? true;
    globalLevel = parsed.globalLevel ?? null;
    levelMemory = parsed.levels ?? {};
  } catch {
    levelMemory = {}; // missing or unreadable file: start empty
  }
}

async function persistMemory(): Promise<void> {
  await mkdir(join(homedir(), ".pi"), { recursive: true });
  await writeFile(
    STATE_FILE,
    JSON.stringify({ memoryEnabled, globalLevel, levels: levelMemory }, null, 2),
    "utf8",
  );
}

function modelKey(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}

const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
  off: "Thinking disabled",
  minimal: "Minimal thinking",
  low: "Low effort thinking",
  medium: "Medium effort thinking",
  high: "High effort thinking",
  xhigh: "Extra high effort thinking",
  max: "Maximum effort thinking",
};

export default function thinkingSwitch(pi: ExtensionAPI) {
  /** Levels the current model actually supports, using pi's own model logic
   *  (same rules as the footer thinking cycle and switch-time clamping). */
  function supportedLevels(ctx: ExtensionContext): ThinkingLevel[] {
    const model = ctx.model;
    if (!model || !model.reasoning) return ["off"];
    return getSupportedThinkingLevels(model);
  }

  function setLevel(level: ThinkingLevel, ctx: ExtensionContext) {
    pi.setThinkingLevel(level);
    const actual = pi.getThinkingLevel();
    ctx.ui.notify(`Thinking: ${actual === "off" ? "off" : actual}`, "info");
  }

  /** Interactive level picker, options follow pi's model configuration, plus
   *  a Memory ON/OFF toggle and an "All models" unified-level row. */
  async function showSelector(ctx: ExtensionContext) {
    const levels = supportedLevels(ctx);
    const current = pi.getThinkingLevel();

    const mainItems = (): SelectItem[] => [
      ...levels.map((level) => ({
        value: level,
        label: level === current ? `${level} (current)` : level,
        description: LEVEL_DESCRIPTIONS[level],
      })),
      { value: "__sep__", label: "────────────────" },
      {
        value: "__memory__",
        label: `Memory: ${memoryEnabled ? "ON" : "OFF"}`,
        description: memoryEnabled
          ? "Remember level per model and restore it on switch"
          : "Per-model memory disabled; switching inherits the previous level",
      },
      {
        value: "__global__",
        label: `All models: ${globalLevel ?? "per-model"}`,
        description: globalLevel
          ? `Force ${globalLevel} on every model; unsupported levels step down per model`
          : "Set one thinking level for all models",
      },
    ];

    const globalItems = (): SelectItem[] => [
      ...LEVELS.map((level) => ({
        value: `g:${level}`,
        label: level === globalLevel ? `${level} (current)` : level,
        description: LEVEL_DESCRIPTIONS[level],
      })),
      { value: "__sep__", label: "────────────────" },
      {
        value: "g:default",
        label: "Default (per-model)",
        description: "Stop forcing a unified level; per-model memory resumes",
      },
    ];

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
      container.addChild(new Text(theme.fg("accent", theme.bold("Thinking level"))));
      container.addChild(new Text(theme.fg("dim", `Model: ${ctx.model?.provider}/${ctx.model?.id}`)));

      let mode: "main" | "global" = "main";
      let selectList: SelectList | null = null;
      const selectListTheme = {
        selectedPrefix: (text: string) => theme.fg("accent", text),
        selectedText: (text: string) => theme.fg("accent", text),
        description: (text: string) => theme.fg("muted", text),
        scrollInfo: (text: string) => theme.fg("dim", text),
        noMatch: (text: string) => theme.fg("warning", text),
      };

      const currentItems = (): SelectItem[] => (mode === "main" ? mainItems() : globalItems());

      const rebuild = (index?: number) => {
        const items = currentItems();
        if (selectList) container.removeChild(selectList);
        selectList = new SelectList(items, Math.min(items.length, 8), selectListTheme);
        selectList.onSelect = handleSelect;
        selectList.onCancel = handleCancel;
        if (index !== undefined) selectList.setSelectedIndex(index);
        container.addChild(selectList);
        tui.requestRender();
      };

      const handleCancel = () => {
        if (mode === "global") {
          mode = "main";
          rebuild(mainItems().length - 1); // back on the All models row
          return;
        }
        done(null);
      };

      const handleSelect = (item: SelectItem) => {
        if (item.value === "__sep__") return; // inert divider
        if (mode === "main") {
          if (item.value === "__memory__") {
            memoryEnabled = !memoryEnabled;
            void persistMemory();
            rebuild(mainItems().length - 2); // stay on the Memory row (last two rows: Memory, All models)
            return;
          }
          if (item.value === "__global__") {
            mode = "global";
            const idx = globalLevel ? LEVELS.indexOf(globalLevel) : -1;
            rebuild(idx >= 0 ? idx : 0);
            return;
          }
          done(item.value);
          return;
        }
        // global mode: pick a level or Default
        const raw = item.value.startsWith("g:") ? item.value.slice(2) : null;
        if (raw) {
          globalLevel = raw === "default" ? null : (raw as ThinkingLevel);
          void persistMemory();
          mode = "main";
          // Apply the unified level to the current model immediately.
          const model = ctx.model;
          if (model && globalLevel) {
            const target = clampThinkingLevel(model, globalLevel);
            if (pi.getThinkingLevel() !== target) pi.setThinkingLevel(target);
          }
          rebuild(mainItems().length - 1); // back on the All models row
        }
      };

      rebuild(0);

      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
      container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          if (!selectList) return;
          const kb = getKeybindings();
          // Skip the divider when navigating up/down so it never gets selected.
          if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down")) {
            const items = currentItems();
            const currentIndex = items.findIndex((item) => item.value === selectList!.getSelectedItem()?.value);
            if (currentIndex !== -1) {
              const delta = kb.matches(data, "tui.select.up") ? -1 : 1;
              let nextIndex = (currentIndex + delta + items.length) % items.length;
              let guard = items.length;
              while (items[nextIndex]?.value === "__sep__" && guard-- > 0) {
                nextIndex = (nextIndex + delta + items.length) % items.length;
              }
              if (items[nextIndex]?.value !== "__sep__") {
                selectList.setSelectedIndex(nextIndex);
                tui.requestRender();
                return;
              }
            }
          }
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    });

    if (!result) return; // cancelled
    setLevel(result as ThinkingLevel, ctx);
  }

  async function handleCommand(args: string | undefined, ctx: ExtensionContext) {
    const arg = (args ?? "").trim().toLowerCase();

    if (!arg) {
      if (!ctx.hasUI) {
        ctx.ui.notify(`No level given. Use /reasoning ${LEVELS.join("|")}`, "warning");
        return;
      }
      await showSelector(ctx);
      return;
    }
    if ((LEVELS as readonly string[]).includes(arg)) {
      setLevel(arg as ThinkingLevel, ctx);
      return;
    }
    ctx.ui.notify(`Unknown thinking level "${args}". Use: ${LEVELS.join(", ")}`, "error");
  }

  pi.registerCommand("reasoning", {
    description: "Set thinking level (off|minimal|low|medium|high|xhigh|max)",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = LEVELS.filter((value) => value.startsWith(prefix)).map((value) => ({
        value,
        label: value,
      }));
      return items.length > 0 ? items : null;
    },
    handler: handleCommand,
  });

  // --- Per-model thinking memory ----------------------------------------

  // pi fires thinking_level_select both for explicit user changes (footer
  // cycle, /reasoning, RPC) and for the built-in inherit-and-clamp that runs
  // during a model switch. Only explicit changes are recorded: the clamp value
  // is a side effect of inheritance, not a user choice, and recording it would
  // overwrite the remembered level (e.g. arriving at a model that clamps
  // low -> high would clobber its remembered low). model_select always follows
  // the switch-time clamp within the same event-loop turn, so records are
  // deferred to the next macrotask and discarded when a switch follows.

  let pending: { key: string; level: ThinkingLevel } | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  pi.on("thinking_level_select", async (event, ctx) => {
    await memoryReady;
    // While a unified level is active it owns the level on every switch, so
    // per-model recording stays dormant to avoid polluting the memory.
    if (!memoryEnabled || globalLevel) return;
    const model = ctx.model;
    if (!model) return;
    const key = modelKey(model);
    if (levelMemory[key] === event.level) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pending = { key, level: event.level };
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (!pending) return;
      levelMemory[pending.key] = pending.level;
      void persistMemory();
      pending = null;
    }, 0);
  });

  /** Unified level wins when set; otherwise the remembered per-model level
   *  (when memory is enabled). Falls back to pi's inherit-and-clamp. */
  function applyLevelForModel(model: Model<any> | undefined) {
    if (!model) return;
    if (globalLevel) {
      const target = clampThinkingLevel(model, globalLevel);
      if (pi.getThinkingLevel() !== target) pi.setThinkingLevel(target);
      return;
    }
    if (!memoryEnabled) return;
    const remembered = levelMemory[modelKey(model)];
    if (remembered && pi.getThinkingLevel() !== remembered) {
      pi.setThinkingLevel(remembered);
    }
  }

  // Re-apply the remembered level when a model is selected. Runs after pi's
  // built-in inherit-and-clamp, so a remembered value wins over inheritance;
  // pi.setThinkingLevel clamps to the model's supported levels.
  pi.on("model_select", async (event, _ctx) => {
    await memoryReady;
    // A deferred record for the newly selected model is the switch-time
    // inherit-and-clamp side effect — discard it instead of persisting, so the
    // model's remembered level survives the switch.
    if (pending && pending.key === modelKey(event.model)) {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = null;
      pending = null;
    }
    applyLevelForModel(event.model);
  });

  // model_select does not fire at session start, so also apply the level
  // for the current model when a session starts (startup/new/resume/fork).
  pi.on("session_start", async (_event, ctx) => {
    await memoryReady;
    applyLevelForModel(ctx.model);
  });
}
