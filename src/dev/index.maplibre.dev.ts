import mapLibreStyle from '@/dev/maplibre-style.ts';
import { layerStyles } from '@/dev/styles/layer-styles.ts';
import {
  Geoman,
  type GeoJsonShapeFeature,
  type GmOptionsData,
  type LngLatTuple,
  type MapInstanceWithGeoman,
} from '@/main.ts';
import log from 'loglevel';
import 'maplibre-gl/dist/maplibre-gl.css';
import ml from 'maplibre-gl';
import type { PartialDeep } from 'type-fest';
import { mount, unmount } from 'svelte';
import LeftPanel from '@/dev/components/LeftPanel.svelte';
import RightPanel from '@/dev/components/RightPanel.svelte';
import { cloneDeep, get } from 'lodash-es';
import transformRotate from '@turf/transform-rotate';
import bearing from '@turf/bearing';

log.setLevel(log.levels.TRACE);

const gmOptions: PartialDeep<GmOptionsData> = {
  settings: {
    controlsPosition: 'top-left',
    useDefaultLayers: true,
    controlsUiEnabledByDefault: true,
    controlsCollapsible: true,
    controlsStyles: {
      controlGroupClass: 'maplibregl-ctrl maplibregl-ctrl-group',
      controlContainerClass: 'gm-control-container',
      controlButtonClass: 'gm-control-button',
    },
    customGetAllShapeSegments(featureData) {
      console.log(featureData);
      return null;
    },
    customRotateHandler({ featureData, lngLatStart, lngLatEnd }, shapeCentroid) {
      if (featureData.shape === 'polygon') {
        const geoJson = cloneDeep(featureData.getGeoJson() as GeoJsonShapeFeature);

        const bearingStart = bearing(shapeCentroid, lngLatStart);
        const bearingEnd = bearing(shapeCentroid, lngLatEnd);

        const rotationAngle = bearingEnd - bearingStart;
        const angle = (rotationAngle + 360) % 360;

        geoJson.geometry = transformRotate(geoJson, angle, { pivot: shapeCentroid }).geometry;

        return geoJson;
      }

      return null;
    },
    customVertexUpdateHandler({ featureData, lngLatEnd, markerData }) {
      if (featureData.shape === 'polygon') {
        const geoJson = cloneDeep(featureData.getGeoJson() as GeoJsonShapeFeature);
        const coordPath = cloneDeep(markerData.position.path);
        const coordIndex = coordPath.pop();
        const coordinates = get(geoJson, coordPath) as Array<LngLatTuple>;

        if (Array.isArray(coordinates) && typeof coordIndex === 'number') {
          coordinates[coordIndex] = [...lngLatEnd];
          if (coordIndex === 0 && featureData.shape === 'polygon') {
            coordinates[coordinates.length - 1] = [...lngLatEnd];
          }
        } else {
          log.error('BaseDrag.moveSingleVertex: invalid coordinates', geoJson, coordPath);
        }

        return geoJson;
      }

      return null;
    },
    customDragHandler() {
      return null;
    },
  },
  layerStyles: layerStyles,
  controls: {
    edit: {
      drag: {
        title: 'Drag',
        uiEnabled: true,
      },
    },
    draw: {},
    helper: {
      shape_markers: {
        active: false,
        uiEnabled: true,
      },
    },
  },
};

// Panel state for persistence
const STORAGE_KEY = 'gm-dev-panels';

interface PanelState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const loadPanelState = (): PanelState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return { leftCollapsed: false, rightCollapsed: false };
};

const savePanelState = (state: PanelState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

// Panel management
let leftPanelComponent: ReturnType<typeof mount> | null = null;
let rightPanelComponent: ReturnType<typeof mount> | null = null;
const panelState = loadPanelState();

const leftPanelElement = document.getElementById('dev-left-panel');
const rightPanelElement = document.getElementById('dev-right-panel');

// Apply initial panel state
if (leftPanelElement && panelState.leftCollapsed) {
  leftPanelElement.classList.add('collapsed');
}
if (rightPanelElement && panelState.rightCollapsed) {
  rightPanelElement.classList.add('collapsed');
}

const toggleLeftPanel = () => {
  if (!leftPanelElement) return;
  leftPanelElement.classList.toggle('collapsed');
  panelState.leftCollapsed = leftPanelElement.classList.contains('collapsed');
  savePanelState(panelState);
};

const toggleRightPanel = () => {
  if (!rightPanelElement) return;
  rightPanelElement.classList.toggle('collapsed');
  panelState.rightCollapsed = rightPanelElement.classList.contains('collapsed');
  savePanelState(panelState);
};

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+1 or Cmd+1 to toggle left panel
  if ((e.ctrlKey || e.metaKey) && e.key === '1') {
    e.preventDefault();
    toggleLeftPanel();
  }
  // Ctrl+2 or Cmd+2 to toggle right panel
  if ((e.ctrlKey || e.metaKey) && e.key === '2') {
    e.preventDefault();
    toggleRightPanel();
  }
});

const mountPanels = (geoman: Geoman, map: ml.Map) => {
  if (leftPanelElement && !leftPanelComponent) {
    leftPanelComponent = mount(LeftPanel, {
      target: leftPanelElement,
      props: {
        geoman,
      },
    });
  }

  if (rightPanelElement && !rightPanelComponent) {
    rightPanelComponent = mount(RightPanel, {
      target: rightPanelElement,
      props: {
        geoman,
        map,
      },
    });
  }
};

const unmountPanels = () => {
  if (leftPanelComponent) {
    unmount(leftPanelComponent);
    leftPanelComponent = null;
  }
  if (rightPanelComponent) {
    unmount(rightPanelComponent);
    rightPanelComponent = null;
  }
  // Clear panel content
  if (leftPanelElement) {
    leftPanelElement.innerHTML = '';
  }
  if (rightPanelElement) {
    rightPanelElement.innerHTML = '';
  }
};

const initGeoman = async () => {
  const existingMapInstance = window.customData?.map as ml.Map | undefined;
  const map =
    existingMapInstance ||
    new ml.Map({
      container: 'dev-map',
      style: mapLibreStyle,
      center: [0, 51],
      zoom: 5,
      fadeDuration: 50,
    });
  console.log(`Maplibre version: "${map.version}"`);

  if (window.geoman) {
    console.error('Geoman is already initialized', window.geoman);
  }

  let geoman = new Geoman(map, gmOptions);
  await geoman.destroy();
  geoman = new Geoman(map, gmOptions);
  await geoman.waitForGeomanLoaded();

  map.on('gm:create', (event) => {
    console.log('feature geojson', event.feature.getGeoJson());
    console.log('source geojson', event.feature.source.getGeoJson());
  });

  // geoman.features.setSelection([1, 2, 3, 4, 5, 6, 7, 151]);

  return { geoman, map };
};

// Auto-initialize on load
(async () => {
  log.debug('Initializing Geoman dev environment');
  const { geoman, map } = await initGeoman();

  window.geoman = geoman;
  window.customData ??= { eventResults: {} };
  window.customData.map = map as unknown as MapInstanceWithGeoman;

  // Mount the dev panels
  mountPanels(geoman, map);

  log.debug('geoman version:', __GEOMAN_VERSION__);
  log.debug('Dev panels mounted');
})();

// Export for potential hot module replacement
export { toggleLeftPanel, toggleRightPanel, unmountPanels };
