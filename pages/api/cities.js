// pages/api/cities.js
// BD: return ALL 64 district HQs using PPLA2 (+ fallback PPLA/PPLC)
// Others: Top-20 important cities by population (with capital/admin boost)

const TTL_MS = 1000 * 60 * 60; // 1h cache
const cache = new Map();

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’`´]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const score = (r) =>
  (r.population || 0) +
  (r.fcode === "PPLC" ? 5_000_000 : 0) +
  (String(r.fcode).startsWith("PPLA") ? 500_000 : 0);

const BD_DISTRICTS = [
  "Barguna","Barishal","Bhola","Jhalokati","Patuakhali","Pirojpur",
  "Bandarban","Brahmanbaria","Chandpur","Chattogram","Cumilla","Cox's Bazar","Feni","Khagrachari","Lakshmipur","Noakhali","Rangamati",
  "Dhaka","Faridpur","Gazipur","Gopalganj","Kishoreganj","Madaripur","Manikganj","Munshiganj","Narayanganj","Narsingdi","Rajbari","Shariatpur","Tangail",
  "Bagerhat","Chuadanga","Jashore","Jhenaidah","Khulna","Kushtia","Magura","Meherpur","Narail","Satkhira",
  "Jamalpur","Mymensingh","Netrakona","Sherpur",
  "Bogura","Joypurhat","Naogaon","Natore","Chapai Nawabganj","Pabna","Rajshahi","Sirajganj",
  "Dinajpur","Gaibandha","Kurigram","Lalmonirhat","Nilphamari","Panchagarh","Rangpur","Thakurgaon",
  "Habiganj","Moulvibazar","Sunamganj","Sylhet",
];

const BD_ALIASES = {
  "barishal": ["barisal"],
  "cumilla": ["comilla"],
  "chattogram": ["chittagong"],
  "jashore": ["jessore"],
  "bogura": ["bogra"],
  "chapai nawabganj": ["nawabganj","chapainawabganj","chapai-nawabganj"],
  "moulvibazar": ["maulvibazar","moulvi bazar","moulavibazar"],
  "lakshmipur": ["laxmipur","lakshmipur district"],
  "khagrachari": ["khagrachhari"],
  "cox's bazar": ["coxs bazar","cox s bazar","coxs bazaar","cox bazar","cox’s bazar","cox’s bāzār"],
};

const buildBDKeys = () => {
  const out = new Map();
  for (const name of BD_DISTRICTS) {
    const key = norm(name);
    out.set(key, name);
    const aliases = BD_ALIASES[key] || [];
    for (const a of aliases) out.set(norm(a), name);
  }
  return out;
};
const BD_KEYS = buildBDKeys();

async function fetchGeoNames(username, params, paginate = true) {
  // params: { country, featureClass, featureCode, orderby, maxRows, startRow, q }
  const base = new URL("http://api.geonames.org/searchJSON");
  base.searchParams.set("username", username);
  Object.entries(params).forEach(([k, v]) => v != null && base.searchParams.set(k, String(v)));

  const MAX = 1000;
  const rows = [];
  let startRow = Number(params.startRow || 0);

  while (true) {
    base.searchParams.set("startRow", String(startRow));
    base.searchParams.set("maxRows", String(params.maxRows || MAX));
    const resp = await fetch(base.toString());
    const data = await resp.json();
    const batch = Array.isArray(data?.geonames) ? data.geonames : [];
    rows.push(...batch);
    if (!paginate || batch.length < (params.maxRows || MAX)) break;
    startRow += (params.maxRows || MAX);
  }
  return rows;
}

function normalizeRows(arr, country) {
  return arr.map(g => ({
    geonameId: g.geonameId,
    name: g.name,
    altName: g.toponymName || "",
    admin1: g.adminName1 || "",
    admin2: g.adminName2 || "",
    country,
    population: Number(g.population || 0),
    lat: Number(g.lat),
    lng: Number(g.lng),
    fcode: g.fcode || "",
    _n: norm(g.name),
    _na: norm(g.toponymName || ""),
  }));
}

export default async function handler(req, res) {
  const username = process.env.GEONAMES_USER;
  const country = String(req.query.country || "").toUpperCase();

  if (!username) return res.status(500).json({ error: "Missing GEONAMES_USER env var" });
  if (!country || country.length !== 2) {
    return res.status(400).json({ error: "Provide ?country=XX (ISO-2)" });
  }

  const cacheKey = `cities:${country}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return res.status(200).json(hit.payload);
  }

  try {
    // -------- Non-BD: Top-20 important --------
    if (country !== "BD") {
      const rows = await fetchGeoNames(
        username,
        { country, featureClass: "P", orderby: "population" },
        true
      );
      const normed = normalizeRows(rows, country);
      const byName = new Map();
      for (const r of normed) {
        const key = r._n;
        const old = byName.get(key);
        if (!old || score(r) > score(old)) byName.set(key, r);
      }
      const top20 = Array.from(byName.values())
        .sort((a, b) => score(b) - score(a))
        .slice(0, 20)
        .map((r, i) => ({
          rank: i + 1,
          name: r.name,
          admin1: r.admin1,
          population: r.population,
          lat: r.lat,
          lng: r.lng,
          tags: [r.fcode],
        }));

      const payload = { country, mode: "TOP20", count: top20.length, cities: top20, cached: false };
      cache.set(cacheKey, { ts: Date.now(), payload });
      return res.status(200).json(payload);
    }

    // -------- BD: fetch district HQs robustly --------
    // 1) fetch all PPLA2 (district capitals)
    const ppla2Rows = await fetchGeoNames(
      username,
      { country: "BD", featureClass: "P", featureCode: "PPLA2", orderby: "population" },
      true
    );

    // 2) Also fetch PPLA (division HQs) and PPLC (national capital) as fallback
    const pplaRows = await fetchGeoNames(
      username,
      { country: "BD", featureClass: "P", featureCode: "PPLA", orderby: "population" },
      true
    );
    const pplcRows = await fetchGeoNames(
      username,
      { country: "BD", featureClass: "P", featureCode: "PPLC", orderby: "population" },
      false
    );

    const normedAll = normalizeRows([...ppla2Rows, ...pplaRows, ...pplcRows], "BD");

    // Bucket candidates by normalized name (and altName)
    const buckets = new Map();
    const ensure = (k) => { if (!buckets.has(k)) buckets.set(k, []); return buckets.get(k); };

    for (const r of normedAll) {
      ensure(r._n).push(r);
      if (r._na && r._na !== r._n) ensure(r._na).push(r);
    }

    const bdScore = (r) => {
      let s = score(r);
      if (r.fcode === "PPLA2") s += 1_000_000; // prefer district HQs
      if (r.fcode === "PPLA")  s += 600_000;
      return s;
    };

    const picked = [];
    const used = new Set();

    const chooseBest = (key) => {
      const arr = buckets.get(key) || [];
      if (arr.length === 0) return null;
      return arr.sort((a, b) => bdScore(b) - bdScore(a))[0];
    };

    // 3) Pick best match for each of the 64 districts (aliases included)
    for (const [key, displayName] of buildBDKeys()) {
      const best = chooseBest(key);
      if (best && !used.has(best.geonameId)) {
        picked.push({ ...best, name: displayName });
        used.add(best.geonameId);
      }
    }

    // 4) If any missing, broaden using the global P list (population-ordered, paginated)
    if (picked.length < 64) {
      const allP = normalizeRows(
        await fetchGeoNames(username, { country: "BD", featureClass: "P", orderby: "population" }, true),
        "BD"
      );

      const presentKeys = new Set(picked.map(p => norm(p.name)));
      const missing = BD_DISTRICTS.filter(d => !presentKeys.has(norm(d)));

      for (const d of missing) {
        const key = norm(d);
        const candidate = allP
          .filter(r => r._n === key || r._na === key || r._n.includes(key) || r._na.includes(key))
          .sort((a, b) => bdScore(b) - bdScore(a))[0];
        if (candidate && !used.has(candidate.geonameId)) {
          picked.push({ ...candidate, name: d });
          used.add(candidate.geonameId);
        }
      }
    }

    // 5) Finalize & sort
    picked.sort((a, b) => {
      const d = String(a.admin1).localeCompare(String(b.admin1));
      if (d !== 0) return d;
      const n = String(a.name).localeCompare(String(b.name));
      if (n !== 0) return n;
      return bdScore(b) - bdScore(a);
    });

    // Dedup by (name, admin1)
    const finalKeyed = new Map();
    for (const r of picked) {
      const k = `${norm(r.name)}|${norm(r.admin1)}`;
      if (!finalKeyed.has(k)) finalKeyed.set(k, r);
    }
    const final = Array.from(finalKeyed.values()).map((r, i) => ({
      rank: i + 1,
      name: r.name,
      admin1: r.admin1,
      population: r.population,
      lat: r.lat,
      lng: r.lng,
      tags: [r.fcode], // expect mostly PPLA2
    }));

    const payload = { country: "BD", mode: "BD_DISTRICTS_64", count: final.length, cities: final, cached: false };
    cache.set(cacheKey, { ts: Date.now(), payload });
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch cities", detail: String(e) });
  }
}
