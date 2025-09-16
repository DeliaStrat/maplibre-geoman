import { SOURCES } from '@/core/features/constants.ts';
import { FEATURE_ID_PROPERTY, type Geoman } from '@/main.ts';
import type { FeatureSourceName, GeoJsonSourceDiff } from '@/types';
import { typedKeys, typedValues } from '@/utils/typing.ts';
import type { Feature } from 'geojson';

// this class is here cause playwright fails if it's extracted for unknown reason
// (possible imports trouble)
export class SourceUpdateManager {
  gm: Geoman;
  updateStorage: { [key in FeatureSourceName]: Array<GeoJsonSourceDiff> };
  autoUpdatesEnabled: boolean = true;
  transactionActive: boolean = false;

  constructor(gm: Geoman) {
    this.gm = gm;
    this.updateStorage = Object.fromEntries(typedValues(SOURCES).map((name) => [name, []]));
  }

  getFeatureId(feature: Feature) {
    const id = feature.properties?.[FEATURE_ID_PROPERTY] ?? feature.id;
    if (id === null || id === undefined) {
      console.warn('Feature id is null or undefined', feature);
    }
    return id;
  }

  beginTransaction() {
    console.log('beginTransaction');
    this.transactionActive = true;
  }

  commit() {
    this.intermediateCommit();

    this.transactionActive = false;
    console.log('commit');
  }

  private intermediateCommit() {
    typedValues(SOURCES).forEach((sourceName) => {
      const source = this.gm.features.sources[sourceName];

      const updateStorage = this.updateStorage[sourceName];
      if (!source || updateStorage.length === 0) {
        return;
      }

      const combinedDiff = this.getCombinedDiff(sourceName);
      if (combinedDiff) {
        // console.log('updateData', combinedDiff);
        source.updateData(combinedDiff);
      }
    });
  }

  updateSource({ sourceName, diff }: { sourceName: FeatureSourceName; diff: GeoJsonSourceDiff }) {
    if (this.transactionActive) {
      this.updateStorage[sourceName].push(diff);
      if (this.updateStorage[sourceName].length > 250) {
        this.intermediateCommit();
      }
      return;
    }

    const source = this.gm.features.sources[sourceName];
    if (source) {
      console.log('updateData', diff);
      source.updateData(diff);
    }
  }

  updateSourceActual(sourceName: FeatureSourceName) {
    if (this.autoUpdatesEnabled) {
      const source = this.gm.features.sources[sourceName];
      const combinedDiff = this.getCombinedDiff(sourceName);

      if (source && combinedDiff) {
        // applies non empty diff
        console.log('apply updateData', combinedDiff);
        source.updateData(combinedDiff);
      }
    }
  }

  withAtomicSourcesUpdate<T>(callback: () => T): T {
    try {
      this.autoUpdatesEnabled = false;
      return callback();
    } finally {
      typedKeys(this.gm.features.sources).forEach((sourceName) => {
        this.updateSource({ sourceName, diff: {} });
      });
      this.autoUpdatesEnabled = true;
    }
  }

  getCombinedDiff(sourceName: FeatureSourceName): GeoJsonSourceDiff | null {
    let combinedDiff: GeoJsonSourceDiff = {
      remove: [],
      add: [],
      update: [],
    };

    this.updateStorage[sourceName].forEach((diff) => {
      combinedDiff = this.mergeGeoJsonDiff(combinedDiff, diff);
    });

    this.updateStorage[sourceName] = [];

    if (Object.values(combinedDiff).find((item) => item.length)) {
      return combinedDiff;
    }

    return null;
  }

  mergeGeoJsonDiff(
    pendingDiffOrNull: GeoJsonSourceDiff | null,
    nextDiffOrNull: GeoJsonSourceDiff | null,
  ): GeoJsonSourceDiff {
    const pending: GeoJsonSourceDiff = pendingDiffOrNull ?? { add: [], update: [], remove: [] };
    const next: GeoJsonSourceDiff = nextDiffOrNull ?? { add: [], update: [], remove: [] };

    const nextRemoveIds = new Set(next.remove);

    const pendingAdd =
      pending.add?.filter((item) => !nextRemoveIds.has(this.getFeatureId(item))) || [];
    const pendingUpdate =
      pending.update?.filter((item) => !nextRemoveIds.has(this.getFeatureId(item))) || [];

    const nextUpdate: Array<Feature> = [];

    next.update?.forEach((updatedFeature) => {
      const pendingAddIdx = pendingAdd.findIndex(
        (item) => this.getFeatureId(item) === this.getFeatureId(updatedFeature),
      );
      const pendingUpdateIdx = pendingUpdate.findIndex(
        (item) => this.getFeatureId(item) === this.getFeatureId(updatedFeature),
      );

      if (pendingAddIdx === -1 && pendingUpdateIdx === -1) {
        nextUpdate.push(updatedFeature);
        return;
      }
      if (pendingAddIdx !== -1) {
        pendingAdd[pendingAddIdx] = updatedFeature;
      }
      if (pendingUpdateIdx !== -1) {
        pendingUpdate[pendingUpdateIdx] = updatedFeature;
      }
    });

    return {
      add: [...pendingAdd, ...(next.add || [])],
      update: [...pendingUpdate, ...nextUpdate],
      remove: [...(pending.remove || []), ...(next.remove || [])],
    };
  }
}
