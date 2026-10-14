export type TypewriterId = "d01" | "v19" | "h03" | "k44" | "b18" | "s77";

export type MachineVariation = {
  id: string;
  name: string;
  description: string;
};

export type TypewriterModel = {
  id: TypewriterId;
  name: string;
  code: string;
  brand: string;
  tagline: string;
  year: string;
  era: string;
  origin: string;
  summary: string;
  badge: string;
  tearLabel: string;
  sound: {
    gain: number;
    tone: number;
    thump: number;
  };
  variations: {
    finish: MachineVariation[];
    knob: MachineVariation[];
    accent: MachineVariation[];
  };
  defaultVariations: {
    finish: string;
    knob: string;
    accent: string;
  };
};

export const typewriterModels: Record<TypewriterId, TypewriterModel> = {
  d01: {
    id: "d01",
    name: "Continuous",
    code: "D—01",
    brand: "deckle",
    tagline: "D—01 · CONTINUOUS",
    year: "1964",
    era: "German Functionalist",
    origin: "Frankfurt",
    summary:
      "Precision satin aluminum foundation with vermilion accents and balanced mechanical escapement.",
    badge: "D—01 · CONTINUOUS",
    tearLabel: "TEAR",
    sound: { gain: 1.0, tone: 1.0, thump: 1.0 },
    variations: {
      finish: [
        {
          id: "standard",
          name: "Satin Aluminum",
          description: "Warm brushed silver anodized finish",
        },
        {
          id: "champagne",
          name: "Champagne Luster",
          description: "Subtle warm gold titanium sheen",
        },
        {
          id: "pewter",
          name: "Cold Pewter",
          description: "Darker cold-rolled slate aluminum",
        },
      ],
      knob: [
        {
          id: "knurled",
          name: "Milled Knurl",
          description: "Classic 60-tooth radial knurling",
        },
        {
          id: "fluted",
          name: "Fluted Bevel",
          description: "Stepped cylindrical grip ridges",
        },
        {
          id: "grooved",
          name: "Ribbed Core",
          description: "Traction grooves with matte centre",
        },
      ],
      accent: [
        {
          id: "vermilion",
          name: "Signal Vermilion",
          description: "Iconic bright orange-red indicator",
        },
        {
          id: "amber",
          name: "Laboratory Amber",
          description: "Warm 1960s instrument amber",
        },
        {
          id: "monochrome",
          name: "Charcoal Mono",
          description: "Restrained architectural grey",
        },
      ],
    },
    defaultVariations: {
      finish: "standard",
      knob: "knurled",
      accent: "vermilion",
    },
  },

  v19: {
    id: "v19",
    name: "Rossa",
    code: "V—19",
    brand: "deckle",
    tagline: "V—19 · ROSSA",
    year: "1969",
    era: "Italian Pop-Industrial",
    origin: "Ivrea",
    summary:
      "High-gloss poppy red lacquer inspired by Sottsass, contrasting jet control cavity, and snappy keys.",
    badge: "V—19 · ROSSA",
    tearLabel: "TAGLIO",
    sound: { gain: 1.06, tone: 1.15, thump: 0.88 },
    variations: {
      finish: [
        {
          id: "standard",
          name: "Rosso Corsa",
          description: "Lustrous high-gloss poppy red lacquer",
        },
        {
          id: "giallo",
          name: "Modena Yellow",
          description: "Vibrant Italian pop-industrial yellow",
        },
        {
          id: "nero",
          name: "Jet Obsidian",
          description: "Piano black lacquer with scarlet details",
        },
      ],
      knob: [
        {
          id: "bullseye",
          name: "Two-Tone Bullseye",
          description: "Jet black platen with bright orange core",
        },
        {
          id: "scallop",
          name: "Scalloped Racer",
          description: "Fluted racing profile with white index notch",
        },
        {
          id: "monolith",
          name: "Monolith Grip",
          description: "Solid gloss disc with micro-milled rim",
        },
      ],
      accent: [
        {
          id: "tangerine",
          name: "Signal Orange",
          description: "Vivid neon orange guide and cut rule",
        },
        {
          id: "bianco",
          name: "Crisp Bianco",
          description: "Pure white high-contrast mechanical key",
        },
        {
          id: "yellow",
          name: "Sunbeam Yellow",
          description: "Racing yellow accent line and indicator",
        },
      ],
    },
    defaultVariations: {
      finish: "standard",
      knob: "bullseye",
      accent: "tangerine",
    },
  },

  h03: {
    id: "h03",
    name: "Voyageur",
    code: "H—03",
    brand: "deckle",
    tagline: "H—03 · VOYAGEUR",
    year: "1958",
    era: "Swiss Alpine Precision",
    origin: "Yverdon",
    summary:
      "Seafoam sage crinkle enamel, polished nickel fittings, and fine clockwork escapement.",
    badge: "H—03 · VOYAGEUR",
    tearLabel: "COUPE",
    sound: { gain: 0.95, tone: 1.08, thump: 0.92 },
    variations: {
      finish: [
        {
          id: "standard",
          name: "Alpine Sage",
          description: "Smooth seafoam green crinkle enamel",
        },
        {
          id: "glacier",
          name: "Glacier Frost",
          description: "Pale silver-celadon blue enamel",
        },
        {
          id: "olive",
          name: "Officer Olive",
          description: "Matte Swiss military drab finish",
        },
      ],
      knob: [
        {
          id: "starburst",
          name: "Chrome Starburst",
          description: "Sage molded knob with spun chrome cap",
        },
        {
          id: "milgrain",
          name: "Fine Milgrain",
          description: "Delicate Swiss milled aluminum ring",
        },
        {
          id: "enamel",
          name: "Forest Enamel",
          description: "Deep hunter green inlaid center disc",
        },
      ],
      accent: [
        {
          id: "chrome",
          name: "Mirror Chrome",
          description: "Polished nickel-chrome needle and trim",
        },
        {
          id: "forest",
          name: "Pine Green",
          description: "Subdued alpine forest green rule",
        },
        {
          id: "redcross",
          name: "Swiss Red",
          description: "Vivid cross-red mechanical mark",
        },
      ],
    },
    defaultVariations: {
      finish: "standard",
      knob: "starburst",
      accent: "chrome",
    },
  },

  k44: {
    id: "k44",
    name: "Torpedo",
    code: "K—44",
    brand: "deckle",
    tagline: "K—44 · TORPEDO",
    year: "1938",
    era: "Pre-war Gloss Enamel",
    origin: "Rödelheim",
    summary:
      "Deep black lacquer with a gold decal pinstripe, nickel-chrome rail and glass-top keys.",
    badge: "K—44 · TORPEDO",
    tearLabel: "SCHNITT",
    sound: { gain: 1.14, tone: 0.82, thump: 1.35 },
    variations: {
      finish: [
        {
          id: "standard",
          name: "Black Lacquer",
          description: "Piano-deep black enamel with gold pinstripe",
        },
        {
          id: "oxblood",
          name: "Oxblood",
          description: "Dark burgundy lacquer, gold decal",
        },
        {
          id: "bottle",
          name: "Bottle Green",
          description: "Deep green lacquer, gold decal",
        },
      ],
      knob: [
        {
          id: "chrome",
          name: "Nickel Cap",
          description: "Black knurl with a spun nickel hub",
        },
        {
          id: "ebony",
          name: "Ebony & Gilt",
          description: "Black hub with a gold centre pip",
        },
        {
          id: "gilt",
          name: "Gilt Cap",
          description: "Spun brass hub",
        },
      ],
      accent: [
        {
          id: "gilt",
          name: "Gold Leaf",
          description: "Gold decal lettering and pinstripe",
        },
        {
          id: "silver",
          name: "Silver Leaf",
          description: "Silver decal lettering and pinstripe",
        },
        {
          id: "cream",
          name: "Cream",
          description: "Cream decal lettering and pinstripe",
        },
      ],
    },
    defaultVariations: {
      finish: "standard",
      knob: "chrome",
      accent: "gilt",
    },
  },

  b18: {
    id: "b18",
    name: "Coronet",
    code: "B—18",
    brand: "deckle",
    tagline: "B—18 · CORONET",
    year: "1953",
    era: "American Streamline",
    origin: "Hartford",
    summary:
      "Two-tone pastel body under an ivory hood, chrome speed lines and soft domed keys.",
    badge: "B—18 · CORONET",
    tearLabel: "TEAR",
    sound: { gain: 0.92, tone: 0.94, thump: 0.85 },
    variations: {
      finish: [
        {
          id: "standard",
          name: "Sea Mist",
          description: "Pale aqua body, ivory hood",
        },
        {
          id: "rose",
          name: "Desert Rose",
          description: "Dusty pink body, ivory hood",
        },
        {
          id: "sky",
          name: "Powder Sky",
          description: "Soft blue body, ivory hood",
        },
      ],
      knob: [
        {
          id: "chrome",
          name: "Chrome Hub",
          description: "Ivory knurl with a chrome centre",
        },
        {
          id: "ivory",
          name: "Ivory Hub",
          description: "All-ivory feed knob",
        },
        {
          id: "jewel",
          name: "Coronet Jewel",
          description: "Chrome hub with a coloured jewel",
        },
      ],
      accent: [
        {
          id: "coronet",
          name: "Coronet Red",
          description: "Red guide, pip and archive mark",
        },
        {
          id: "chrome",
          name: "Chrome",
          description: "Quiet chrome-grey markings",
        },
        {
          id: "gold",
          name: "Gold",
          description: "Warm gold markings",
        },
      ],
    },
    defaultVariations: {
      finish: "standard",
      knob: "chrome",
      accent: "coronet",
    },
  },

  s77: {
    id: "s77",
    name: "Studio",
    code: "S—77",
    brand: "deckle",
    tagline: "S—77 · STUDIO",
    year: "1974",
    era: "Danish Hi-Fi Modern",
    origin: "Struer",
    summary:
      "Brushed aluminium chassis around an oiled veneer panel, black anodised keys and one orange signal.",
    badge: "S—77 · STUDIO",
    tearLabel: "TEAR",
    sound: { gain: 1.02, tone: 1.04, thump: 1.08 },
    variations: {
      finish: [
        {
          id: "standard",
          name: "Teak & Aluminium",
          description: "Oiled teak in a brushed silver frame",
        },
        {
          id: "rosewood",
          name: "Rosewood & Black",
          description: "Rosewood in black anodised aluminium",
        },
        {
          id: "oak",
          name: "Oak & Silver",
          description: "Pale oak with silver keys",
        },
      ],
      knob: [
        {
          id: "aluminium",
          name: "Turned Aluminium",
          description: "Spun face with a fine knurl",
        },
        {
          id: "black",
          name: "Black Anodised",
          description: "Dark spun face",
        },
        {
          id: "dot",
          name: "Signal Dot",
          description: "Aluminium with a coloured centre",
        },
      ],
      accent: [
        {
          id: "signal",
          name: "Signal Orange",
          description: "One orange indicator",
        },
        {
          id: "white",
          name: "Studio White",
          description: "Quiet white indicator",
        },
        {
          id: "green",
          name: "Meter Green",
          description: "Green indicator",
        },
      ],
    },
    defaultVariations: {
      finish: "standard",
      knob: "aluminium",
      accent: "signal",
    },
  },
};

export const typewriterList = Object.values(typewriterModels);

export function getTypewriterModel(id: string = "d01"): TypewriterModel {
  return typewriterModels[id as TypewriterId] || typewriterModels.d01;
}

/** A saved variation that a model no longer offers falls back to its default. */
export function modelVariation(
  model: TypewriterModel,
  kind: keyof TypewriterModel["variations"],
  id: string | undefined,
): string {
  return model.variations[kind].some((v) => v.id === id)
    ? (id as string)
    : model.defaultVariations[kind];
}
