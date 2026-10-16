"use client";
import Image from "next/image";
import { LayoutChoices } from "./layout-choices";
import type { DeskFocus } from "./desk-focus-guide";
import { StorageSettings, type CloudStorage } from "./storage-settings";
import { AccountSummary } from "./account-summary";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { desks, elements, lightColor, ribbons, stocks } from "@/lib/materials";
import {
  defaultPaper,
  paperRulings,
  paperRuling,
  type PaperRuling,
  type Owner,
  type PaperOptions,
  type Settings,
} from "@/lib/writing";
import { machineAudio } from "@/lib/audio";
import {
  typewriterList,
  getTypewriterModel,
  modelVariation,
} from "@/lib/typewriters";
import { typeSize, typeSizePatch } from "@/lib/type-size";
import { clockStyleList } from "@/lib/clocks";
export type ReferenceTab =
  | "Settings"
  | "Machine"
  | "Paper"
  | "Light"
  | "Desk"
  | "Sound"
  | "You"
  | "Storage"
  | "Layout";
const tabs: ReferenceTab[] = ["Machine", "Paper", "Light", "Desk", "Layout"];
/** How long the inspector takes to come out and to be put away, in ms. */
const PANEL_MS = 440;
const PANEL_CLOSE_MS = 260;

// Visual pickers. Every option is drawn as the thing it changes.
type Desk = NonNullable<Settings["desk"]>;
const stockKeys = Object.keys(stocks) as PaperOptions["stock"][];
const deskKeys = Object.keys(desks) as Desk[];
const ribbonKeys = Object.keys(ribbons) as PaperOptions["ribbon"][];
const elementKeys = Object.keys(elements) as PaperOptions["element"][];
const paperStyle = (stock: PaperOptions["stock"]) =>
  ({
    "--tile-paper": stocks[stock].tint,
    "--tile-texture": `url("/textures/paper-${stock}.png")`,
  }) as CSSProperties;
