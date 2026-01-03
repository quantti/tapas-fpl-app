import { describe, it, expect } from 'vitest';

import { POSITION_TYPES } from 'constants/positions';

import {
  parseNumericString,
  formatDelta,
  getDeltaClass,
  getGoalsDeltaLegend,
  getAssistsDeltaLegend,
  getGoalsConcededDeltaLegend,
  getGoalInvolvementsDeltaLegend,
  getSeasonSummary,
} from './playerStats';

describe('playerStats utilities', () => {
  describe('parseNumericString', () => {
    it('parses valid numeric strings', () => {
      expect(parseNumericString('1.23')).toBe(1.23);
      expect(parseNumericString('0.5')).toBe(0.5);
      expect(parseNumericString('10')).toBe(10);
      expect(parseNumericString('-2.5')).toBe(-2.5);
    });

    it('returns 0 for empty string', () => {
      expect(parseNumericString('')).toBe(0);
    });

    it('returns 0 for null', () => {
      expect(parseNumericString(null)).toBe(0);
    });

    it('returns 0 for undefined', () => {
      expect(parseNumericString()).toBe(0);
    });

    it('returns 0 for invalid strings', () => {
      expect(parseNumericString('abc')).toBe(0);
      expect(parseNumericString('not a number')).toBe(0);
    });

    it('parses strings with leading/trailing whitespace', () => {
      expect(parseNumericString(' 1.5 ')).toBe(1.5);
    });

    it('handles zero string correctly', () => {
      expect(parseNumericString('0')).toBe(0);
      expect(parseNumericString('0.0')).toBe(0);
    });
  });

  describe('formatDelta', () => {
    it('formats positive values with + sign', () => {
      expect(formatDelta(1.5)).toBe('+1.5');
      expect(formatDelta(0.1)).toBe('+0.1');
    });

    it('formats negative values with - sign', () => {
      expect(formatDelta(-2.5)).toBe('-2.5');
      expect(formatDelta(-0.3)).toBe('-0.3');
    });

    it('formats zero as +0.0', () => {
      expect(formatDelta(0)).toBe('+0.0');
    });

    it('uses specified precision', () => {
      expect(formatDelta(1.567, 2)).toBe('+1.57');
      expect(formatDelta(-1.234, 0)).toBe('-1');
    });
  });

  describe('getDeltaClass', () => {
    it('returns positive for values >= 0', () => {
      expect(getDeltaClass(1.5)).toBe('positive');
      expect(getDeltaClass(0)).toBe('positive');
    });

    it('returns negative for values < 0', () => {
      expect(getDeltaClass(-0.1)).toBe('negative');
      expect(getDeltaClass(-5)).toBe('negative');
    });

    it('inverts logic when invertedLogic is true', () => {
      // For goals conceded, lower is better
      expect(getDeltaClass(1.5, true)).toBe('negative');
      expect(getDeltaClass(-1.5, true)).toBe('positive');
      expect(getDeltaClass(0, true)).toBe('positive');
    });
  });

  describe('getGoalsDeltaLegend', () => {
    it('returns overperformance message for positive delta', () => {
      expect(getGoalsDeltaLegend(2.5)).toBe('scored 2.5 more than xG');
    });

    it('returns underperformance message for negative delta', () => {
      expect(getGoalsDeltaLegend(-1.5)).toBe('scored 1.5 fewer than xG');
    });

    it('returns neutral message for zero', () => {
      expect(getGoalsDeltaLegend(0)).toBe('scoring as expected');
    });
  });

  describe('getAssistsDeltaLegend', () => {
    it('returns overperformance message for positive delta', () => {
      expect(getAssistsDeltaLegend(1.0)).toBe('1.0 more assists than xA');
    });

    it('returns underperformance message for negative delta', () => {
      expect(getAssistsDeltaLegend(-2.0)).toBe('2.0 fewer assists than xA');
    });

    it('returns neutral message for zero', () => {
      expect(getAssistsDeltaLegend(0)).toBe('assisting as expected');
    });
  });

  describe('getGoalsConcededDeltaLegend', () => {
    it('returns worse message for positive delta (more conceded)', () => {
      expect(getGoalsConcededDeltaLegend(3.0)).toBe('conceded 3.0 more than expected');
    });

    it('returns better message for negative delta (fewer conceded)', () => {
      expect(getGoalsConcededDeltaLegend(-2.0)).toBe('conceded 2.0 fewer than expected');
    });

    it('returns neutral message for zero', () => {
      expect(getGoalsConcededDeltaLegend(0)).toBe('conceding as expected');
    });
  });

  describe('getGoalInvolvementsDeltaLegend', () => {
    it('returns overperformance message for positive delta', () => {
      expect(getGoalInvolvementsDeltaLegend(1.5)).toBe('1.5 more G+A than expected');
    });

    it('returns underperformance message for negative delta', () => {
      expect(getGoalInvolvementsDeltaLegend(-0.5)).toBe('0.5 fewer G+A than expected');
    });

    it('returns neutral message for zero', () => {
      expect(getGoalInvolvementsDeltaLegend(0)).toBe('G+A as expected');
    });
  });

  describe('getSeasonSummary', () => {
    const mockStats = {
      goals_scored: 20,
      assists: 5,
      clean_sheets: 10,
    };

    it('returns clean sheets for goalkeeper', () => {
      expect(getSeasonSummary(POSITION_TYPES.GOALKEEPER, mockStats)).toBe('10 CS');
    });

    it('returns clean sheets and G+A for defender', () => {
      expect(getSeasonSummary(POSITION_TYPES.DEFENDER, mockStats)).toBe('10 CS · 25 G+A');
    });

    it('returns goals and assists for midfielder', () => {
      expect(getSeasonSummary(POSITION_TYPES.MIDFIELDER, mockStats)).toBe('20G 5A');
    });

    it('returns goals and assists for forward', () => {
      expect(getSeasonSummary(POSITION_TYPES.FORWARD, mockStats)).toBe('20G 5A');
    });

    it('handles zero values correctly', () => {
      const zeroStats = { goals_scored: 0, assists: 0, clean_sheets: 0 };
      expect(getSeasonSummary(POSITION_TYPES.GOALKEEPER, zeroStats)).toBe('0 CS');
      expect(getSeasonSummary(POSITION_TYPES.DEFENDER, zeroStats)).toBe('0 CS · 0 G+A');
      expect(getSeasonSummary(POSITION_TYPES.FORWARD, zeroStats)).toBe('0G 0A');
    });
  });
});
