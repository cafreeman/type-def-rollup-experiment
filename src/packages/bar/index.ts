import { wat } from './-some-internal-thing';

export { wat }

/**
 * A function that calls a function that says wat.
 *
 * @returns 'wat'
 */
export function bar() {
  return wat();
}
