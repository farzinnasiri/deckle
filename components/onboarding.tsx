"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { LayoutChoices } from "./layout-choices";
import { LampSettings } from "./reference-card";
import type { DeskFocus } from "./desk-focus-guide";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import {
  typewriterList,
  getTypewriterModel,
  type TypewriterId,
} from "@/lib/typewriters";
import { desks, stocks } from "@/lib/materials";
import { clockStyleList, clockStyles, type ClockStyleId } from "@/lib/clocks";
import type { PaperOptions, Settings } from "@/lib/writing";
import { machineAudio } from "@/lib/audio";
import { DAILY_CHARGE, INACTIVE_DRAIN } from "@/lib/activity";

export type SetupLesson = "notes" | "battery" | "editing" | null;

export type OnboardingConfig = {
  name: string;
  model: TypewriterId;
  variations: { finish: string; knob: string; accent: string };
  desk: NonNullable<Settings["desk"]>;
  light: Settings["light"];
  stock: PaperOptions["stock"];
  clockStyle: ClockStyleId;
  layoutPreset: Settings["layoutPreset"];
  visibleControls: Settings["visibleControls"];
};

export type OnboardingProps = {
  initialSettings: Settings;
  onFocusChange?: (focus: DeskFocus) => void;
  onTryControl?: (focus: "lamp" | "rail") => void;
  initialName?: string;
  initialModel?: TypewriterId;
  initialVariations?: { finish?: string; knob?: string; accent?: string };
  initialDesk?: NonNullable<Settings["desk"]>;
  initialLight?: Settings["light"];
  initialStock?: PaperOptions["stock"];
  initialClockStyle?: ClockStyleId;
  onComplete: (config: OnboardingConfig) => void;
  onCancel?: () => void;
  onLivePreview?: (
    patch?: Partial<Settings>,
    paperPatch?: Partial<PaperOptions>,
  ) => void;
  onLessonChange?: (lesson: SetupLesson) => void;
  notesOpen?: boolean;
  onToggleNotes?: () => void;
  batteryOpen?: boolean;
  onToggleBattery?: () => void;
  onSelectPractice?: () => void;
};

export function OnboardingSuggestion({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <aside
      className="onboarding-suggestion"
      aria-labelledby="setup-suggestion-title"
    >
      <h2 id="setup-suggestion-title">Welcome to Deckle</h2>
      <p>
        Let's get you started. Make this desk your own, or jump straight into
        writing.
      </p>
      <div className="onboarding-suggestion-actions">
        <button className="printed-button" onClick={onStart}>
          Set up my desk
        </button>
        <button className="printed-button" onClick={onSkip}>
          Start writing
        </button>
      </div>
    </aside>
  );
}

const STEPS = [
  { id: 1, key: "name", title: "Author", label: "Identity" },
  { id: 2, key: "model", title: "Machine", label: "Typewriter" },
  { id: 3, key: "variations", title: "Finish", label: "Finish" },
  { id: 4, key: "paper", title: "Paper", label: "Paper" },
  { id: 5, key: "light", title: "Light", label: "Lighting" },
  { id: 6, key: "desk", title: "Desk", label: "Desk & layout" },
  { id: 7, key: "notes", title: "Notes", label: "Notes" },
  { id: 8, key: "battery", title: "Battery", label: "Battery" },
  { id: 9, key: "editing", title: "Editing", label: "Editing" },
  { id: 10, key: "certificate", title: "Ready", label: "Ready" },
] as const;

