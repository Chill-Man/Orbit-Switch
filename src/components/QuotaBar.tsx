import type { CSSProperties } from 'react';
import { AlertTriangle, Clock3, Radio } from 'lucide-react';
import { formatCountdown, formatRelativeUpdated, formatResetAt, isStale } from '../lib/time';
import { quotaSummary, quotaTone, sourceLabel } from '../lib/quota';
import type { ProgressStyle, Quota } from '../types';
import { WaterProgressLayers } from './WaterProgressLayers';

interface QuotaBarProps {
  quota: Quota;
  now: number;
  progressStyle: ProgressStyle;
  dense?: boolean;
}

type QuotaProgressProperties = CSSProperties & {
  '--quota-progress-position': string;
  '--quota-progress-scale': number;
};

export function QuotaBar({ quota, now, progressStyle, dense = false }: QuotaBarProps) {
  const tone = quotaTone(quota.remainingPercent);
  const stale = isStale(quota.updatedAt, now);
  const progress = Math.min(100, Math.max(0, quota.remainingPercent));
  const progressProperties: QuotaProgressProperties = {
    '--quota-progress-position': `${progress}%`,
    '--quota-progress-scale': progress / 100,
  };
  return (
    <div className={`quota-row quota-row--${tone} quota-row--progress-${progressStyle} ${dense ? 'quota-row--dense' : ''}`}>
      <div className="quota-row__topline">
        <div className="quota-row__name">
          {tone !== 'healthy' && <AlertTriangle size={15} aria-hidden="true" />}
          <span>{quota.name}</span>
        </div>
        <strong>{quotaSummary(quota)}</strong>
      </div>
      <div
        className={`quota-progress quota-progress--${progressStyle}`}
        style={progressProperties}
        role="progressbar"
        aria-label={`${quota.name}: ${quotaSummary(quota)}`}
        aria-valuenow={quota.remainingPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="quota-progress__fill">
          {progressStyle === 'gradient' && <WaterProgressLayers />}
        </span>
        <i
          key={progressStyle === 'segmented' ? `slider-${progress}` : progressStyle}
          className="quota-progress__marker"
          aria-hidden="true"
        />
      </div>
      <div className="quota-row__meta">
        <span>
          <Clock3 size={13} aria-hidden="true" />
          {quota.resetAt ? `До сброса: ${formatCountdown(quota.resetAt, now)}` : 'Сброс не указан'}
        </span>
        {quota.resetAt && <span>Сброс: {formatResetAt(quota.resetAt)}</span>}
        {!dense && (
          <span className={stale ? 'is-stale' : ''}>
            <Radio size={13} aria-hidden="true" />
            {sourceLabel(quota.source)} · {formatRelativeUpdated(quota.updatedAt, now)}{stale ? ' · устарело' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
