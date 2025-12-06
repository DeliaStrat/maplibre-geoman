import { SOURCES } from '@/core/features/constants.ts';
import { FEATURE_ID_PROPERTY, type Geoman } from '@/main.ts';
import type { FeatureSourceName, GeoJSONFeatureDiff, GeoJSONSourceDiffHashed } from '@/types';
import { typedKeys, typedValues } from '@/utils/typing.ts';
import type { Feature } from 'geojson';
import { throttle } from 'lodash-es';

type SourceUpdateMethods = {
  [key in FeatureSourceName]: () => void;
};

const MAX_DIFF_ITEMS = 5000;

export class SourceUpdateManager {
  gm: Geoman;
  updateStorage: { [key in FeatureSourceName]: Array<GeoJSONSourceDiffHashed> };
  autoUpdatesEnabled: boolean = true;
  delayedSourceUpdateMethods: SourceUpdateMethods;

  constructor(gm: Geoman) {
    this.gm = gm;
    this.updateStorage = Object.fromEntries(typedValues(SOURCES).map((name) => [name, []]));

    this.delayedSourceUpdateMethods = Object.fromEntries(
      typedValues(SOURCES).map((sourceName) => [
        sourceName,
        throttle(
          () => this.updateSourceActual(sourceName),
          this.gm.options.settings.throttlingDelay,
        ),
      ]),
    ) as SourceUpdateMethods;
  }

  updatesPending(sourceName: FeatureSourceName): boolean {
    return !!this.updateStorage[sourceName]?.length;
  }

  getFeatureId(feature: Feature) {
    const id = feature.properties?.[FEATURE_ID_PROPERTY] ?? feature.id;
    if (id === null || id === undefined) {
      console.warn('Feature id is null or undefined', feature);
    }
    return id;
  }

  updateSource({
    sourceName,
    diff,
  }: {
    sourceName: FeatureSourceName;
    diff?: GeoJSONSourceDiffHashed;
  }) {
    if (diff) {
      // console.log('updateSource', diff);
      this.updateStorage[sourceName].push(diff);
    }

    this.delayedSourceUpdateMethods[sourceName]();
  }

  updateSourceActual(sourceName: FeatureSourceName) {
    const source = this.gm.features.sources[sourceName];

    if (this.autoUpdatesEnabled && source) {
      if (!source.loaded) {
        setTimeout(() => {
          this.updateSourceActual(sourceName);
        }, this.gm.options.settings.throttlingDelay);
        return;
      }

      const combinedDiff = this.getCombinedDiff(sourceName);
      if (combinedDiff) {
        // applies non empty diff
        source.updateData(combinedDiff).then(/* it's possible to send events here */);
      }

      if (this.updateStorage[sourceName].length > 0) {
        setTimeout(
          () => this.updateSourceActual(sourceName),
          this.gm.options.settings.throttlingDelay,
        );
      }
    }
  }

  withAtomicSourcesUpdate<T>(callback: () => T): T {
    try {
      this.autoUpdatesEnabled = false;
      return callback();
    } finally {
      typedKeys(this.gm.features.sources).forEach((sourceName) => {
        this.updateSource({ sourceName });
      });
      this.autoUpdatesEnabled = true;
    }
  }

  getCombinedDiff(sourceName: FeatureSourceName): GeoJSONSourceDiffHashed | null {
    let combinedDiff: GeoJSONSourceDiffHashed = {};

    for (let i = 0; i < MAX_DIFF_ITEMS; i += 1) {
      if (this.updateStorage[sourceName][i] === undefined) {
        break;
      }
      combinedDiff = this.mergeGeoJsonDiff(combinedDiff, this.updateStorage[sourceName][i]);
    }
    this.updateStorage[sourceName] = this.updateStorage[sourceName].slice(MAX_DIFF_ITEMS);

    if (Object.values(combinedDiff).find((item) => (Array.isArray(item) ? item.length : item))) {
      return combinedDiff;
    }

    return null;
  }

