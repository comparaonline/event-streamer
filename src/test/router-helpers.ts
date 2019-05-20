import { testRouter } from './factories/test-router';
import { RouteStrategy } from '../router';
import { from } from 'rxjs';
import { EventMessage } from '../kafka/interfaces/event-message';

export const testRouting = async (messages: EventMessage[], strategy?: RouteStrategy) => {
  const router = testRouter();
  if (strategy) router.strategy = strategy;
  await router.route(v => v)(from(messages)).toPromise();
};
