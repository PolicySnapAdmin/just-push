/**
 * Rank covers — one unique button skin per Push Thru level (1–99).
 * U.S. military titles first, then rising power titles. Never sold in the store.
 * Insignia are original geometric marks (not official DoD artwork).
 */
(function (root) {
  function svgUri(inner) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">' + inner + "</svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function stroke(color, w) {
    return 'stroke="' + color + '" stroke-width="' + (w || 3) + '" stroke-linecap="round" stroke-linejoin="round"';
  }

  function chevronRow(y, color, w) {
    return '<path d="M14 ' + y + " L32 " + (y - 11) + " L50 " + y + '" ' + stroke(color, w || 3.2) + "/>";
  }

  function rocker(y, color) {
    return '<path d="M16 ' + y + " Q32 " + (y + 9) + " 48 " + y + '" ' + stroke(color, 3) + "/>";
  }

  function star(cx, cy, r, color) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const b = a + Math.PI / 5;
      pts.push((cx + Math.cos(a) * r).toFixed(1) + "," + (cy + Math.sin(a) * r).toFixed(1));
      pts.push((cx + Math.cos(b) * r * 0.4).toFixed(1) + "," + (cy + Math.sin(b) * r * 0.4).toFixed(1));
    }
    return '<polygon points="' + pts.join(" ") + '" fill="' + color + '"/>';
  }

  function bar(x, y, w, h, color) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.2" fill="' + color + '"/>';
  }

  function leaf(color, ox) {
    const x = ox || 32;
    return (
      '<path d="M' + x + " 18 C" + (x + 10) + " 24 " + (x + 10) + " 40 " + x + " 48 C" + (x - 10) + " 40 " + (x - 10) + " 24 " + x +
      ' 18Z" fill="' + color + '" opacity="0.95"/>' +
      '<path d="M' + x + " 20 L" + x + ' 46" ' + stroke("#1a1408", 1.4) + "/>"
    );
  }

  function eagle(color) {
    return (
      '<path d="M12 34 Q20 22 32 26 Q44 22 52 34 Q44 30 32 36 Q20 30 12 34Z" fill="' + color + '"/>' +
      '<path d="M32 26 L32 44" ' + stroke(color, 2.4) + "/>" +
      '<circle cx="32" cy="22" r="3.2" fill="' + color + '"/>'
    );
  }

  function wreath(color) {
    return (
      '<path d="M18 46 Q12 32 20 18" ' + stroke(color, 2.4) + "/>" +
      '<path d="M46 46 Q52 32 44 18" ' + stroke(color, 2.4) + "/>"
    );
  }

  function crown(color) {
    return (
      '<path d="M12 40 L16 22 L26 34 L32 16 L38 34 L48 22 L52 40 Z" fill="' + color + '"/>' +
      '<rect x="12" y="40" width="40" height="8" fill="' + color + '"/>'
    );
  }

  function laurel(color) {
    return (
      '<path d="M18 50 Q8 32 22 14" ' + stroke(color, 3) + "/>" +
      '<path d="M46 50 Q56 32 42 14" ' + stroke(color, 3) + "/>" +
      star(32, 30, 8, color)
    );
  }

  function sunburst(color) {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const x1 = 32 + Math.cos(a) * 10;
      const y1 = 32 + Math.sin(a) * 10;
      const x2 = 32 + Math.cos(a) * 26;
      const y2 = 32 + Math.sin(a) * 26;
      rays += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" ' + stroke(color, 2.2) + "/>";
    }
    return rays + '<circle cx="32" cy="32" r="8" fill="' + color + '"/>';
  }

  function infinity(color) {
    return '<path d="M18 32 C18 22 30 22 32 32 C34 42 46 42 46 32 C46 22 34 22 32 32 C30 42 18 42 18 32Z" ' + stroke(color, 3.2) + "/>";
  }

  function omega(color) {
    return '<path d="M18 44 Q18 16 32 16 Q46 16 46 44 M18 44 L14 50 M46 44 L50 50" ' + stroke(color, 3.4) + "/>";
  }

  function diamond(color) {
    return '<path d="M32 22 L40 32 L32 42 L24 32 Z" fill="' + color + '"/>';
  }

  function insignia(kind, metal) {
    const c = metal || "#f3e6c0";
    const dark = "#1a1408";
    switch (kind) {
      case "blank":
        return svgUri('<circle cx="32" cy="32" r="10" ' + stroke(c, 3) + "/>");
      case "ch1":
        return svgUri(chevronRow(38, c, 4));
      case "ch1r":
        return svgUri(chevronRow(32, c, 4) + rocker(42, c));
      case "spc":
        return svgUri(
          '<path d="M32 14 L50 32 L32 50 L14 32 Z" ' + stroke(c, 3) + "/>" +
            '<path d="M32 22 L40 32 L32 42 L24 32 Z" fill="' + c + '"/>'
        );
      case "ch2":
        return svgUri(chevronRow(28, c, 3.4) + chevronRow(40, c, 3.4));
      case "ch3":
        return svgUri(chevronRow(22, c, 3.2) + chevronRow(33, c, 3.2) + chevronRow(44, c, 3.2));
      case "ch3r1":
        return svgUri(chevronRow(18, c) + chevronRow(28, c) + chevronRow(38, c) + rocker(48, c));
      case "ch3r2":
        return svgUri(chevronRow(16, c) + chevronRow(26, c) + chevronRow(36, c) + rocker(44, c) + rocker(52, c));
      case "ch3r3":
        return svgUri(
          chevronRow(14, c) + chevronRow(24, c) + chevronRow(34, c) + rocker(42, c) + rocker(49, c) + rocker(56, c)
        );
      case "ch1sg":
        return svgUri(
          chevronRow(14, c) + chevronRow(24, c) + chevronRow(34, c) + rocker(42, c) + rocker(49, c) + rocker(56, c) + diamond(c)
        );
      case "chsgm":
        return svgUri(
          chevronRow(14, c) + chevronRow(24, c) + chevronRow(34, c) + rocker(44, c) + rocker(51, c) + rocker(58, c) + star(32, 40, 5, c)
        );
      case "chcsm":
        return svgUri(
          wreath(c) +
            chevronRow(16, c) +
            chevronRow(26, c) +
            chevronRow(36, c) +
            star(32, 40, 5.5, c)
        );
      case "sma":
        return svgUri(eagle(c) + wreath(c));
      case "wo1":
        return svgUri('<rect x="18" y="18" width="28" height="28" ' + stroke(c, 3) + "/>" + bar(22, 30, 20, 5, c));
      case "cw2":
        return svgUri('<rect x="18" y="18" width="28" height="28" ' + stroke(c, 3) + "/>" + bar(22, 26, 20, 4, c) + bar(22, 34, 20, 4, c));
      case "cw3":
        return svgUri(
          '<rect x="18" y="16" width="28" height="32" ' + stroke(c, 3) + "/>" +
            bar(22, 22, 20, 4, c) +
            bar(22, 30, 20, 4, c) +
            bar(22, 38, 20, 4, c)
        );
      case "cw4":
        return svgUri(
          '<rect x="16" y="16" width="32" height="32" fill="' + dark + '" ' + stroke(c, 2.5) + "/>" +
            bar(20, 22, 24, 4, c) +
            bar(20, 30, 24, 4, c) +
            bar(20, 38, 24, 4, c)
        );
      case "cw5":
        return svgUri(
          '<rect x="16" y="16" width="32" height="32" fill="' + dark + '" ' + stroke(c, 2.5) + "/>" + eagle(c)
        );
      case "bar1":
        return svgUri(bar(20, 26, 24, 12, c));
      case "bar1s":
        return svgUri(bar(20, 26, 24, 12, "#e8eef4"));
      case "bar2":
        return svgUri(bar(14, 26, 14, 12, "#e8eef4") + bar(36, 26, 14, 12, "#e8eef4"));
      case "oakg":
        return svgUri(leaf(c));
      case "oaks":
        return svgUri(leaf("#e8eef4"));
      case "eagle":
        return svgUri(eagle(c));
      case "star1":
        return svgUri(star(32, 32, 14, c));
      case "star2":
        return svgUri(star(22, 32, 11, c) + star(42, 32, 11, c));
      case "star3":
        return svgUri(star(32, 20, 10, c) + star(20, 40, 10, c) + star(44, 40, 10, c));
      case "star4":
        return svgUri(star(20, 20, 9, c) + star(44, 20, 9, c) + star(20, 44, 9, c) + star(44, 44, 9, c));
      case "star5":
        return svgUri(
          star(32, 16, 8, c) + star(16, 28, 8, c) + star(48, 28, 8, c) + star(22, 46, 8, c) + star(42, 46, 8, c)
        );
      case "anchor":
        return svgUri(
          '<circle cx="32" cy="16" r="5" ' + stroke(c, 2.6) + "/>" +
            '<path d="M32 20 L32 48 M18 40 Q32 56 46 40" ' + stroke(c, 3.2) + "/>"
        );
      case "fouled":
        return svgUri(
          '<circle cx="32" cy="16" r="4.5" fill="' + c + '"/>' +
            '<path d="M32 20 L32 50 M16 38 Q32 58 48 38 M22 28 Q32 22 42 28" ' + stroke(c, 3) + "/>"
        );
      case "lcpl":
        return svgUri(chevronRow(30, c, 4) + '<circle cx="32" cy="44" r="4" fill="' + c + '"/>');
      case "gunny":
        return svgUri(chevronRow(16, c) + chevronRow(26, c) + chevronRow(36, c) + rocker(46, c) + rocker(54, c));
      case "wings":
        return svgUri(
          '<path d="M8 36 Q24 20 32 28 Q40 20 56 36 Q40 28 32 34 Q24 28 8 36Z" fill="' + c + '"/>' +
            '<circle cx="32" cy="30" r="4" fill="' + dark + '"/>'
        );
      case "cross":
        return svgUri(
          '<path d="M32 10 L32 54 M18 26 L46 26" ' + stroke(c, 5) + "/>" +
            '<circle cx="32" cy="26" r="5" fill="' + c + '"/>'
        );
      case "crown":
        return svgUri(crown(c));
      case "laurel":
        return svgUri(laurel(c));
      case "sun":
        return svgUri(sunburst(c));
      case "bolt":
        return svgUri('<path d="M36 8 L20 34 L30 34 L26 56 L46 28 L34 28 Z" fill="' + c + '"/>');
      case "inf":
        return svgUri(infinity(c));
      case "omega":
        return svgUri(omega(c));
      case "eye":
        return svgUri(
          '<path d="M8 32 Q32 12 56 32 Q32 52 8 32Z" ' + stroke(c, 2.8) + "/>" +
            '<circle cx="32" cy="32" r="7" fill="' + c + '"/>'
        );
      default:
        return svgUri(star(32, 32, 12, c));
    }
  }

  const RANKS = [
    { name: "Recruit", abbr: "RCT", mark: "blank" },
    { name: "Private", abbr: "PVT", mark: "ch1" },
    { name: "Private First Class", abbr: "PFC", mark: "ch1r" },
    { name: "Specialist", abbr: "SPC", mark: "spc" },
    { name: "Corporal", abbr: "CPL", mark: "ch2" },
    { name: "Sergeant", abbr: "SGT", mark: "ch3" },
    { name: "Staff Sergeant", abbr: "SSG", mark: "ch3r1" },
    { name: "Sergeant First Class", abbr: "SFC", mark: "ch3r2" },
    { name: "Master Sergeant", abbr: "MSG", mark: "ch3r3" },
    { name: "First Sergeant", abbr: "1SG", mark: "ch1sg" },
    { name: "Sergeant Major", abbr: "SGM", mark: "chsgm" },
    { name: "Command Sergeant Major", abbr: "CSM", mark: "chcsm" },
    { name: "Sergeant Major of the Army", abbr: "SMA", mark: "sma" },
    { name: "Warrant Officer", abbr: "WO1", mark: "wo1" },
    { name: "Chief Warrant Officer 2", abbr: "CW2", mark: "cw2" },
    { name: "Chief Warrant Officer 3", abbr: "CW3", mark: "cw3" },
    { name: "Chief Warrant Officer 4", abbr: "CW4", mark: "cw4" },
    { name: "Chief Warrant Officer 5", abbr: "CW5", mark: "cw5" },
    { name: "Second Lieutenant", abbr: "2LT", mark: "bar1" },
    { name: "First Lieutenant", abbr: "1LT", mark: "bar1s" },
    { name: "Captain", abbr: "CPT", mark: "bar2" },
    { name: "Major", abbr: "MAJ", mark: "oakg" },
    { name: "Lieutenant Colonel", abbr: "LTC", mark: "oaks" },
    { name: "Colonel", abbr: "COL", mark: "eagle" },
    { name: "Brigadier General", abbr: "BG", mark: "star1" },
    { name: "Major General", abbr: "MG", mark: "star2" },
    { name: "Lieutenant General", abbr: "LTG", mark: "star3" },
    { name: "General", abbr: "GEN", mark: "star4" },
    { name: "General of the Army", abbr: "GA", mark: "star5" },
    { name: "Seaman", abbr: "SN", mark: "anchor" },
    { name: "Petty Officer", abbr: "PO", mark: "ch2" },
    { name: "Chief Petty Officer", abbr: "CPO", mark: "fouled" },
    { name: "Senior Chief", abbr: "SCPO", mark: "fouled" },
    { name: "Master Chief", abbr: "MCPO", mark: "fouled" },
    { name: "Ensign", abbr: "ENS", mark: "bar1" },
    { name: "Lieutenant Commander", abbr: "LCDR", mark: "oakg" },
    { name: "Commander", abbr: "CDR", mark: "oaks" },
    { name: "Rear Admiral", abbr: "RADM", mark: "star2" },
    { name: "Vice Admiral", abbr: "VADM", mark: "star3" },
    { name: "Admiral", abbr: "ADM", mark: "star4" },
    { name: "Lance Corporal", abbr: "LCpl", mark: "lcpl" },
    { name: "Gunnery Sergeant", abbr: "GySgt", mark: "gunny" },
    { name: "Master Gunnery Sergeant", abbr: "MGySgt", mark: "chsgm" },
    { name: "Airman", abbr: "Amn", mark: "wings" },
    { name: "Chief Master Sergeant", abbr: "CMSgt", mark: "wings" },
    { name: "Knight", abbr: "KNT", mark: "cross" },
    { name: "Knight-Captain", abbr: "KCPT", mark: "cross" },
    { name: "Knight-Commander", abbr: "KCMD", mark: "cross" },
    { name: "Paladin", abbr: "PLD", mark: "cross" },
    { name: "Baronet", abbr: "BT", mark: "leafg" },
    { name: "Baron", abbr: "BRN", mark: "oakg" },
    { name: "Viscount", abbr: "VIS", mark: "oaks" },
    { name: "Earl", abbr: "ERL", mark: "laurel" },
    { name: "Marquis", abbr: "MRQ", mark: "laurel" },
    { name: "Duke", abbr: "DUK", mark: "crown" },
    { name: "Grand Duke", abbr: "GDUK", mark: "crown" },
    { name: "Archduke", abbr: "ADUK", mark: "crown" },
    { name: "Prince", abbr: "PRN", mark: "crown" },
    { name: "Crown Prince", abbr: "CPR", mark: "crown" },
    { name: "King", abbr: "KNG", mark: "crown" },
    { name: "High King", abbr: "HKNG", mark: "laurel" },
    { name: "Emperor", abbr: "EMP", mark: "sun" },
    { name: "Imperator", abbr: "IMP", mark: "sun" },
    { name: "Overlord", abbr: "OVL", mark: "eagle" },
    { name: "Warlord", abbr: "WLD", mark: "bolt" },
    { name: "Supreme Commander", abbr: "SCMD", mark: "star5" },
    { name: "Champion", abbr: "CHP", mark: "laurel" },
    { name: "Hero", abbr: "HERO", mark: "star1" },
    { name: "Legend", abbr: "LGD", mark: "star2" },
    { name: "Mythic", abbr: "MYTH", mark: "eye" },
    { name: "Titan", abbr: "TTN", mark: "bolt" },
    { name: "Colossus", abbr: "CLS", mark: "sun" },
    { name: "Behemoth", abbr: "BHM", mark: "diamond" },
    { name: "Leviathan", abbr: "LVTH", mark: "fouled" },
    { name: "Demigod", abbr: "DGD", mark: "sun" },
    { name: "God", abbr: "GOD", mark: "sun" },
    { name: "High God", abbr: "HGOD", mark: "laurel" },
    { name: "Elder God", abbr: "EGOD", mark: "omega" },
    { name: "Primordial", abbr: "PRIM", mark: "inf" },
    { name: "Eternal", abbr: "ETRN", mark: "inf" },
    { name: "Immortal", abbr: "IMTL", mark: "inf" },
    { name: "Transcendent", abbr: "TRN", mark: "omega" },
    { name: "Celestial", abbr: "CEL", mark: "star5" },
    { name: "Astral", abbr: "AST", mark: "star4" },
    { name: "Cosmic", abbr: "CSM2", mark: "sun" },
    { name: "Divine", abbr: "DIV", mark: "eye" },
    { name: "Omnipotent", abbr: "OMN", mark: "omega" },
    { name: "Infinite", abbr: "INF", mark: "inf" },
    { name: "Omega", abbr: "OMG", mark: "omega" },
    { name: "Apex", abbr: "APX", mark: "star5" },
    { name: "Sovereign", abbr: "SOV", mark: "crown" },
    { name: "Origin", abbr: "ORG", mark: "sun" },
    { name: "Prime", abbr: "PRM", mark: "star5" },
    { name: "Nexus", abbr: "NEX", mark: "eye" },
    { name: "Singularity", abbr: "SNG", mark: "inf" },
    { name: "Ascendant", abbr: "ASC", mark: "sun" },
    { name: "The One", abbr: "ONE", mark: "eye" },
    { name: "God-Emperor", abbr: "GEMP", mark: "crown" },
    { name: "Supreme", abbr: "SUP", mark: "star5" },
  ];

  const BANDS = [
    { min: 1, max: 13, motifs: ["stamp", "hatch", "rivet"], tier: 1, a: "#6b7a4a", b: "#2f3a22", c: "#d7c089", metal: "#d7c089" },
    { min: 14, max: 18, motifs: ["facet", "rivet"], tier: 2, a: "#8a9098", b: "#2a2e34", c: "#e8eef4", metal: "#e8eef4" },
    { min: 19, max: 29, motifs: ["facet", "orbit"], tier: 3, a: "#c9a227", b: "#4a3208", c: "#ffe08a", metal: "#ffd24a" },
    { min: 30, max: 40, motifs: ["void", "orbit", "rivet"], tier: 3, a: "#1e4a7a", b: "#0a1c33", c: "#f0d48a", metal: "#f0d48a" },
    { min: 41, max: 45, motifs: ["weave", "hatch"], tier: 3, a: "#4a5c38", b: "#1c2414", c: "#c5d4a0", metal: "#c5d4a0" },
    { min: 46, max: 60, motifs: ["lattice", "rune", "crown"], tier: 4, a: "#7a5a16", b: "#2a1a06", c: "#ffe08a", metal: "#ffd24a" },
    { min: 61, max: 74, motifs: ["crack", "scale", "orbit"], tier: 4, a: "#8a1c18", b: "#2a0808", c: "#ffb080", metal: "#ffd24a" },
    { min: 75, max: 89, motifs: ["prism", "void", "pulse"], tier: 5, a: "#4a1c8a", b: "#120428", c: "#f0d0ff", metal: "#f4e8ff" },
    { min: 90, max: 99, motifs: ["crown", "prism", "orbit"], tier: 5, a: "#ffd24a", b: "#4a2a00", c: "#fff4c8", metal: "#fff4c8" },
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

  if (RANKS.length !== 99) {
    console.warn("RANK_COVERS expected 99 titles, got", RANKS.length);
  }

  const covers = [];
  for (let level = 1; level <= 99; level++) {
    const band = bandFor(level);
    const spec = RANKS[level - 1] || { name: "Rank " + level, abbr: "R" + level, mark: "star1" };
    const i = level - band.min;
    const motif = band.motifs[i % band.motifs.length];
    const t = (i + 1) / Math.max(1, band.max - band.min + 1);
    const value = mixHex(band.a, band.b, 0.2 + t * 0.35);
    const accent = mixHex(band.c, band.a, t * 0.35);
    const ink = mixHex(band.b, "#0a0a10", 0.15);
    const metal = band.metal || accent;
    const markKind = spec.mark === "leafg" ? "oakg" : spec.mark === "diamond" ? "spc" : spec.mark;
    covers.push({
      id: "rank-" + String(level).padStart(2, "0"),
      level,
      label: spec.name,
      abbr: spec.abbr,
      motif,
      markKind,
      mark: insignia(markKind, metal),
      coverTier: band.tier,
      value,
      accent,
      ink,
      darkText: level < 19 || level >= 90,
      free: false,
      cost: 0,
      store: false,
      rank: true,
      cat: "rank",
      rarity: level >= 90 ? "legendary" : level >= 61 ? "epic" : level >= 29 ? "rare" : "rank",
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
