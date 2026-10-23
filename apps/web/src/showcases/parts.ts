import type { ComponentType } from 'react';
import type { ProjectId } from '@yoyo/protocol';
import type { ShowcaseProps } from './lib/clock';
import './base.css';
import { PromptRacers } from './parts/prompt-racers/PromptRacers';
import { Unfiltered, unfilteredMeta } from './parts/unfiltered/Unfiltered';
import { YoyoLoop, yoyoLoopMeta } from './parts/yoyo-loop/YoyoLoop';
import { RuniConnector, runiConnectorMeta } from './parts/runi-connector/RuniConnector';
import { AvailabilityMonitor, availabilityMonitorMeta } from './parts/availability-monitor/AvailabilityMonitor';
import { PnlBot, pnlBotMeta } from './parts/pnl-bot/PnlBot';
import { Polybot, polybotMeta } from './parts/polybot/Polybot';

export type { ProjectId } from '@yoyo/protocol';
export type { ShowcaseProps } from './lib/clock';
export { ShowcaseFrame, type ShowcaseFrameProps } from './ShowcaseFrame';
export { configureShowcases } from './config';

/** One live motion piece per carded project, in SPEC §3.5 order. */
export const showcases: Record<ProjectId, ComponentType<ShowcaseProps>> = {
  'prompt-racers': PromptRacers,
  unfiltered: Unfiltered,
  'yoyo-loop': YoyoLoop,
  'runi-connector': RuniConnector,
  'availability-monitor': AvailabilityMonitor,
  'pnl-bot': PnlBot,
  polybot: Polybot,
};

/** Loop length and the reduced-motion key frame (seconds) of each piece. Prompt Racers is the footage length. */
export const showcaseTiming: Record<ProjectId, { duration: number; keyTime: number }> = {
  'prompt-racers': { duration: 11.5, keyTime: 2.5 },
  unfiltered: unfilteredMeta,
  'yoyo-loop': yoyoLoopMeta,
  'runi-connector': runiConnectorMeta,
  'availability-monitor': availabilityMonitorMeta,
  'pnl-bot': pnlBotMeta,
  polybot: polybotMeta,
};

export const showcaseOrder: ProjectId[] = ['prompt-racers', 'unfiltered', 'yoyo-loop', 'runi-connector', 'availability-monitor', 'pnl-bot', 'polybot'];
