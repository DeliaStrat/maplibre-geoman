import { type Geoman } from '@/main.ts';
import type {
  GmFwdEventNameWithPrefix,
  GmFwdSystemEventNameWithPrefix,
} from '@/types/events/forwarder/index.ts';
import type { GmEventName, GmPrefix } from '@/types/events/index.ts';
import type { FeatureId, FeatureSourceName } from '@/types/features.ts';
import type { GeoJsonImportFeature } from '@/types/index.ts';
import type { Feature } from 'geojson';
import type { EventFor } from '@/types/map/events-map.ts';

export type LngLat = [number, number];
export type ScreenPoint = [number, number];

export const pointerEvents = [
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'contextmenu',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
] as const;

export type PointerEventName = (typeof pointerEvents)[number];

export const baseMapEventNames = ['load'] as const;

export type BaseMapEventName = (typeof baseMapEventNames)[number];

export const gmServiceEventNames = ['loaded'] as const;
export type GmServiceEventName = (typeof gmServiceEventNames)[number];
export type GmServiceEventNameWithPrefix = `${GmPrefix}:${GmServiceEventName}`;

export type MapEventName = PointerEventName | BaseMapEventName;

export type AnyEventName =
  | GmEventName
  | MapEventName
  | GmFwdEventNameWithPrefix
  | GmFwdSystemEventNameWithPrefix
  | GmServiceEventNameWithPrefix;

export type BaseEventListener<T extends string = AnyEventName> = (event: EventFor<T>) => void;

export type GeoJsonFeatureData = {
  id: FeatureId | undefined;
  sourceName: FeatureSourceName;
  geoJson: GeoJsonImportFeature;
};

export type MapTypes = {
  maplibre: object;
};

export type AnyMapInstance = MapTypes[keyof MapTypes];

export type BaseControlsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type CursorType = 'move' | 'pointer' | 'grab' | 'crosshair' | '';

export type MapInstanceWithGeoman<T = AnyMapInstance> = {
  gm: Geoman;
} & T;

export type GeoJsonSourceDiff = {
  remove?: Array<FeatureId>;
  add?: Array<Feature>;
  update?: Array<Feature>;
};

export type BaseFitBoundsOptions = {
  padding?: number;
};

export type AnchorPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type BaseDomMarkerOptions = {
  element: HTMLElement;
  draggable?: boolean;
  anchor?: AnchorPosition;
};

export type BasePopupOptions = {
  offset: number;
  closeOnClick: boolean;
  closeButton: boolean;
  focusAfterOpen: boolean;
  anchor: AnchorPosition;
  className: string;
};

export interface MapWithOnceMethod {
  once(type: string, listener: (ev: unknown) => void): this;
}

export const mapInteractions = [
  'scrollZoom',
  'boxZoom',
  'dragRotate',
  'dragPan',
  'keyboard',
  'doubleClickZoom',
  'touchZoomRotate',
  'touchPitch',
] as const;

export type MapInteraction = (typeof mapInteractions)[number];

export type * from '@/types/map/layers.ts';
