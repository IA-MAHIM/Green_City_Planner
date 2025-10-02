// pages/api/countries.js
export default async function handler(req, res) {
  const username = process.env.GEONAMES_USER;
  if (!username) {
    return res.status(500).json({ error: "Missing GEONAMES_USER env var" });
  }

  try {
    // GeoNames: countryInfoJSON returns all ISO countries (≈ 195)
    const resp = await fetch(
      `http://api.geonames.org/countryInfoJSON?username=${username}`
    );
    const data = await resp.json();

    if (!data?.geonames) {
      return res.status(502).json({ error: "GeoNames error", raw: data });
    }

    // Normalize a compact list for dropdowns
    const countries = data.geonames
      .map(c => ({
        name: c.countryName,
        code: c.countryCode,       // ISO-2 (e.g., BD, US)
        iso3: c.isoAlpha3,         // ISO-3 (e.g., BGD, USA)
        capital: c.capital || "",
        population: Number(c.population || 0),
        area: Number(c.areaInSqKm || 0)
      }))
      // keep real countries only (some entries are territories; keep them anyway if you want 195)
      .filter(c => c.code && c.name)
      // sort by name for nicer UX
      .sort((a,b) => a.name.localeCompare(b.name));

    res.status(200).json({ count: countries.length, countries });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch countries", detail: String(e) });
  }
}
