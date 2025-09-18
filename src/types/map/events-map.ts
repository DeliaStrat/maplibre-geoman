import { GM_PREFIX, type GM_SYSTEM_PREFIX } from '@/core/constants.ts';
import type {
  AnyEvent,
  FeatureCreatedFwdEvent,
  FeatureEditEndFwdEvent,
  FeatureEditStartFwdEvent,
  FeatureRemovedFwdEvent,
  FeatureUpdatedFwdEvent,
  FwdEditModeName,
  GlobalDrawEnabledDisabledFwdEvent,
  GlobalDrawToggledFwdEvent,
  GlobalEditToggledFwdEvent,
  GlobalHelperToggledFwdEvent,
  GmControlEvent,
  GmControlLoadEvent,
  GmDrawEvent,
  GmEditEvent,
  GmHelperEvent,
  GmLoadedFwdEvent,
  HelperModeName,
} from '@/types';

type EventsMap = Record<`${typeof GM_SYSTEM_PREFIX}:draw`, GmDrawEvent> &
  Record<`${typeof GM_SYSTEM_PREFIX}:edit`, GmEditEvent> &
  Record<`${typeof GM_SYSTEM_PREFIX}:helper`, GmHelperEvent> &
  Record<`${typeof GM_SYSTEM_PREFIX}:control`, GmControlEvent> &
  // forwarded events
  Record<`${typeof GM_PREFIX}:globaldrawmodetoggled`, GlobalDrawToggledFwdEvent> &
  Record<`${typeof GM_PREFIX}:drawstart`, GlobalDrawEnabledDisabledFwdEvent> &
  Record<`${typeof GM_PREFIX}:drawend`, GlobalDrawEnabledDisabledFwdEvent> &
  Record<`${typeof GM_PREFIX}:global${FwdEditModeName}modetoggled`, GlobalEditToggledFwdEvent> &
  Record<`${typeof GM_PREFIX}:global${HelperModeName}modetoggled`, GlobalHelperToggledFwdEvent> &
  Record<`${typeof GM_PREFIX}:create`, FeatureCreatedFwdEvent> &
  Record<`${typeof GM_PREFIX}:remove`, FeatureRemovedFwdEvent> &
  Record<`${typeof GM_PREFIX}:${FwdEditModeName}`, FeatureUpdatedFwdEvent> &
  Record<`${typeof GM_PREFIX}:${FwdEditModeName}start`, FeatureEditStartFwdEvent> &
  Record<`${typeof GM_PREFIX}:${FwdEditModeName}end`, FeatureEditEndFwdEvent> &
  Record<`${typeof GM_PREFIX}:${GmControlLoadEvent['action']}`, GmLoadedFwdEvent>;

export type EventFor<T extends string> = T extends keyof EventsMap ? EventsMap[T] : AnyEvent;
