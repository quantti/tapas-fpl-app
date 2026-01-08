import { TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';

import { useLeaguePositions } from 'services/queries/useLeaguePositions';

import * as styles from './LeaguePosition.module.css';

const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

interface Props {
  leagueId: number;
}

const AXIS_STYLE = {
  tick: { fontSize: 11, fill: 'var(--color-text-muted)' },
  axisLine: { stroke: 'var(--color-border)' },
  tickLine: { stroke: 'var(--color-border)' },
};

export function LeaguePosition({ leagueId }: Props) {
  const isMobile = useIsMobile();

  const { positions, managers, isLoading, error, isBackendUnavailable } =
    useLeaguePositions(leagueId);

  // Don't render if no data or backend unavailable (silent fail)
  if (managers.length === 0 || isBackendUnavailable) return null;

  const managerCount = managers.length;

  return (
    <Card className={styles.card}>
      <CardHeader icon={<TrendingUp size={16} color="#6366f1" />}>
        League Position History
      </CardHeader>
      {isLoading && <p className={styles.loading}>Loading history...</p>}
      {!isLoading && error && <p className={styles.error}>{error}</p>}
      {!isLoading && !error && positions.length > 0 && (
        <div className={styles.chartContainer}>
          <div
            className={styles.chartInner}
            style={{ minWidth: Math.max(600, positions.length * 25) }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={positions} margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
                <XAxis dataKey="gameweek" tickFormatter={(gw) => `GW${gw}`} {...AXIS_STYLE} />
                <YAxis
                  reversed
                  domain={[1, managerCount]}
                  ticks={Array.from({ length: managerCount }, (_, i) => i + 1)}
                  width={30}
                  {...AXIS_STYLE}
                />
                {/* Hide tooltip on mobile - too large, use legend instead */}
                {!isMobile && (
                  <Tooltip
                    content={(props) => {
                      const { active, payload, label } = props;
                      if (!active || !payload?.length) return null;
                      const sorted = [...payload].sort((a, b) => Number(a.value) - Number(b.value));
                      return (
                        <div className={styles.tooltip}>
                          <div className={styles.tooltipTitle}>Gameweek {label}</div>
                          {sorted.map((entry) => {
                            const manager = managers.find((m) => String(m.id) === entry.dataKey);
                            return (
                              <div
                                key={entry.dataKey}
                                className={styles.tooltipRow}
                                style={{ color: entry.color }}
                              >
                                <span className={styles.tooltipPosition}>{entry.value}.</span>
                                <span>{manager?.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                )}
                {managers.map((manager) => (
                  <Line
                    key={manager.id}
                    type="monotone"
                    dataKey={String(manager.id)}
                    stroke={manager.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: manager.color }}
                    activeDot={{ r: 5 }}
                    name={manager.name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {/* Legend below chart */}
            <div className={styles.legend}>
              {managers.map((manager) => (
                <div key={manager.id} className={styles.legendItem}>
                  <span className={styles.legendColor} style={{ backgroundColor: manager.color }} />
                  <span className={styles.legendName}>{manager.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
