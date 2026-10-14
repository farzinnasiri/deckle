import { defaultPaper, type PaperOptions, type Settings } from "./writing";
import { getTypewriterModel } from "./typewriters";

export const stocks = {
  bond: {
    name: "Bond, cream",
    short: "Bond",
    tint: "#f0e9d6",
    absorption: 0.94,
    roughness: 1,
    gain: 1,
    tone: 6500,
    tear: 0.9,
  },
  white: {
    name: "Bright white laid",
    short: "Laid",
    tint: "#f5f4eb",
    absorption: 1,
    roughness: 0.8,
    gain: 0.96,
    tone: 7800,
    tear: 0.95,
  },
  onionskin: {
    name: "Onionskin",
    short: "Onionskin",
    tint: "#f2eddbdd",
    absorption: 1,
    roughness: 0.7,
    gain: 0.8,
    tone: 7300,
    tear: 0.94,
  },
  kraft: {
    name: "Manila / kraft",
    short: "Manila",
    tint: "#d1b184",
    absorption: 0.86,
    roughness: 1.5,
    gain: 0.9,
    tone: 4200,
    tear: 0.8,
  },
  ledger: {
    name: "Ledger, ruled",
    short: "Ledger",
    tint: "#dde3cf",
    absorption: 0.94,
    roughness: 1,
    gain: 1,
    tone: 6200,
    tear: 0.9,
  },
  recycled: {
    name: "Grey recycled",
    short: "Recycled",
    tint: "#d1d0c6",
    absorption: 0.87,
    roughness: 1.4,
    gain: 0.86,
    tone: 4300,
    tear: 0.81,
  },
} as const;
export const desks = {
  cherry: {
    name: "Satin cherry",
    short: "Cherry",
    gain: 0.96,
    room: 0.12,
    thump: 0.94,
  },
  maple: {
    name: "Honey maple",
    short: "Maple",
    gain: 1.01,
    room: 0.14,
    thump: 0.9,
  },
  rosewood: {
    name: "Dark rosewood",
    short: "Rosewood",
    gain: 0.93,
    room: 0.1,
    thump: 1.06,
  },
  walnut: { name: "Walnut", short: "Walnut", gain: 1, room: 0.12, thump: 1 },
  oak: { name: "Pale oak", short: "Oak", gain: 1, room: 0.13, thump: 0.9 },
  leather: {
    name: "Green leather on walnut",
    short: "Leather",
    gain: 0.83,
    room: 0.06,
    thump: 0.65,
  },
  linen: {
    name: "Linen / bookcloth",
    short: "Linen",
    gain: 0.8,
    room: 0.05,
    thump: 0.7,
  },
  slate: {
    name: "Dark slate",
    short: "Slate",
    gain: 1.04,
    room: 0.16,
    thump: 1.12,
  },
} as const;
export const lights = {
  day: {
    name: "North window",
    short: "Window",
    pool: "radial-gradient(ellipse 85% 85% at 42% 38%, #fff 35%, #e6e8e2 68%, #b5bdbd 100%)",
    window: 1,
    shadowX: 14,
    shadowY: 16,
  },
  lamp: {
    name: "Tungsten lamp",
    short: "Lamp",
    // The bulb hangs above the desk, just out of frame over the cord: light
    // is strongest at the top edge and falls away down and across the desk.
    pool: "radial-gradient(ellipse 95% 125% at 64% -14%, #fffaf0 0%, #fdf2dc 36%, #f4dfb7 54%, #d6ae78 69%, #926a40 81%, #4c331d 92%, #27190e 100%)",
    window: 0,
    shadowX: -13,
    shadowY: 18,
  },
  mixed: {
    name: "Window and lamp",
    short: "Both",
    pool: "radial-gradient(ellipse 100% 130% at 64% -14%, #fff6e2 10%, #f0dfb9 40%, #cbc1a6 62%, #96a1a0 80%, #66726f 100%)",
    window: 0.6,
    shadowX: -9,
    shadowY: 15,
  },
  office: {
    name: "Fluorescent office",
    short: "Office",
    pool: "radial-gradient(ellipse 100% 100% at 50% 40%, #f0f7e9 40%, #ccd5c4)",
    window: 0.12,
    shadowX: 2,
    shadowY: 5,
  },
} as const;
export const lampColors = {
  tungsten: "255 229 185",
  amber: "255 195 119",
  halogen: "235 244 255",
} as const;

/** CSS colour channels from a saved colour, falling back to the stock bulb. */
export function lightColor(
  tone: keyof typeof lampColors = "tungsten",
  color?: string,
) {
  if (color && /^#[0-9a-f]{6}$/i.test(color))
    return [1, 3, 5]
      .map((at) => parseInt(color.slice(at, at + 2), 16))
      .join(" ");
  return lampColors[tone] ?? lampColors.tungsten;
}

export const ribbons = {
  black: "#1b1913",
  blue: "#1a2c40",
  sepia: "#573c27",
  bichrome: "#1b1913",
} as const;
export const elements = {
  mono: "Courier Prime",
  italic: "Courier Prime Italic",
  book: "Libre Baskerville",
} as const;
export const presets: {
  name: string;
  short: string;
  stock: PaperOptions["stock"];
  desk: NonNullable<Settings["desk"]>;
  light: Settings["light"];
}[] = [
  {
    name: "The study",
    short: "Study",
    stock: "bond",
    desk: "walnut",
    light: "lamp",
  },
  {
    name: "The office, 1971",
    short: "Office",
    stock: "ledger",
    desk: "slate",
    light: "office",
  },
  {
    name: "Kitchen table, Sunday",
    short: "Sunday",
    stock: "white",
    desk: "oak",
    light: "day",
  },
  {
    name: "Correspondence",
    short: "Letters",
    stock: "onionskin",
    desk: "leather",
    light: "mixed",
  },
];
export function currentLight(
  light: Settings["light"] = "auto",
  hour = new Date().getHours(),
) {
  return light === "auto"
    ? hour < 7 || hour >= 19
      ? "lamp"
      : hour >= 16
        ? "mixed"
        : "day"
    : light;
}
export function materialProfile(
  settings: Settings,
  paper = settings.paper || defaultPaper,
) {
  const stock = stocks[paper.stock],
    desk = desks[settings.desk || "cherry"];
  const model = getTypewriterModel(settings.model || "d01");
  return {
    desk: settings.desk || "cherry",
    gain:
      stock.gain *
      desk.gain *
      (paper.element === "book" ? 0.9 : 1) *
      model.sound.gain,
    tone: Math.round(stock.tone * model.sound.tone),
    tear: stock.tear,
    room:
      desk.room *
      (settings.room === "library"
        ? 1.3
        : settings.room === "attic"
          ? 1.15
          : 1),
    thump: desk.thump * model.sound.thump,
  };
}
export function paperVariables(paper: PaperOptions = defaultPaper) {
  const stock = stocks[paper.stock];
  return {
    "--paper": stock.tint,
    "--paper-texture": 'url("/textures/paper-cotton.png")',
    "--ribbon": ribbons[paper.ribbon],
    "--absorption": stock.absorption,
    "--paper-font":
      paper.element === "book"
        ? '"Libre Baskerville", Georgia, serif'
        : '"Courier Prime", Courier, monospace',
    fontStyle: paper.element === "italic" ? "italic" : "normal",
  };
}
