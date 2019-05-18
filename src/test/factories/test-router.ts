import { Router } from '../../router';
import { TestInputEvent } from './test-input-event';
import { TestAction } from './test-action';
import { TestSlowInputEvent } from './test-slow-input-event';
import { TestSlowAction } from './test-slow-action';

export const testRouter = () => {
  const router = new Router();
  router.add(TestInputEvent, TestAction);
  router.add(TestSlowInputEvent, TestSlowAction);
  return router;
};
