import { describe, it, expect } from 'vitest';

import { snakeToCamel, camelToSnake, transformKeys, transformKeysToSnake } from './caseTransform';

describe('snakeToCamel', () => {
  it('converts simple snake_case to camelCase', () => {
    expect(snakeToCamel('captain_points')).toBe('captainPoints');
    expect(snakeToCamel('manager_id')).toBe('managerId');
    expect(snakeToCamel('game_week')).toBe('gameWeek');
  });

  it('converts multiple underscores', () => {
    expect(snakeToCamel('total_points_on_bench')).toBe('totalPointsOnBench');
    expect(snakeToCamel('is_captain_pick')).toBe('isCaptainPick');
  });

  it('leaves strings without underscores unchanged', () => {
    expect(snakeToCamel('points')).toBe('points');
    expect(snakeToCamel('id')).toBe('id');
    expect(snakeToCamel('alreadyCamel')).toBe('alreadyCamel');
  });

  it('handles empty string', () => {
    expect(snakeToCamel('')).toBe('');
  });

  it('handles trailing underscores unchanged', () => {
    expect(snakeToCamel('value_')).toBe('value_');
  });

  it('converts leading underscore followed by letter (Python private convention)', () => {
    // Note: _private becomes Private because _p matches the pattern
    // This is fine for our use case since backend API doesn't use this convention
    expect(snakeToCamel('_private')).toBe('Private');
  });

  it('handles consecutive underscores', () => {
    expect(snakeToCamel('some__value')).toBe('some_Value');
  });
});

describe('camelToSnake', () => {
  it('converts simple camelCase to snake_case', () => {
    expect(camelToSnake('captainPoints')).toBe('captain_points');
    expect(camelToSnake('managerId')).toBe('manager_id');
    expect(camelToSnake('gameWeek')).toBe('game_week');
  });

  it('converts multiple uppercase letters', () => {
    expect(camelToSnake('totalPointsOnBench')).toBe('total_points_on_bench');
    expect(camelToSnake('isCaptainPick')).toBe('is_captain_pick');
  });

  it('leaves strings without uppercase unchanged', () => {
    expect(camelToSnake('points')).toBe('points');
    expect(camelToSnake('id')).toBe('id');
  });

  it('handles empty string', () => {
    expect(camelToSnake('')).toBe('');
  });

  it('handles leading uppercase (PascalCase)', () => {
    expect(camelToSnake('ManagerId')).toBe('_manager_id');
  });
});

