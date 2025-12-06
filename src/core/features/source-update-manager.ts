import { SOURCES } from '@/core/features/constants.ts';
import { FEATURE_ID_PROPERTY, type Geoman } from '@/main.ts';
import type { FeatureSourceName, GeoJSONFeatureDiff, GeoJSONSourceDiffHashed } from '@/types';
import { typedKeys, typedValues } from '@/utils/typing.ts';
import type { Feature } from 'geojson';
import { throttle } from 'lodash-es';
import type { GeoJSONSourceDiff } from 'maplibre-gl';

type SourceUpdateMethods = {
  [key in FeatureSourceName]: () => void;
};

const MAX_DIFF_ITEMS = 5000;

export class SourceUpdateManager {
  gm: Geoman;
  updateStorage: { [key in FeatureSourceName]: Array<GeoJSONSourceDiff> };
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

  updateSource({ sourceName, diff }: { sourceName: FeatureSourceName; diff?: GeoJSONSourceDiff }) {
    if (diff) {
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

  getCombinedDiff(sourceName: FeatureSourceName): GeoJSONSourceDiff | null {
    let combinedDiff: GeoJSONSourceDiff = {
      remove: [],
      add: [],
      update: [],
    };

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
    pendingDiffOrNull: GeoJSONSourceDiff | null,
    nextDiffOrNull: GeoJSONSourceDiff | null,
  ): GeoJSONSourceDiff {
    if (!pendingDiffOrNull) return nextDiffOrNull || {};
    if (!nextDiffOrNull) return pendingDiffOrNull || {};

    // Hash for o(1) lookups while creating a mutatable copy of the collections
    const prev = SourceUpdateManager.diffToHashed(pendingDiffOrNull);
    const next = SourceUpdateManager.diffToHashed(nextDiffOrNull);

    // Resolve merge conflicts
    SourceUpdateManager.resolveMergeConflicts(prev, next);

    // Simply merge the two diffs now that conflicts have been resolved
    const merged: GeoJSONSourceDiffHashed = {};
    if (prev.removeAll || next.removeAll) merged.removeAll = true;
    merged.remove = new Set([...(prev.remove ?? []), ...(next.remove ?? [])]);
    merged.add = new Map([...(prev.add ?? []), ...(next.add ?? [])]);
    merged.update = new Map([...(prev.update ?? []), ...(next.update ?? [])]);

    // Squash the merge - removing then adding the same feature
    if (merged.remove.size && merged.add.size) {
      for (const id of merged.add.keys()) {
        merged.remove.delete(id);
      }
    }

    // Convert back to array-based representation
    const mergedDiff = SourceUpdateManager.hashedToDiff(merged);

    return mergedDiff;
  }

  /**
   * @internal
   * Convert a GeoJSONSourceDiff to an idempotent hashed representation using Sets and Maps
   */
  private static diffToHashed(diff: GeoJSONSourceDiff | null): GeoJSONSourceDiffHashed {
    if (!diff) return {};

    const hashed: GeoJSONSourceDiffHashed = {};

    hashed.removeAll = diff.removeAll;
    hashed.remove = new Set(diff.remove || []);
    hashed.add = new Map(diff.add?.map((feature) => [feature.id!, feature]));
    hashed.update = new Map(diff.update?.map((update) => [update.id, update]));

    return hashed;
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

    // According to diffToHashed we know add, update and remove are defined
    if (next.removeAll) {
      prev.add!.clear();
      prev.update!.clear();
      prev.remove!.clear();
      next.remove!.clear();
    }

    // Removing features that were added or updated in previous
    for (const id of next.remove!) {
      prev.add!.delete(id);
      prev.update!.delete(id);
    }

    // Updating features that were updated in previous
    for (const [id, nextUpdate] of next.update!) {
      const prevUpdate = prev.update!.get(id);
      if (!prevUpdate) continue;

      next.update!.set(id, SourceUpdateManager.mergeFeatureDiffs(prevUpdate, nextUpdate));
      prev.update!.delete(id);
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

  /**
   * @internal
   * Convert a hashed GeoJSONSourceDiff back to the array-based representation
   */
  private static hashedToDiff(hashed: GeoJSONSourceDiffHashed): GeoJSONSourceDiff {
    const diff: GeoJSONSourceDiff = {};

    if (hashed.removeAll) {
      diff.removeAll = hashed.removeAll;
    }
    if (hashed.remove) {
      diff.remove = Array.from(hashed.remove);
    }
    if (hashed.add) {
      diff.add = Array.from(hashed.add.values());
    }
    if (hashed.update) {
      diff.update = Array.from(hashed.update.values());
    }

    return diff;
  }
}
