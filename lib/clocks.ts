export type ClockStyleId =
  "studio" | "flip" | "bauhaus" | "deco" | "chronometer" | "digital";

export type ClockStyleInfo = {
  id: ClockStyleId;
  name: string;
  short: string;
  era: string;
  year: number;
  origin: string;
  description: string;
  caseMaterial: string;
  faceType: "analog" | "flip" | "digital";
};

export const clockStyles: Record<ClockStyleId, ClockStyleInfo> = {
  studio: {
    id: "studio",
    name: "Studio Desk Alarm",
    short: "Studio",
    era: "German Functionalist",
    year: 1971,
    origin: "Frankfurt",
    description:
      "Matte slate casing with clean quadrant numerals and quiet sweep movement.",
    caseMaterial: "Matte phenolic composite",
    faceType: "analog",
  },
  flip: {
    id: "flip",
    name: "Cifra Split-Flap",
    short: "Split-Flap",
    era: "Italian Modernist",
    year: 1969,
    origin: "Udine",
    description:
      "Mechanical split-flap roller cards that cycle over every minute with an authentic mechanical snap.",
    caseMaterial: "Molded orange acrylic",
    faceType: "flip",
  },
  bauhaus: {
    id: "bauhaus",
    name: "Junghans Radial Disc",
    short: "Bauhaus",
    era: "Bauhaus Minimalist",
    year: 1957,
    origin: "Schramberg",
    description:
      "Pure circular brushed aluminum disc with hairline radial baton indices and needle hands.",
    caseMaterial: "Spun satin aluminum",
    faceType: "analog",
  },
  deco: {
    id: "deco",
    name: "Telechron Streamline",
    short: "Art Deco",
    era: "Streamline Moderne",
    year: 1939,
    origin: "Ashland",
    description:
      "Stepped architectural brass body, aged parchment dial, and gold filigree cathedral hands.",
    caseMaterial: "Stepped polished brass",
    faceType: "analog",
  },
  chronometer: {
    id: "chronometer",
    name: "Deck Chronometer",
    short: "Marine",
    era: "Swiss Maritime",
    year: 1954,
    origin: "La Chaux-de-Fonds",
    description:
      "Heavy marine gimbal brass casing with railroad minute track and 60-second subdial.",
    caseMaterial: "Heavy turned naval brass",
    faceType: "analog",
  },
  digital: {
    id: "digital",
    name: "Lumitron Solid-State",
    short: "Digital VFD",
    era: "Early Cybernetic",
    year: 1974,
    origin: "Tokyo",
    description:
      "Smoked dark acrylic block with warm segmented vacuum-fluorescent display.",
    caseMaterial: "Smoked acrylic & brushed steel",
    faceType: "digital",
  },
};

export const clockStyleList = Object.values(clockStyles);

export function getClockStyle(id?: string): ClockStyleInfo {
  if (id && id in clockStyles) {
    return clockStyles[id as ClockStyleId];
  }
  return clockStyles.studio;
}