function Tile({
  on,
  label,
  description,
  onPick,
  className = "",
  children,
}: {
  on: boolean;
  label: string;
  description?: string;
  onPick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={`pick ${className}`}
      aria-pressed={on}
      aria-label={description ? `${label}: ${description}` : label}
      title={label}
      onClick={() => {
        onPick();
        machineAudio.pick();
      }}
    >
      {children}
      <span className="pick-caption">
        {label}
        {description && (
          <small className="pick-description">{description}</small>
        )}
      </span>
    </button>
  );
}
function Group({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ref-group ${className}`}>
      <h3 className="ref-label">{label}</h3>
      <div className="ref-row">{children}</div>
    </section>
  );
}
/** A miniature of the desk: surface, sheet, machine and light. */
export function ReferenceCard({
  cloudStorage,
  closing,
  reducedMotion,
  onClosed,
  settings,
  paper,
  owner,
  tab,
  onTabChange,
  update,
  updatePaper,
  updateOwner,
  onClose,
  onStartOnboarding,
  onFocusChange,
  notesStock,
  onNotesStock,
}: {
  cloudStorage: CloudStorage;
  closing: boolean;
  reducedMotion: boolean;
  onClosed: () => void;
  settings: Settings;
  paper: PaperOptions;
  owner: Owner;
  tab: ReferenceTab;
  onTabChange: (tab: ReferenceTab) => void;
  update: (patch: Partial<Settings>) => void;
  updatePaper: (
    patch: Partial<PaperOptions>,
    settings?: Partial<Settings>,
  ) => void;
  updateOwner: (name: string) => void;
  onClose: () => void;
  onStartOnboarding?: () => void;
  onFocusChange?: (focus: DeskFocus) => void;
  /** The copy holder's paper, a preference of this browser. */
  notesStock?: PaperOptions["stock"];
  onNotesStock?: (stock: PaperOptions["stock"]) => void;
}) {
  const [lampControl, setLampControl] = useState<"overhead" | "rail">(
    "overhead",
  );
  useEffect(() => {
    if (tab === "Light")
      onFocusChange?.(lampControl === "rail" ? "rail" : "lamp");
  }, [tab, lampControl, onFocusChange]);
  const previousLightTab = useRef<ReferenceTab | null>(null);
  useEffect(() => {
    if (tab === "Light" && previousLightTab.current !== "Light") {
      update({
        roomLight: false,
        deskLightIntensity: settings.deskLightIntensity || 0.65,
        railLightIntensity: settings.railLightIntensity || 0.35,
      });
    }
    previousLightTab.current = tab;
  }, [tab, update, settings.deskLightIntensity, settings.railLightIntensity]);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const setTab = onTabChange;
  const customizing = tabs.includes(tab);
  const activeModel = getTypewriterModel(settings.model || "d01");
  const currentFinish = modelVariation(
    activeModel,
    "finish",
    settings.variations?.finish,
  );
  const ref = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  const closed = useRef(onClosed);
  closed.current = onClosed;
  const cardMotion = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const narrow = window.innerWidth <= 800;
    // The inspector is a sheet laid onto the desk from its edge: it travels
    // the whole way in, then settles with a hair of overshoot and a slight
    // turn, instead of fading in beside the desk.
    cardMotion.current = card.animate(
      reducedMotion
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            {
              transform: narrow
                ? "translateY(calc(100% + 24px))"
                : "translateX(calc(100% + 28px)) rotate(1.2deg)",
            },
            { transform: "none" },
          ],
      {
        duration: reducedMotion ? 120 : PANEL_MS,
        easing: reducedMotion ? "ease" : "cubic-bezier(0.22, 1.1, 0.36, 1)",
        fill: "both",
      },
    );
    return () => cardMotion.current?.cancel();
  }, [reducedMotion]);
  useEffect(() => {
    const motion = cardMotion.current;
    if (!closing || !motion) return;
    motion.onfinish = () => closed.current();
    // Putting it away is quicker than bringing it out.
    if (!reducedMotion) motion.playbackRate = PANEL_MS / PANEL_CLOSE_MS;
    motion.reverse();
    // Background tabs can pause animations; completing the close must not
    // depend on the browser painting another frame.
    const timeout = window.setTimeout(
      () => closed.current(),
      reducedMotion ? 120 : PANEL_CLOSE_MS + 40,
    );
    return () => {
      motion.onfinish = null;
      window.clearTimeout(timeout);
    };
  }, [closing, reducedMotion]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the sheet itself rather than its first button, so a panel opened
    // with the mouse is not drawn with a keyboard focus ring.
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      // Keep keyboard navigation within the inspector and the active lamp controls.
      if (
        e.defaultPrevented ||
        (!ref.current?.contains(e.target as Node) &&
          !(
            activeTab.current === "Light" &&
            (e.target as Element).closest?.(
              ".pendant-lamp, .pull-cord, .light-fader-input",
            )
          ))
      )
        return;
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input, select, summary, [tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length);
        if (activeTab.current === "Light")
          items.push(
            ...Array.from(
              document.querySelectorAll<HTMLElement>(
                ".pendant-lamp:not(:disabled), .pull-cord, .wall-toggle-switch:not([inert]), .light-fader-input:not(:disabled)",
              ),
            ).filter(
              (el) =>
                el.getClientRects().length &&
                getComputedStyle(el).visibility !== "hidden" &&
                !el.closest("[inert]"),
            ),
          );
        if (items.length) {
          e.preventDefault();
          const index = items.indexOf(document.activeElement as HTMLElement);
          items[
            (index + (e.shiftKey ? -1 : 1) + items.length) % items.length
          ]?.focus();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const panel = ref.current?.querySelector<HTMLElement>(".reference-panel");
    panel?.scrollTo(0, 0);
    // Arrowing along the tabs keeps focus on the tab strip; any other change
    // of page lands focus on the new page.
    if (!document.activeElement?.closest(".reference-tabs"))
      panel?.focus({ preventScroll: true });
  }, [tab]);
  const choice = (label: string, checked: boolean, change: () => void) => (
    <label className="printed-choice" key={label}>
      <input type="checkbox" checked={checked} onChange={change} />
      <span>{label}</span>
    </label>
  );
  const select = <T extends string>(
    label: string,
    value: T,
    options: Record<T, string>,
    change: (value: T) => void,
  ) => (
    <label className="reference-select">
      {label}
      <select value={value} onChange={(e) => change(e.target.value as T)}>
        {Object.entries(options).map(([key, name]) => (
          <option key={key} value={key}>
            {String(name)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <aside
        ref={ref}
        className="reference-card settings-inspector"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        inert={closing || undefined}
      >
        <div className="reference-running">
          {tab === "Settings" ? (
            <span>Settings</span>
          ) : (
            <button
              className="settings-back"
              onClick={() => setTab("Settings")}
              aria-label="Back to settings"
            >
              ← Settings
            </button>
          )}
          <button onClick={onClose} aria-label="Close settings">
            Done
          </button>
        </div>
        {customizing && (
          <div
            className="reference-tabs"
            role="tablist"
            aria-label="Customize desk"
          >
            {tabs.map((name, index) => (
              <button
                key={name}
                id={`ref-${name}`}
                role="tab"
                aria-selected={tab === name}
                aria-controls="reference-panel"
                tabIndex={tab === name ? 0 : -1}
                onClick={() => {
                  setTab(name);
                  machineAudio.pick();
                }}
                onKeyDown={(e) => {
                  if (
                    !["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? tabs.length - 1
                        : (index +
                            (e.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                          tabs.length;
                  setTab(tabs[next]);
                  document.getElementById(`ref-${tabs[next]}`)?.focus();
                  machineAudio.pick();
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div
          key={tab}
          id="reference-panel"
          role={customizing ? "tabpanel" : undefined}
          aria-labelledby={customizing ? `ref-${tab}` : undefined}
          tabIndex={-1}
          className="reference-panel"
        >
          {tab === "Settings" && (
            <nav className="settings-menu" aria-label="Settings sections">
              <button onClick={() => setTab("Machine")}>
                <span>
                  Customize desk
                  <small>Machine, paper, lighting & surface</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
              <button onClick={() => setTab("Sound")}>
                <span>Sound</span>
                <span aria-hidden="true">→</span>
              </button>
              <button onClick={() => setTab("You")}>
                <span>Author</span>
                <span aria-hidden="true">→</span>
              </button>
              <button onClick={() => setTab("Storage")}>
                <span>
                  Storage
                  <small>
                    {cloudStorage.mode === "cloud" ? "Cloud" : "Local"}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
              <a className="settings-start-over" href="/start-over">
                <span>
                  Start from scratch
                  <small>
                    {cloudStorage.signedIn
                      ? "Delete account and all data"
                      : "Permanently erase local data"}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </a>
              <AccountSummary />
              <div className="studio-credit">
                <span>Made by</span>
                <Image
                  src="/brand/ooof-labs/ooof-labs-petrol.svg"
                  alt="ooof labs"
                  width={573}
                  height={173}
                />
              </div>
            </nav>
          )}
          {customizing && (
            <p className="settings-live-note">
              Changes appear on your desk as you choose.
            </p>
          )}
          {tab === "Layout" && (
            <LayoutChoices settings={settings} update={update} />
          )}
          {tab === "Machine" && (
            <>
              <Group label="Typewriter model" className="ref-models">
                {typewriterList.map((m) => (
                  <Tile
                    key={m.id}
                    label={`${m.code} ${m.name}`}
                    on={activeModel.id === m.id}
                    onPick={() =>
                      update({
                        model: m.id,
                        variations: { ...m.defaultVariations },
                      })
                    }
                    className="pick-model"
                  >
                    <span className={`machine-tile-swatch model-${m.id}`}>
                      <span className="swatch-deck" />
                      <span className="swatch-face" />
                      <span className="swatch-badge">{m.code}</span>
                    </span>
                  </Tile>
                ))}
              </Group>
              <div className="machine-variations">
                <div className="ref-split ref-split-3">
                  <Group label="Finish">
                    {activeModel.variations.finish.map((v) => (
                      <Tile
                        key={v.id}
                        label={v.name}
                        on={currentFinish === v.id}
                        onPick={() =>
                          update({
                            variations: {
                              ...(settings.variations ||
                                activeModel.defaultVariations),
                              finish: v.id,
                            },
                          })
                        }
                        className="pick-variation"
                      >
                        <span
                          className={`variation-dot finish-dot model-${activeModel.id}-${v.id}`}
                        />
                      </Tile>
                    ))}
                  </Group>
                </div>
              </div>
            </>
          )}
          {tab === "Paper" && (
            <>
              <Group label="Paper" className="ref-stocks">
                {stockKeys.map((k) => (
                  <Tile
                    key={k}
                    label={stocks[k].short}
                    on={paper.stock === k}
                    onPick={() => updatePaper({ stock: k })}
                  >
                    <span className="stock-backing">
                      <b
                        className={`stock-sheet stock-${k}`}
                        style={paperStyle(k)}
                      >
                        <u />
                        <u />
                        <u />
                      </b>
                    </span>
                  </Tile>
                ))}
              </Group>
              {onNotesStock && (
                <Group label="Notes in the copy holder" className="ref-stocks">
                  {stockKeys.map((k) => (
                    <Tile
                      key={k}
                      label={stocks[k].short}
                      on={notesStock === k}
                      onPick={() => onNotesStock(k)}
                    >
                      <span className="stock-backing">
                        <b
                          className={`stock-sheet stock-${k}`}
                          style={paperStyle(k)}
                        >
                          <u />
                          <u />
                          <u />
                        </b>
                      </span>
                    </Tile>
                  ))}
                </Group>
              )}
              <Group label="Ruling" className="ref-rulings">
                {(Object.keys(paperRulings) as PaperRuling[]).map((ruling) => (
                  <Tile
                    key={ruling}
                    label={paperRulings[ruling]}
                    on={paperRuling(paper) === ruling}
                    onPick={() => updatePaper({ ruling })}
                  >
                    <span
                      className={`ruling-swatch ruling-${ruling}`}
                      aria-hidden="true"
                    />
                  </Tile>
                ))}
              </Group>
              <div className="ref-split">
                <Group label="Type">
                  {elementKeys.map((k) => (
                    <Tile
                      key={k}
                      label={elements[k]}
                      on={paper.element === k}
                      onPick={() => updatePaper({ element: k })}
                      className="pick-type"
                    >
                      <span className={`specimen spec-${k}`}>Aa</span>
                    </Tile>
                  ))}
                </Group>
                <Group label="Ribbon">
                  {ribbonKeys.map((k) => (
                    <Tile
                      key={k}
                      label={
                        {
                          black: "Black",
                          blue: "Blue-black",
                          sepia: "Sepia",
                          bichrome: "Black / red",
                        }[k]
                      }
                      on={paper.ribbon === k}
                      onPick={() => updatePaper({ ribbon: k })}
                      className="pick-ribbon"
                    >
                      <span
                        className={`ribbon-dot ribbon-${k}`}
                        style={
                          { "--ribbon-color": ribbons[k] } as CSSProperties
                        }
                      />
                    </Tile>
                  ))}
                </Group>
                <Group label="Initial">
                  <Tile
                    label="Stamped initial"
                    on={paper.initials}
                    onPick={() => updatePaper({ initials: !paper.initials })}
                    className="pick-type"
                  >
                    <span className="initial-sample">
                      <i>T</i>
                      <u />
                      <u />
                      <u />
                    </span>
                  </Tile>
                </Group>
              </div>
              <p className="ref-note">
                Applies to this sheet and the next. Filed papers keep their own.
              </p>
            </>
          )}
          {tab === "Light" && (
            <>
              <Group label="Adjust a lamp">
                {(
                  [
                    ["overhead", "Top lamp"],
                    ["rail", "Rail light"],
                  ] as const
                ).map(([source, label]) => (
                  <Tile
                    key={source}
                    label={label}
                    on={lampControl === source}
                    onPick={() => setLampControl(source)}
                    className="pick-chip"
                  >
                    <span
                      className={`lamp-source-sample source-${source}`}
                      aria-hidden="true"
                    >
                      <i />
                    </span>
                  </Tile>
                ))}
              </Group>
              <LampSettings
                source={lampControl}
                settings={settings}
                update={update}
              />

              <p className="ref-note">
                Pull the cord for the top lamp. Slide the machine's LIGHT fader
                right to brighten the rail light. Both lamps can be on together.
              </p>
            </>
          )}
          {tab === "Desk" && (
            <>
              <Group label="Surface" className="ref-desks">
                {deskKeys.map((k) => (
                  <Tile
                    key={k}
                    label={desks[k].short}
                    on={(settings.desk || "cherry") === k}
                    onPick={() => update({ desk: k })}
                  >
                    <span className={`surface-swatch surface-${k}`}>
                      <b
                        className={`scene-paper stock-${paper.stock}`}
                        style={paperStyle(paper.stock)}
                      />
                    </span>
                  </Tile>
                ))}
              </Group>
              <Group label="Clock">
                <Tile
                  label="None"
                  on={settings.clock === false}
                  onPick={() => update({ clock: false, clockChosen: true })}
                  className="pick-chip"
                >
                  <span className="chip-glyph">×</span>
                </Tile>
                {clockStyleList.map((cs) => (
                  <Tile
                    key={cs.id}
                    label={cs.short}
                    on={
                      settings.clock !== false &&
                      (settings.clockStyle || "studio") === cs.id
                    }
                    onPick={() =>
                      update({
                        clock: true,
                        clockChosen: true,
                        clockStyle: cs.id,
                      })
                    }
                    className="pick-clock-style"
                  >
                    <span className={`clock-swatch clock-swatch-${cs.id}`}>
                      <i className="swatch-hand-h" />
                      <i className="swatch-hand-m" />
                    </span>
                  </Tile>
                ))}
              </Group>
              <Group label="Care">
                <Tile
                  label="Reduce movement"
                  on={settings.reduceMotion}
                  onPick={() =>
                    update({ reduceMotion: !settings.reduceMotion })
                  }
                  className="pick-chip"
                >
                  <span className="chip-glyph">∿</span>
                </Tile>
                <Tile
                  label="Larger type"
                  on={typeSize(settings) >= 3}
                  onPick={() =>
                    update(typeSizePatch(typeSize(settings) >= 3 ? 2 : 3))
                  }
                  className="pick-chip"
                >
                  <span className="chip-glyph">
                    A<small>A</small>
                  </span>
                </Tile>
              </Group>
            </>
          )}
          {tab === "Sound" && (
            <>
              <h2>Sound</h2>
              <label className="manual-slider">
                Volume
                <input
                  aria-label="Master volume"
                  type="range"
                  min="0"
                  max="1"
                  step=".01"
                  value={settings.muted ? 0 : settings.volume}
                  onChange={(e) =>
                    update({ volume: +e.target.value, muted: false })
                  }
                />
              </label>
              {choice("Ring the margin bell", settings.bell, () =>
                update({ bell: !settings.bell }),
              )}
              {select(
                "Room",
                settings.room,
                { study: "Study", library: "Library", attic: "Attic" },
                (room) => update({ room }),
              )}
              {choice(
                "A ticking clock",
                !!settings.ticking && !settings.muted,
                () =>
                  update({
                    ticking: !(settings.ticking && !settings.muted),
                    muted: false,
                  }),
              )}
              {choice("Mute all sounds", !!settings.muted, () =>
                update({ muted: !settings.muted }),
              )}
              <p className="small-print">
                The paper and desk change the sound of a strike. The clock stays
                quiet unless invited.
              </p>
            </>
          )}
          {tab === "Storage" && <StorageSettings sync={cloudStorage} />}
          {tab === "You" && (
            <>
              <h2>Author</h2>
              <label className="owner-name-label">
                Your name
                <input
                  aria-label="Owner name"
                  maxLength={48}
                  value={owner.name}
                  onChange={(e) => updateOwner(e.target.value)}
                  placeholder="A WRITER"
                />
              </label>
              <p className="small-print">
                Used on new papers. Existing attribution stays as it was.
              </p>
              <details className="settings-details">
                <summary>Guided setup</summary>
                <button
                  type="button"
                  className="printed-button"
                  onClick={() => {
                    onClose();
                    onStartOnboarding?.();
                  }}
                >
                  Open optional setup tour
                </button>
              </details>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

type LampOptions = {
  intensity: number;
  spread: number;
  reach: number;
  tone: "tungsten" | "amber" | "halogen";
  color?: string;
};
export function LampSettings({
  source,
  settings,
  update,
  colorsOnly = false,
}: {
  source: "overhead" | "rail";
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  colorsOnly?: boolean;
}) {
  const name = source === "overhead" ? "Top lamp" : "Rail light";
  const values: LampOptions =
    source === "overhead"
      ? {
          intensity: settings.deskLightIntensity ?? 0,
          spread: settings.deskLightSpread ?? 0.5,
          reach: settings.deskLightReach ?? 0.5,
          tone: settings.deskLightTone ?? "tungsten",
          color: settings.deskLightColor,
        }
      : {
          intensity: settings.railLightIntensity ?? 0,
          spread: settings.railLightSpread ?? 0.65,
          reach: settings.railLightReach ?? 0.55,
          tone: settings.railLightTone ?? "tungsten",
          color: settings.railLightColor,
        };
  const fields =
    source === "overhead"
      ? {
          intensity: "deskLightIntensity",
          spread: "deskLightSpread",
          reach: "deskLightReach",
          tone: "deskLightTone",
          color: "deskLightColor",
        }
      : {
          intensity: "railLightIntensity",
          spread: "railLightSpread",
          reach: "railLightReach",
          tone: "railLightTone",
          color: "railLightColor",
        };
  const change = (patch: Partial<LampOptions>) =>
    update(
      Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [
          fields[key as keyof LampOptions],
          value,
        ]),
      ),
    );
  const hex =
    "#" +
    lightColor(values.tone, values.color)
      .split(" ")
      .map((channel) => Number(channel).toString(16).padStart(2, "0"))
      .join("");
  return (
    <>
      <Group label={`${name} colour`}>
        {(
          [
            ["tungsten", "Warm white"],
            ["amber", "Amber"],
            ["halogen", "Cool white"],
          ] as const
        ).map(([tone, label]) => (
          <Tile
            key={tone}
            label={label}
            on={values.tone === tone && !values.color}
            onPick={() => change({ tone, color: undefined })}
            className="pick-chip"
          >
            <span
              className={`lamp-tone-sample tone-${tone}`}
              aria-hidden="true"
            />
          </Tile>
        ))}
      </Group>
      <label className="lamp-colour-picker">
        Custom colour
        <input
          type="color"
          aria-label={`${name} colour`}
          value={hex}
          onChange={(event) => change({ color: event.target.value })}
        />
      </label>
      {!colorsOnly &&
        (
          [
            ["intensity", "Brightness"],
            ["spread", "Spread"],
            ["reach", "Reach"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="manual-slider">
            {name} {label.toLowerCase()} ({Math.round(values[field] * 100)}%)
            <input
              aria-label={`${name} ${label.toLowerCase()}`}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={values[field]}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (field === "intensity")
                  machineAudio.dimmerTick(
                    value,
                    value === 0 || values.intensity === 0,
                  );
                change({ [field]: value });
              }}
            />
          </label>
        ))}
    </>
  );
}
