import type {
  FeatureEditEndFwdEvent,
  FeatureEditStartFwdEvent,
  FeatureUpdatedFwdEvent,
} from '@/types/index.ts';
import test, { expect } from '@playwright/test';
import { dragAndDrop, enableMode, type ScreenCoordinates } from '@tests/utils/basic.ts';
import {
  getGeomanEventResultById,
  saveGeomanEventResultToCustomData,
} from '@tests/utils/events.ts';
import { getFeatureMarkersData, getRenderedFeaturesData } from '@tests/utils/features.ts';
import { setupGeomanTest } from '@tests/utils/test-helpers.ts';

test.describe('Rotate Events', () => {
  test.beforeEach(async ({ page }) => {
    await setupGeomanTest(page, { loadFixture: 'one-shape-of-each-type' });
  });

  test('should fire gm:rotatestart, gm:rotate, and gm:rotateend events during rotation operation', async ({
    page,
  }) => {
    const dragOffsetX = 40;
    const dragOffsetY = -30;
    const rotatableShapes = ['polygon', 'line', 'rectangle'];

    await enableMode(page, 'edit', 'rotate');

    const features = await getRenderedFeaturesData({ page, temporary: false });
    expect(features.length).toBeGreaterThan(0);

    for (const feature of features) {
      if (rotatableShapes.includes(feature.shape)) {
        // Get a vertex marker to drag for rotation
        const markers = await getFeatureMarkersData({
          page,
          featureId: feature.id,
          temporary: false,
          allowedTypes: ['vertex'],
        });

        expect(markers.length, `Vertex markers should exist for ${feature.shape}`).toBeGreaterThan(
          0,
        );
        if (markers.length === 0) {
          continue;
        }

        const vertexMarker = markers[0];
        const initialScreenPoint = vertexMarker.point;
        const targetScreenPoint: ScreenCoordinates = [
          initialScreenPoint[0] + dragOffsetX,
          initialScreenPoint[1] + dragOffsetY,
        ];

        // Set up event listeners
        const rotateStartResultId = await saveGeomanEventResultToCustomData(page, 'rotatestart');
        const rotateResultId = await saveGeomanEventResultToCustomData(page, 'rotate');
        const rotateEndResultId = await saveGeomanEventResultToCustomData(page, 'rotateend');

        // Perform rotation operation
        await dragAndDrop(page, initialScreenPoint, targetScreenPoint);

        const rotateStartEvent = (await getGeomanEventResultById(page, rotateStartResultId)) as
          | FeatureEditStartFwdEvent
          | undefined;
        expect(rotateStartEvent, 'Retrieved event result must be defined').toBeDefined();
        if (rotateStartEvent) {
          expect(rotateStartEvent.feature, 'Event feature must be defined').toBeDefined();
          expect(rotateStartEvent.shape, `Shape should be ${feature.shape}`).toEqual(feature.shape);
        }

        const rotateEvent = (await getGeomanEventResultById(page, rotateResultId)) as
          | FeatureUpdatedFwdEvent
          | undefined;
        expect(rotateEvent, 'Retrieved event result must be defined').toBeDefined();
        if (rotateEvent) {
          expect(rotateEvent.feature, 'Event feature must be defined').toBeDefined();
          expect(rotateEvent.shape, `Shape should be ${feature.shape}`).toEqual(feature.shape);
          expect(rotateEvent.originalFeature, 'Event feature must be defined').toBeDefined();
        }

        const rotateEndEvent = (await getGeomanEventResultById(page, rotateEndResultId)) as
          | FeatureEditEndFwdEvent
          | undefined;
        expect(rotateEndEvent, 'Retrieved event result must be defined').toBeDefined();
        if (rotateEndEvent) {
          expect(rotateEndEvent.feature, 'Event feature must be defined').toBeDefined();
          const requiredShape = feature.shape === 'rectangle' ? 'polygon' : feature.shape;
          expect(rotateEndEvent.shape, `Shape should be ${requiredShape}`).toEqual(requiredShape);
        }
      }
    }
  });
});