  mergeGeoJsonDiff(
    prev: GeoJSONSourceDiffHashed,
    next: GeoJSONSourceDiffHashed,
  ): GeoJSONSourceDiffHashed {
    // Resolve merge conflicts
    SourceUpdateManager.resolveMergeConflicts(prev, next);

    if (prev.removeAll || next.removeAll) next.removeAll = true;

    if (!next.remove && prev.remove) {
      next.remove = new Set();
    }
    prev.remove?.forEach((value) => {
      next.remove?.add(value);
    });

    if (!next.add && prev.add) {
      next.add = new Map();
    }
    prev.add?.forEach((value, key) => {
      next.add?.set(key, value);
    });

    if (!next.update && prev.update) {
      next.update = new Map();
    }
    prev.update?.forEach((value, key) => {
      next.update?.set(key, value);
    });

    if (next.remove?.size && next.add?.size) {
      for (const id of next.add.keys()) {
        next.remove.delete(id);
      }
    }

    return next;
  }

  /**
   * Resolve merge conflicts between two GeoJSONSourceDiffs considering the ordering above (remove/add/update).
   *
   * - If you `removeAll` and then `add` features in the same diff, the added features will be kept.
   * - Updates only apply to features that exist after removes and adds have been processed.
   */
  private static resolveMergeConflicts(
    prev: GeoJSONSourceDiffHashed,
    next: GeoJSONSourceDiffHashed,
  ) {
    // Removing all features with added or updated features in previous - and clear no-op removes

    if (next.removeAll) {
      prev.add?.clear();
      prev.update?.clear();
      prev.remove?.clear();
      next.remove?.clear();
    }

    // Removing features that were added or updated in previous
    if (next.remove) {
      for (const id of next.remove) {
        prev.add?.delete(id);
        prev.update?.delete(id);
      }
    }

    // Updating features that were updated in previous
    if (next.update) {
      for (const [id, nextUpdate] of next.update) {
        const prevUpdate = prev.update?.get(id);
        if (!prevUpdate) continue;

        next.update?.set(id, SourceUpdateManager.mergeFeatureDiffs(prevUpdate, nextUpdate));
        prev.update?.delete(id);
      }
    }
  }

  /**
   * Merge two feature diffs for the same feature id, considering the order of operations as specified above (remove, add/update).
   */
  private static mergeFeatureDiffs(
    prev: GeoJSONFeatureDiff,
    next: GeoJSONFeatureDiff,
  ): GeoJSONFeatureDiff {
    const merged: GeoJSONFeatureDiff = { id: prev.id };

    // Removing all properties with added or updated properties in previous - and clear no-op removes
    if (next.removeAllProperties) {
      delete prev.removeProperties;
      delete prev.addOrUpdateProperties;
      delete next.removeProperties;
    }
    // Removing properties that were added or updated in previous
    if (next.removeProperties) {
      for (const key of next.removeProperties) {
        const index = prev.addOrUpdateProperties?.findIndex((prop) => prop.key === key) ?? -1;
        if (index > -1) prev.addOrUpdateProperties?.splice(index, 1);
      }
    }

    // Merge the two diffs
    if (prev.removeAllProperties || next.removeAllProperties) {
      merged.removeAllProperties = true;
    }
    if (prev.removeProperties || next.removeProperties) {
      merged.removeProperties = [
        ...(prev.removeProperties || []),
        ...(next.removeProperties || []),
      ];
    }
    if (prev.addOrUpdateProperties || next.addOrUpdateProperties) {
      merged.addOrUpdateProperties = [
        ...(prev.addOrUpdateProperties || []),
        ...(next.addOrUpdateProperties || []),
      ];
    }
    if (prev.newGeometry || next.newGeometry) {
      merged.newGeometry = next.newGeometry || prev.newGeometry;
    }

    return merged;
  }
}
