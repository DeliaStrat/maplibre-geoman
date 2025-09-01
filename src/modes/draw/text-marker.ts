import type {
  AnyEvent,
  DrawModeName,
  GeoJsonShapeFeature,
  LngLat,
  MapHandlerReturnData,
  ScreenPoint,
  ShapeName,
} from '@/main.ts';
import { BaseDraw } from '@/modes/draw/base.ts';
import { isMapPointerEvent } from '@/utils/guards/map.ts';

import { SOURCES } from '@/core/features/constants.ts';

export class DrawTextMarker extends BaseDraw {
  mode: DrawModeName = 'text_marker';
  shape: ShapeName = 'text_marker';
  textarea: HTMLTextAreaElement | null = null;
  eventHandlers = {
    click: this.onMouseClick.bind(this),
    mousemove: this.onMouseMove.bind(this),
  };

  onStartAction() {
    this.gm.markerPointer.enable({ invisibleMarker: true });
  }

  onEndAction() {
    this.removeTextarea();
    this.removeTmpFeature();
    this.featureData = null;
    this.gm.markerPointer.disable();
    this.fireMarkerPointerFinishEvent();
  }

  onMouseMove(event: AnyEvent): MapHandlerReturnData {
    if (!isMapPointerEvent(event, { warning: true })) {
      return { next: true };
    }

    this.fireMarkerPointerUpdateEvent();
    return { next: true };
  }

  onMouseClick(event: AnyEvent): MapHandlerReturnData {
    if (!isMapPointerEvent(event, { warning: true })) {
      return { next: true };
    }

    if (this.textarea) {
      this.endShape();
      this.gm.markerPointer.enable({ invisibleMarker: true, lngLat: event.lngLat.toArray() });
      this.fireMarkerPointerUpdateEvent();
    } else {
      const lngLat = this.gm.markerPointer.marker?.getLngLat() || event.lngLat.toArray();
      this.fireBeforeFeatureCreate({ geoJsonFeatures: [this.getFeatureGeoJson(lngLat)] });

      if (this.flags.featureCreateAllowed) {
        this.featureData = this.createFeature(lngLat);
        this.gm.markerPointer.disable();
        this.fireMarkerPointerFinishEvent();
      }
    }
    return { next: false };
  }

  createFeature(lngLat: LngLat) {
    const point = this.gm.mapAdapter.project(lngLat);
    this.createTextarea(point);
    return this.gm.features.createFeature({
      shapeGeoJson: this.getFeatureGeoJson(lngLat),
      sourceName: SOURCES.temporary,
    });
  }

  endShape() {
    const text = this.textarea?.value || '';
    this.removeTextarea();

    if (text.trim()) {
      this.updateFeatureSource(text);
      this.saveFeature();
    } else {
      this.removeTmpFeature();
    }
  }

  createTextarea(point: ScreenPoint) {
    this.textarea = document.createElement('textarea');
    this.textarea.style.position = 'absolute';
    this.textarea.style.left = `${point[0]}px`;
    this.textarea.style.top = `${point[1]}px`;
    this.textarea.style.opacity = '0.7';
    this.gm.mapAdapter.getContainer().appendChild(this.textarea);
    this.textarea.focus();
  }

  removeTextarea() {
    this.textarea?.remove();
    this.textarea = null;
  }

  getFeatureGeoJson(lngLat: LngLat): GeoJsonShapeFeature {
    return {
      type: 'Feature',
      properties: {
        shape: this.shape,
        text: '',
      },
      geometry: {
        type: 'Point',
        coordinates: lngLat,
      },
    };
  }

  updateFeatureSource(text: string) {
    if (!this.featureData) {
      return;
    }
    this.featureData.updateGeoJsonProperties({ shape: this.shape, text });
  }
}
