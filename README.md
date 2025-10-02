# Green City Planner & Healthy Settlements

A lightweight Next.js app to analyze a city's environmental indicators and export a PDF of findings.

## Setup

1. Install dependencies
   ```bash
   npm i
   ```

2. Create `.env.local` in the project root with:
   ```bash
   NEXT_PUBLIC_NASA_API_KEY=YOUR_NASA_API_KEY
   NEXT_PUBLIC_GEONAMES_USERNAME=YOUR_GEONAMES_USERNAME
   ```

3. Run
   ```bash
   npm run dev
   ```

## Notes
- NASA API used: `https://api.nasa.gov/planetary/earth/imagery` for recent satellite snapshot.
- Weather & Air Quality: Open-Meteo (no key) and OpenAQ (no key) as public sources.
- Fire: NASA EONET open wildfires feed filtered near the selected city.
- PDF Export: Uses html2canvas + jsPDF; exports the visible dashboard (map + metrics + recommendations).
