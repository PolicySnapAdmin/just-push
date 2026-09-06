/**
 * Rank covers — one unique button skin per Push Thru level (1–99).
 * Never sold in the store. Earned on level-up, auto-equipped, kept in collection.
 */
(function (root) {
  const NAMES = [
    "Ember Seed", "Pebble Stamp", "First Notch", "Ripple Wax", "Copper Spark",
    "Warm Ring", "Hatch Mark", "Wax Seal", "Ember Coin",
    "Iron Nail", "Wire Coil", "Rivet Face", "Grind Plate", "Cross Hatch",
    "Bolt Head", "Slag Ring", "File Tooth", "Chain Link", "Iron Halo",
    "Bevel Cut", "Hex Die", "Gear Tooth", "Mirror Steel", "Knife Edge",
    "Chrome Arc", "Anvil Face", "Spring Coil", "Steel Bloom", "Polished Core",
    "Ink Well", "Quiet Eclipse", "Night Vein", "Char Ring", "Shadow Cut",
    "Void Rim", "Soot Lattice", "Black Moon", "Pitch Spiral", "Silent Disk",
    "Frost Etch", "Violet Lattice", "Rune Chip", "Ghost Thread", "Mithril Vein",
    "Arcane Coin", "Whisper Facet", "Silver Sigil", "Cold Fire", "Dream Plate",
    "Green Cut", "Shard Heart", "Jade Armor", "Prism Seed", "Adamant Bloom",
    "Facet Storm", "Emerald Orbit", "Crystal Nest", "Hard Light", "Living Stone",
    "Triple Orbit", "Sigil Wheel", "Aurora Disk", "Rune Storm", "Star Lattice",
    "Ley Line", "Glyph Halo", "Tide of Runes", "Sky Forge", "Ninth Seal",
    "Scale Mail", "Ember Tongue", "Magma Crack", "Wyrm Eye", "Fire Lattice",
    "Blood Gold", "Coil of Heat", "Dragon Coin", "Inferno Rim", "Last Scale",
    "Spirit Slit", "Grave Ring", "Wight Halo", "Phantom Weave", "Bone Orbit",
    "Soul Crack", "Barrow Seal", "Ghost Crown", "Night Choir", "Undying Disk",
    "Prism Heart", "Ice Galaxy", "Refract", "Crystal Storm", "Glass Sun",
    "Inner Aurora", "Diamond Tide", "Starforge", "Halo Forge",
    "Absolute",
  ];

  const BANDS = [
    { min: 1, max: 9, motifs: ["stamp", "ripple", "hatch"], tier: 1, a: "#e08a4a", b: "#8a3d1c", c: "#ffd2a8" },
    { min: 10, max: 19, motifs: ["rivet", "hatch", "weave"], tier: 2, a: "#b8c0cc", b: "#5c6570", c: "#e8eef4" },
    { min: 20, max: 29, motifs: ["facet", "rivet", "orbit"], tier: 2, a: "#d5dee8", b: "#7b8794", c: "#ffffff" },
    { min: 30, max: 39, motifs: ["void", "hatch", "pulse"], tier: 3, a: "#3a3a44", b: "#111118", c: "#9aa0b0" },
    { min: 40, max: 49, motifs: ["lattice", "rune", "facet"], tier: 3, a: "#b9a4ff", b: "#4c2d9a", c: "#efe8ff" },
    { min: 50, max: 59, motifs: ["prism", "lattice", "orbit"], tier: 4, a: "#3ee07a", b: "#0d5c32", c: "#d6ffe6" },
    { min: 60, max: 69, motifs: ["orbit", "rune", "comet"], tier: 4, a: "#4ecbff", b: "#164e8a", c: "#dff6ff" },
    { min: 70, max: 79, motifs: ["scale", "crack", "orbit"], tier: 4, a: "#ff5a3c", b: "#6a1208", c: "#ffd0a8" },
    { min: 80, max: 89, motifs: ["pulse", "void", "weave"], tier: 5, a: "#d4a4ff", b: "#2a1048", c: "#f3e8ff" },
    { min: 90, max: 98, motifs: ["prism", "orbit", "comet"], tier: 5, a: "#7ef6ff", b: "#0a4a58", c: "#ffffff" },
    { min: 99, max: 99, motifs: ["crown"], tier: 5, a: "#ffd24a", b: "#7a4a00", c: "#fff4c8" },
  ];

  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (x, y) => Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t);
    const cg = (x, y) => Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t);
    const cb = (x, y) => Math.round((x & 255) * (1 - t) + (y & 255) * t);
    const r = ch(pa, pb);
    const g = cg(pa, pb);
    const bl = cb(pa, pb);
    return "#" + [r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("");
  }

  function bandFor(level) {
    let b = BANDS[0];
    for (const x of BANDS) if (level >= x.min) b = x;
    return b;
  }

  const covers = [];
  for (let level = 1; level <= 99; level++) {
    const band = bandFor(level);
    const i = level - band.min;
    const motif = band.motifs[i % band.motifs.length];
    const t = (i + 1) / Math.max(1, band.max - band.min + 1);
    const value = mixHex(band.a, band.b, 0.25 + t * 0.35);
    const accent = mixHex(band.c, band.a, t * 0.4);
    const ink = mixHex(band.b, "#0a0a10", 0.2);
    const darkText = level < 30 || level === 99;
    covers.push({
      id: "rank-" + String(level).padStart(2, "0"),
      level,
      label: NAMES[level - 1] || "Rank " + level,
      motif,
      coverTier: band.tier,
      value,
      accent,
      ink,
      darkText,
      free: false,
      cost: 0,
      store: false,
      rank: true,
      cat: "rank",
      rarity: level >= 90 ? "legendary" : level >= 70 ? "epic" : level >= 40 ? "rare" : "rank",
    });
  }

  root.RANK_COVERS = covers;
  root.rankCoverForLevel = function (level) {
    const l = Math.max(1, Math.min(99, Math.floor(Number(level) || 1)));
    return covers[l - 1];
  };
  root.rankCoverId = function (level) {
    return root.rankCoverForLevel(level).id;
  };
})(typeof window !== "undefined" ? window : globalThis);
