import { useEffect } from 'react';
import { FnMapLayers } from '../../games/fortnite/FnMap';
import { useFortniteMap, useSettings } from '../hooks/useLive';

/**
 * The map layer over Fortnite's full map (M): ShotCaller's own layers drawn in Fortnite's map position, so they
 * sit exactly on top of it. The window is see-through and click-through; it covers the game picture, and the
 * picture is drawn in "1920-wide" units like the reader that found the map.
 */
export function FnMapLayerApp() {
  const live = useFortniteMap();
  const fn = useSettings()?.fortnite;
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);
  const view = live?.fullMap.open ? live.fullMap.view : null;
  if (!live || !fn || !view || !fn.mapLayer.on) return null;
  const look = fn.marker === 'image' && !fn.markerImage ? 'arrow' : fn.marker;
  // Icons keep about the same size on screen at every zoom.
  const u = 0.75 / view.scale;
  return (
    <svg className="fn-theme" viewBox={`0 0 1920 ${live.fullMap.height}`} preserveAspectRatio="none" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none' }}>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        <FnMapLayers
          live={live}
          u={u}
          look={look}
          markerImage={fn.markerImage}
          path={live.route}
          pins={live.chests}
          land={live.landing}
          died={live.death}
          killPins={live.kills}
          plan={live.plan}
          step={live.planStep}
          recap={false}
          show={fn.mapLayer}
        />
      </g>
    </svg>
  );
}
