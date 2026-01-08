/**
 * Utilities for transforming between snake_case (Python backend)
 * and camelCase (TypeScript frontend) naming conventions.
 */

/**
 * Converts a snake_case string to camelCase.
 *
 * @example
 * snakeToCamel('captain_points') // 'captainPoints'
 * snakeToCamel('manager_id') // 'managerId'
 * snakeToCamel('already_camel') // 'already_camel' (no underscores)
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Converts a camelCase string to snake_case.
 *
 * @example
 * camelToSnake('captainPoints') // 'captain_points'
 * camelToSnake('managerId') // 'manager_id'
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Type helper: converts snake_case string literal to camelCase.
 * e.g., SnakeToCamel<'captain_points'> = 'captainPoints'
 */
type SnakeToCamel<S extends string> = S extends `${infer T}_${infer U}`
  ? `${T}${Capitalize<SnakeToCamel<U>>}`
  : S;

/**
 * Type helper: recursively transforms object keys from snake_case to camelCase.
 */
export type CamelCaseKeys<T> = T extends (infer U)[]
  ? CamelCaseKeys<U>[]
  : T extends object
    ? {
        [K in keyof T as K extends string ? SnakeToCamel<K> : K]: CamelCaseKeys<T[K]>;
      }
    : T;

/**
 * Recursively transforms all object keys from snake_case to camelCase.
 * Handles nested objects, arrays, null, and primitives.
 *
 * @example
 * transformKeys({ captain_points: 10, manager_id: 1 })
 * // { captainPoints: 10, managerId: 1 }
 *
 * transformKeys({ details: [{ game_week: 1 }] })
 * // { details: [{ gameWeek: 1 }] }
 */
export function transformKeys<T>(obj: T): CamelCaseKeys<T> {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj as CamelCaseKeys<T>;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item)) as CamelCaseKeys<T>;
  }

  // Handle objects (but not Date, etc.)
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = transformKeys(value);
    }
    return result as CamelCaseKeys<T>;
  }

  // Primitives pass through unchanged
  return obj as CamelCaseKeys<T>;
}

/**
 * Recursively transforms all object keys from camelCase to snake_case.
 * Useful for sending data back to the backend.
 */
export function transformKeysToSnake<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeysToSnake(item)) as T;
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = camelToSnake(key);
      result[snakeKey] = transformKeysToSnake(value);
    }
    return result as T;
  }

  return obj;
}