describe('transformKeys', () => {
  describe('simple objects', () => {
    it('transforms flat object keys', () => {
      const input = {
        captain_points: 10,
        manager_id: 1,
        game_week: 5,
      };

      const result = transformKeys(input);

      expect(result).toEqual({
        captainPoints: 10,
        managerId: 1,
        gameWeek: 5,
      });
    });

    it('preserves values unchanged', () => {
      const input = {
        string_value: 'hello',
        number_value: 42,
        boolean_value: true,
        null_value: null,
      };

      const result = transformKeys(input);

      expect(result).toEqual({
        stringValue: 'hello',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
      });
    });
  });

  describe('nested objects', () => {
    it('transforms nested object keys', () => {
      const input = {
        outer_key: {
          inner_key: 'value',
          another_inner: {
            deep_key: 123,
          },
        },
      };

      const result = transformKeys(input);

      expect(result).toEqual({
        outerKey: {
          innerKey: 'value',
          anotherInner: {
            deepKey: 123,
          },
        },
      });
    });
  });

  describe('arrays', () => {
    it('transforms array of objects', () => {
      const input = [
        { manager_id: 1, team_name: 'Team A' },
        { manager_id: 2, team_name: 'Team B' },
      ];

      const result = transformKeys(input);

      expect(result).toEqual([
        { managerId: 1, teamName: 'Team A' },
        { managerId: 2, teamName: 'Team B' },
      ]);
    });

    it('transforms nested arrays', () => {
      const input = {
        managers: [
          {
            manager_id: 1,
            picks: [{ player_id: 100, is_captain: true }],
          },
        ],
      };

      const result = transformKeys(input);

      expect(result).toEqual({
        managers: [
          {
            managerId: 1,
            picks: [{ playerId: 100, isCaptain: true }],
          },
        ],
      });
    });

    it('handles array of primitives', () => {
      const input = { values: [1, 2, 3] };
      const result = transformKeys(input);
      expect(result).toEqual({ values: [1, 2, 3] });
    });
  });

  describe('edge cases', () => {
    it('handles null', () => {
      expect(transformKeys(null)).toBe(null);
    });

    it('handles undefined', () => {
      expect(transformKeys()).toBeUndefined();
    });

    it('handles empty object', () => {
      expect(transformKeys({})).toEqual({});
    });

    it('handles empty array', () => {
      expect(transformKeys([])).toEqual([]);
    });

    it('handles primitives', () => {
      expect(transformKeys(42)).toBe(42);
      expect(transformKeys('string')).toBe('string');
      expect(transformKeys(true)).toBe(true);
    });

    it('does not transform Date objects', () => {
      const date = new Date('2024-01-01');
      const input = { created_at: date };
      const result = transformKeys(input);
      expect(result.createdAt).toBe(date);
    });
  });

  describe('real-world backend response', () => {
    it('transforms CaptainDifferentialDetail from backend', () => {
      const backendResponse = {
        gameweek: 5,
        captain_id: 427,
        captain_name: 'Salah',
        captain_points: 12,
        template_id: 351,
        template_name: 'Haaland',
        template_points: 8,
        gain: 8,
        multiplier: 2,
      };

      const result = transformKeys(backendResponse);

      expect(result).toEqual({
        gameweek: 5,
        captainId: 427,
        captainName: 'Salah',
        captainPoints: 12,
        templateId: 351,
        templateName: 'Haaland',
        templatePoints: 8,
        gain: 8,
        multiplier: 2,
      });
    });

    it('transforms CaptainDifferentialStat with nested details', () => {
      const backendResponse = {
        manager_id: 123,
        name: 'Test Manager',
        differential_picks: 3,
        gain: 15,
        details: [
          {
            gameweek: 1,
            captain_id: 427,
            captain_name: 'Salah',
            captain_points: 10,
            template_id: 351,
            template_name: 'Haaland',
            template_points: 6,
            gain: 8,
            multiplier: 2,
          },
        ],
      };

      const result = transformKeys(backendResponse);

      expect(result).toEqual({
        managerId: 123,
        name: 'Test Manager',
        differentialPicks: 3,
        gain: 15,
        details: [
          {
            gameweek: 1,
            captainId: 427,
            captainName: 'Salah',
            captainPoints: 10,
            templateId: 351,
            templateName: 'Haaland',
            templatePoints: 6,
            gain: 8,
            multiplier: 2,
          },
        ],
      });
    });
  });
});

describe('transformKeysToSnake', () => {
  it('transforms camelCase keys to snake_case', () => {
    const input = {
      captainPoints: 10,
      managerId: 1,
      gameWeek: 5,
    };

    const result = transformKeysToSnake(input);

    expect(result).toEqual({
      captain_points: 10,
      manager_id: 1,
      game_week: 5,
    });
  });

  it('transforms nested objects', () => {
    const input = {
      outerKey: {
        innerKey: 'value',
      },
    };

    const result = transformKeysToSnake(input);

    expect(result).toEqual({
      outer_key: {
        inner_key: 'value',
      },
    });
  });

  it('transforms arrays of objects', () => {
    const input = [{ managerId: 1 }, { managerId: 2 }];

    const result = transformKeysToSnake(input);

    expect(result).toEqual([{ manager_id: 1 }, { manager_id: 2 }]);
  });
});

describe('roundtrip conversion', () => {
  it('snake -> camel -> snake preserves structure', () => {
    const original = {
      manager_id: 1,
      team_name: 'Test',
      nested: {
        inner_value: 42,
      },
    };

    const camel = transformKeys(original);
    const backToSnake = transformKeysToSnake(camel);

    expect(backToSnake).toEqual(original);
  });
});
