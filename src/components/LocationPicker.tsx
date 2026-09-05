import { useState } from 'react';
import { MapPin, X, Navigation } from 'lucide-react';
import { EntryLocation } from '../types';

interface LocationPickerProps {
  location: EntryLocation | null;
  onChange: (location: EntryLocation | null) => void;
  onClose: () => void;
}

export default function LocationPicker({ location, onChange, onClose }: LocationPickerProps) {
  const [locationName, setLocationName] = useState(location?.name || '');
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualSubmit = () => {
    if (locationName.trim()) {
      onChange({
        name: locationName.trim(),
      });
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsDetecting(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // 1. Try Google Maps Geocoder if loaded
          if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
            const geocoder = new google.maps.Geocoder();
            const response = await geocoder.geocode({
              location: { lat: latitude, lng: longitude },
            });
            if (response.results && response.results[0]) {
              onChange({ name: response.results[0].formatted_address, lat: latitude, lng: longitude });
              return;
            }
          }

          // 2. Free Reverse Geocode Fallback via OpenStreetMap
          let placeName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`,
              { headers: { 'Accept-Language': 'en' } }
            );
            if (res.ok) {
              const data = await res.json();
              const addr = data.address || {};
              const locality = addr.city || addr.town || addr.village || addr.suburb || addr.neighbourhood || '';
              const region = addr.state || addr.country || '';
              const formatted = [locality, region].filter(Boolean).join(', ');
              if (formatted) {
                placeName = formatted;
              } else if (data.display_name) {
                placeName = data.display_name.split(',').slice(0, 2).join(',').trim();
              }
            }
          } catch {
            // Keep numerical coords fallback
          }

          onChange({
            name: placeName,
            lat: latitude,
            lng: longitude,
          });
        } catch (err) {
          onChange({
            name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            lat: latitude,
            lng: longitude,
          });
        } finally {
          setIsDetecting(false);
        }
      },
      (err) => {
        setIsDetecting(false);
        setError(
          err.code === 1
            ? 'Location access denied. Please allow location access in your browser settings.'
            : 'Unable to determine your location. Please enter it manually.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClear = () => {
    setLocationName('');
    onChange(null);
  };

  return (
    <div className="mt-3 rounded-xl border border-[#2A2D3A] bg-[#14161E] p-4 space-y-3 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <MapPin className="w-4 h-4 text-indigo-400" />
          <span>Add Location</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[#1E2030] transition-colors"
          aria-label="Close location picker"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleManualSubmit();
            }
          }}
          placeholder="Enter a location name..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#2A2D3A] bg-[#1A1C28] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={handleManualSubmit}
          disabled={!locationName.trim()}
          className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Set
        </button>
      </div>

      <button
        onClick={handleDetectLocation}
        disabled={isDetecting}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-[#2A2D3A] bg-[#1A1C28] text-slate-300 hover:bg-[#1E2030] hover:text-white disabled:opacity-50 transition-colors"
      >
        <Navigation className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
        {isDetecting ? 'Detecting...' : 'Use Current Location'}
      </button>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {location && (
        <div className="flex items-center justify-between rounded-lg bg-[#1E2030] px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">{location.name}</span>
          </div>
          <button
            onClick={handleClear}
            className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
            aria-label="Remove location"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
