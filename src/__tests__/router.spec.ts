import { Action } from '../action';
import { Router } from '../router';
import { InputEvent } from '../events';

class MyEvent extends InputEvent {
  build() {}
}

class MyAction extends Action {
  perform(event: MyEvent) {
    return Promise.resolve();
  }
}

describe('Router', () => {
  const router = new Router();

  describe('#route', () => {
    router.add(MyEvent, MyAction);

    it('builds the input event', async () => {
      const spy = spyOn(MyEvent.prototype, 'build');
      await router.handle({ code: 'MyEvent' });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('calls perform on the action', async () => {
      const spy = spyOn(MyAction.prototype, 'perform');
      await router.handle({ code: 'MyEvent' });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('calls perform on multiple actions', async () => {
      class MySecondAction extends Action {
        perform(event: MyEvent) {
          return Promise.resolve();
        }
      }
      router.add(MyEvent, MySecondAction);
      const spyMyAction = spyOn(MyAction.prototype, 'perform');
      const spyMySecondAction = spyOn(MySecondAction.prototype, 'perform');

      await router.handle({ code: 'MyEvent' });

      expect(spyMyAction).toHaveBeenCalledTimes(1);
      expect(spyMySecondAction).toHaveBeenCalledTimes(1);
    });
  });
});
