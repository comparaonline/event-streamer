import { Observable, throwError, timer } from 'rxjs';
import { flatMap, retryWhen } from 'rxjs/operators';

type Timer = (attempt: number) => Observable<number>;
const retryStrategy = (retries: number, timer: Timer) => (obs: Observable<Error>) =>
  obs.pipe(flatMap((error: Error, attempt: number) =>
      attempt < retries ? timer(attempt) : throwError(error)
  ));

export const retry = <T>(retries: number, delay: number, increase: number) => {
  const increasingTimer = (attempt: number) => timer(attempt * (increase - 1) * delay + delay);
  return (obs: Observable<T>) => obs.pipe(retryWhen(retryStrategy(retries, increasingTimer)));
};
