import '@/styles/globals.css';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

export default function App({ Component, pageProps }) {
  // Fix Leaflet icon paths when using Next
  useEffect(() => {
    // Avoid SSR window undefined
    if (typeof window === 'undefined') return;
    // Dynamically fix default icon path
    const L = require('leaflet');
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  return <Component {...pageProps} />;
}
