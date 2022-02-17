import { wat } from './-some-internal-thing';

export { wat }

export function bar() {
  return wat();
}