export function Onboarding({
  initialSettings,
  onFocusChange,
  onTryControl,
  initialName = "",
  initialModel = "d01",
  initialVariations,
  initialDesk = "cherry",
  initialLight = "auto",
  initialStock = "bond",
  initialClockStyle = "studio",
  onComplete,
  onCancel,
  onLivePreview,
  onLessonChange,
  notesOpen = false,
  onToggleNotes,
  batteryOpen = false,
  onToggleBattery,
  onSelectPractice,
}: OnboardingProps) {
  const [layoutSettings, setLayoutSettings] = useState(initialSettings);
  const [lightTarget, setLightTarget] = useState<"lamp" | "rail">("lamp");
  const focusChange = useRef(onFocusChange);
  focusChange.current = onFocusChange;
  const previewSettings = useRef(initialSettings);
  previewSettings.current = initialSettings;
  const roomLightBefore = useRef<boolean | undefined>(undefined);
  const [step, setStep] = useState<number>(1);
  const stepRef = useRef(step);
  stepRef.current = step;
  const lessonChange = useRef(onLessonChange);
  lessonChange.current = onLessonChange;
  useEffect(() => {
    lessonChange.current?.(
      step === 7
        ? "notes"
        : step === 8
          ? "battery"
          : step === 9
            ? "editing"
            : null,
    );
  }, [step]);
  useEffect(() => () => lessonChange.current?.(null), []);
  useEffect(() => {
    focusChange.current?.(
      step === 2 || step === 3
        ? "machine"
        : step === 4
          ? "paper"
          : step === 5
            ? lightTarget
            : step === 6
              ? "desk"
              : null,
    );
  }, [step, lightTarget]);
  useEffect(() => {
    if (step === 5) {
      roomLightBefore.current ??= previewSettings.current.roomLight ?? false;
      onLivePreview?.({ roomLight: false });
    } else if (roomLightBefore.current !== undefined) {
      onLivePreview?.({ roomLight: roomLightBefore.current });
      roomLightBefore.current = undefined;
    }
  }, [step, onLivePreview]);
  const [name, setName] = useState<string>(initialName);
  const [modelId, setModelId] = useState<TypewriterId>(initialModel);

  const model = getTypewriterModel(modelId);
  const [variations, setVariations] = useState<{
    finish: string;
    knob: string;
    accent: string;
  }>({
    finish: initialVariations?.finish || model.defaultVariations.finish,
    knob: initialVariations?.knob || model.defaultVariations.knob,
    accent: initialVariations?.accent || model.defaultVariations.accent,
  });

  const [desk, setDesk] = useState<NonNullable<Settings["desk"]>>(initialDesk);
  const light: Settings["light"] = "lamp";
  const [stock, setStock] = useState<PaperOptions["stock"]>(initialStock);
  const [clockStyle, setClockStyle] = useState<ClockStyleId>(initialClockStyle);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const folioRef = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  // Focus management
  useEffect(() => {
    if (step === 1) {
      setTimeout(() => nameInputRef.current?.focus(), 80);
    }
    folioRef.current?.querySelector(".onboarding-body")?.scrollTo(0, 0);
  }, [step]);

  // Keyboard navigation
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && stepRef.current !== 9) {
        const items = Array.from(
          folioRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select, summary, [tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length);
        if (stepRef.current === 5)
          items.push(
            ...Array.from(
              document.querySelectorAll<HTMLElement>(
                ".pendant-lamp:not(:disabled), .pull-cord, .light-fader-input:not(:disabled)",
              ),
            ).filter(
              (el) =>
                el.getClientRects().length &&
                getComputedStyle(el).visibility !== "hidden",
            ),
          );
        if (stepRef.current === 7 || stepRef.current === 8)
          items.push(
            ...Array.from(
              document.querySelectorAll<HTMLElement>(
                stepRef.current === 7
                  ? ".copy-holder:not(.is-hidden) button, .copy-holder:not(.is-hidden) textarea"
                  : ".activity-meter:not([hidden]) button",
              ),
            ).filter(
              (el) => el.getClientRects().length && !el.closest("[inert]"),
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
      if (e.key === "Escape" && cancel.current) {
        e.preventDefault();
        cancel.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // Live preview updates to the desk and typewriter
  const updateModel = (nextId: TypewriterId) => {
    const nextModel = getTypewriterModel(nextId);
    setModelId(nextId);
    const nextVars = {
      finish: nextModel.defaultVariations.finish,
      knob: nextModel.defaultVariations.knob,
      accent: nextModel.defaultVariations.accent,
    };
    setVariations(nextVars);
    void machineAudio.unlock();
    machineAudio.physical("tab");
    onLivePreview?.({
      model: nextId,
      variations: nextVars,
    });
  };

  const updateVariation = (type: "finish" | "knob" | "accent", val: string) => {
    const nextVars = { ...variations, [type]: val };
    setVariations(nextVars);
    void machineAudio.unlock();
    machineAudio.physical("tab");
    onLivePreview?.({ variations: nextVars });
  };

  const updateDeskSurface = (nextDesk: NonNullable<Settings["desk"]>) => {
    setDesk(nextDesk);
    void machineAudio.unlock();
    machineAudio.physical("tab");
    onLivePreview?.({ desk: nextDesk });
  };

  const updateStockChoice = (nextStock: PaperOptions["stock"]) => {
    setStock(nextStock);
    void machineAudio.unlock();
    machineAudio.physical("tab");
    onLivePreview?.(undefined, { stock: nextStock });
  };

  const updateClockStyle = (nextStyle: ClockStyleId) => {
    setClockStyle(nextStyle);
    void machineAudio.unlock();
    machineAudio.physical("tab");
    onLivePreview?.({ clockStyle: nextStyle });
  };

  const handleNext = () => {
    void machineAudio.unlock();
    if (step < STEPS.length) {
      setStep((s) => s + 1);
      machineAudio.physical("card");
    } else {
      finishCommissioning();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      void machineAudio.unlock();
      setStep((s) => s - 1);
      machineAudio.physical("card");
    }
  };

  const finishCommissioning = () => {
    void machineAudio.unlock();
    machineAudio.physical("stamp");
    onComplete({
      name: name.trim().slice(0, 48),
      model: modelId,
      variations,
      desk,
      light,
      stock,
      clockStyle,
      layoutPreset: layoutSettings.layoutPreset,
      visibleControls: layoutSettings.visibleControls,
    });
  };

  return (
    <div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="false"
      aria-label="Desk setup"
    >
      <div ref={folioRef} className="onboarding-folio">
        {/* Folio Header */}
        <header className="onboarding-header">
          <div className="onboarding-stamp-seal">DECKLE · 1971</div>
          <div className="onboarding-title-group">
            <span className="onboarding-kicker">DESK PREFERENCES</span>
            <h1 className="onboarding-title">Customize your desk</h1>
          </div>
          {onCancel && (
            <button
              type="button"
              className="onboarding-close"
              onClick={onCancel}
              title="Cancel setup"
              aria-label="Close setup"
            >
              <X size={16} />
            </button>
          )}
        </header>

        {/* Stepper Navigation Track */}
        <nav className="onboarding-steps" aria-label="Setup progress">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`onboarding-step-tab ${step === s.id ? "active" : ""} ${step > s.id ? "completed" : ""}`}
              aria-label={`${s.id}. ${s.label}`}
              aria-current={step === s.id ? "step" : undefined}
              title={s.label}
              onClick={() => {
                void machineAudio.unlock();
                machineAudio.physical("tab");
                setStep(s.id);
              }}
            >
              <span className="step-index">
                {step > s.id ? (
                  <Check size={10} />
                ) : (
                  String(s.id).padStart(2, "0")
                )}
              </span>
              <span className="step-name">{s.title}</span>
            </button>
          ))}
        </nav>

        {/* Step Panels */}
        <div className="onboarding-body">
          {/* STEP 1: IDENTITY & AUTHOR NAME */}
          {step === 1 && (
            <section
              className="onboarding-pane pane-identity"
              aria-labelledby="step-title-1"
            >
              <div className="step-heading-row">
                <span className="step-count">01 / 10</span>
                <h2 id="step-title-1">Author name</h2>
              </div>
              <p className="onboarding-intro">
                Your name appears on new papers. You can leave it blank.
              </p>

              <div className="onboarding-name-plate">
                <span className="name-plate-label">AUTHOR</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="onboarding-name-input"
                  value={name}
                  maxLength={48}
                  placeholder="TYPE YOUR NAME"
                  aria-label="Owner's full name"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleNext();
                      return;
                    }
                    void machineAudio.unlock();
                    if (e.key === "Backspace") machineAudio.correction(20);
                    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey)
                      machineAudio.strike(e.key, 20);
                  }}
                />
                <span className="name-plate-hint">
                  Press Return or Next to continue.
                </span>
              </div>
            </section>
          )}

          {/* STEP 2: TYPEWRITER MODEL SELECTION */}
          {step === 2 && (
            <section
              className="onboarding-pane pane-model"
              aria-labelledby="step-title-2"
            >
              <div className="step-heading-row">
                <span className="step-count">02 / 10</span>
                <h2 id="step-title-2">Select Your Writing Machine</h2>
              </div>
              <p className="onboarding-intro">
                Choose the foundation of your desk. Each machine possesses its
                own acoustic weight, escapement, and physical character.
              </p>

              <div className="onboarding-model-grid">
                {typewriterList.map((m) => {
                  const isSelected = modelId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`onboarding-model-card model-card-${m.id} ${isSelected ? "selected" : ""}`}
                      onClick={() => updateModel(m.id)}
                      aria-pressed={isSelected}
                    >
                      <div className={`model-card-badge model-${m.id}`}>
                        <span className="badge-code">{m.code}</span>
                        <span className="badge-tear">{m.tearLabel}</span>
                      </div>
                      <div className="model-card-details">
                        <strong className="model-card-name">{m.name}</strong>
                        <span className="model-card-era">
                          {m.era} · {m.year}
                        </span>
                        <p className="model-card-summary">{m.summary}</p>
                      </div>
                      <span className="model-card-check">
                        {isSelected && <Check size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* STEP 3: MECHANICAL ELEMENTS & VARIATIONS */}
          {step === 3 && (
            <section
              className="onboarding-pane pane-variations"
              aria-labelledby="step-title-3"
            >
              <div className="step-heading-row">
                <span className="step-count">03 / 10</span>
                <h2 id="step-title-3">Choose a finish</h2>
              </div>
              <p className="onboarding-intro">
                Choose the finish for your{" "}
                <strong>
                  {model.code} {model.name}
                </strong>
                .
              </p>

              <div className="onboarding-variations-grid">
                {/* Finish Group */}
                <div className="variation-column">
                  <h3 className="variation-column-title">Chassis Finish</h3>
                  <div className="variation-options">
                    {model.variations.finish.map((f) => {
                      const isPicked = variations.finish === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={`variation-tile ${isPicked ? "picked" : ""}`}
                          onClick={() => updateVariation("finish", f.id)}
                          aria-pressed={isPicked}
                        >
                          <span
                            className={`finish-dot model-${model.id}-${f.id}`}
                          />
                          <div className="variation-info">
                            <strong>{f.name}</strong>
                            <small>{f.description}</small>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 4 && (
            <section
              className="onboarding-pane pane-environment"
              aria-labelledby="step-title-4"
            >
              <div className="step-heading-row">
                <span className="step-count">04 / 10</span>
                <h2 id="step-title-4">Find your paper</h2>
              </div>
              <p className="onboarding-intro">
                Choose a stock and see it on the writing area.
              </p>
              <div className="onboarding-env-groups">
                {" "}
                {/* Paper Stock */}
                <div className="env-group">
                  <h3 className="env-title">Paper Stock</h3>
                  <div className="env-row">
                    {(Object.keys(stocks) as PaperOptions["stock"][]).map(
                      (k) => (
                        <button
                          key={k}
                          type="button"
                          className={`env-tile ${stock === k ? "selected" : ""}`}
                          onClick={() => updateStockChoice(k)}
                          aria-pressed={stock === k}
                        >
                          <span
                            className="env-sheet"
                            style={
                              {
                                "--tile-paper": stocks[k].tint,
                                "--tile-texture": `url("/textures/paper-${k}.png")`,
                              } as CSSProperties
                            }
                          />
                          <span className="env-label">{stocks[k].short}</span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
          {step === 5 && (
            <section
              className="onboarding-pane pane-environment"
              aria-labelledby="step-title-5"
            >
              <div className="step-heading-row">
                <span className="step-count">05 / 10</span>
                <h2 id="step-title-5">Try the lights</h2>
              </div>
              <div
                className="guided-light-actions"
                role="group"
                aria-label="Try the desk lights"
              >
                <button
                  aria-pressed={lightTarget === "lamp"}
                  onClick={() => {
                    setLightTarget("lamp");
                    onTryControl?.("lamp");
                  }}
                >
                  Overhead lamp
                </button>
                <button
                  aria-pressed={lightTarget === "rail"}
                  onClick={() => {
                    setLightTarget("rail");
                    onTryControl?.("rail");
                  }}
                >
                  Rail light
                </button>
              </div>
              <p className="onboarding-intro">
                Click the highlighted lamp on your desk, or drag its LIGHT
                slider. These are the controls you will use while writing.
              </p>
              <div className="onboarding-light-colors">
                <LampSettings
                  source={lightTarget === "lamp" ? "overhead" : "rail"}
                  settings={initialSettings}
                  update={(patch) => onLivePreview?.(patch)}
                  colorsOnly
                />
              </div>
            </section>
          )}
          {step === 6 && (
            <section
              className="onboarding-pane pane-environment"
              aria-labelledby="step-title-6"
            >
              <div className="step-heading-row">
                <span className="step-count">06 / 10</span>
                <h2 id="step-title-6">Make room for writing</h2>
              </div>
              <LayoutChoices
                settings={layoutSettings}
                update={(patch) => {
                  setLayoutSettings((s) => ({ ...s, ...patch }));
                  onLivePreview?.(patch);
                  onFocusChange?.("machine");
                }}
              />
              <div className="onboarding-env-groups">
                {" "}
                {/* Desk Surface */}
                <div className="env-group">
                  <h3 className="env-title">Desk Surface</h3>
                  <div className="env-row">
                    {(
                      Object.keys(desks) as NonNullable<Settings["desk"]>[]
                    ).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={`env-tile ${desk === k ? "selected" : ""}`}
                        onClick={() => updateDeskSurface(k)}
                        aria-pressed={desk === k}
                      >
                        <span className={`env-surface surface-${k}`} />
                        <span className="env-label">{desks[k].short}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Desk Clock Style */}
                <div className="env-group">
                  <h3 className="env-title">Desk Clock</h3>
                  <div className="env-row env-clock-row">
                    {clockStyleList.map((cs) => (
                      <button
                        key={cs.id}
                        type="button"
                        className={`env-tile env-clock-tile ${clockStyle === cs.id ? "selected" : ""}`}
                        onClick={() => updateClockStyle(cs.id)}
                        aria-pressed={clockStyle === cs.id}
                      >
                        <span
                          className={`clock-swatch env-clock-swatch clock-swatch-${cs.id}`}
                          aria-hidden="true"
                        >
                          <i className="swatch-hand-h" />
                          <i className="swatch-hand-m" />
                        </span>
                        <span className="env-label">{cs.short}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
          {step === 7 && (
            <section className="onboarding-pane" aria-labelledby="step-title-7">
              <div className="step-heading-row">
                <h2 id="step-title-7">Keep your thoughts beside you</h2>
              </div>
              <p className="onboarding-intro">
                The NOTES tab pulls out a sheet for ideas, outlines and sources.
                Open it when you need it, then tuck it away to keep writing.
              </p>
              <p className="onboarding-intro">
                Each paper has its own notes. They stay together in the archive.
                Passages copied onto your paper arrive as clippings.
              </p>
              <button className="printed-button" onClick={onToggleNotes}>
                {notesOpen ? "Tuck the notes away" : "Pull out the notes"}
              </button>
              <p className="small-print">
                Try writing on this practice sheet. These notes are temporary.
              </p>
            </section>
          )}
          {step === 8 && (
            <section className="onboarding-pane" aria-labelledby="step-title-8">
              <div className="step-heading-row">
                <h2 id="step-title-8">A little charge for showing up</h2>
              </div>
              <p className="onboarding-intro">
                Click the battery to open today's line and character counters.
                Click it again to put them away.
              </p>
              <p className="onboarding-intro">
                Writing adds {DAILY_CHARGE}% charge once per day. Each completed
                day without writing uses {INACTIVE_DRAIN}%. The battery stays
                between 0% and 100%.
              </p>
              <p className="onboarding-intro">
                The counters start fresh each day. Spaces count too. Moving text
                does not add new characters.
              </p>
              <button className="printed-button" onClick={onToggleBattery}>
                {batteryOpen
                  ? "Close today's counters"
                  : "Open today's counters"}
              </button>
            </section>
          )}
          {step === 9 && (
            <section className="onboarding-pane" aria-labelledby="step-title-9">
              <div className="step-heading-row">
                <h2 id="step-title-9">Your words can change</h2>
              </div>
              <p className="onboarding-intro">
                Select a few words on the paper. A row of editing keys appears
                beside them. Try Bold, Italic or Underline and watch the ink
                change.
              </p>
              <button className="printed-button" onClick={onSelectPractice}>
                Highlight the practice words
              </button>
              <p className="onboarding-intro">
                Click on the paper to move the cursor. Use your usual undo
                shortcut to take an edit back.
              </p>
              <p className="small-print">
                This is a practice paper. Your saved writing returns when you
                leave this step, and practice does not charge the battery.
              </p>
            </section>
          )}
          {step === 10 && (
            <section
              className="onboarding-pane pane-certificate"
              aria-labelledby="step-title-10"
            >
              <div className="step-heading-row">
                <span className="step-count">10 / 10</span>
                <h2 id="step-title-10">Commissioning Certificate</h2>
              </div>
              <p className="onboarding-intro">
                Review your choices before saving.
              </p>

              <div className="commission-certificate">
                <div className="certificate-seal">CERTIFIED · 1971</div>
                <div className="certificate-lines">
                  <div className="cert-row">
                    <span className="cert-label">AUTHOR / OWNER</span>
                    <strong className="cert-value">
                      {name.trim() || "A WRITER"}
                    </strong>
                  </div>
                  <div className="cert-row">
                    <span className="cert-label">INSTRUMENT</span>
                    <strong className="cert-value">{model.badge}</strong>
                  </div>
                  <div className="cert-row">
                    <span className="cert-label">ORIGIN &amp; ERA</span>
                    <strong className="cert-value">
                      {model.era} · {model.year} ({model.origin})
                    </strong>
                  </div>
                  <div className="cert-row">
                    <span className="cert-label">MECHANISM</span>
                    <strong className="cert-value">
                      {
                        model.variations.finish.find(
                          (f) => f.id === variations.finish,
                        )?.name
                      }
                    </strong>
                  </div>
                  <div className="cert-row">
                    <span className="cert-label">STATIONERY &amp; DESK</span>
                    <strong className="cert-value">
                      {stocks[stock].name} on {desks[desk].name}
                    </strong>
                  </div>
                  <div className="cert-row">
                    <span className="cert-label">DESK CLOCK</span>
                    <strong className="cert-value">
                      {clockStyles[clockStyle].name} (
                      {clockStyles[clockStyle].era})
                    </strong>
                  </div>
                </div>
                <div className="certificate-footnote">
                  Save these preferences and return to your paper.
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Folio Footer Controls */}
        <footer className="onboarding-footer">
          <div className="footer-left">
            {step > 1 && (
              <button
                type="button"
                className="onboarding-nav-btn btn-back"
                onClick={handleBack}
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
          </div>
          <div className="footer-right">
            {step < STEPS.length ? (
              <button
                type="button"
                className="onboarding-nav-btn btn-primary"
                onClick={handleNext}
              >
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="onboarding-nav-btn btn-primary btn-commission"
                onClick={finishCommissioning}
              >
                <Check size={16} /> Save desk settings
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
