import { Router } from '../../../router';
import { TestInputEvent } from './test-input-event';
import { TestAction } from './test-action';

export const testRouter = new Router();

testRouter.add(TestInputEvent, TestAction);
