import { expect } from 'chai';
import { spy, stub } from 'sinon';

import { Action } from '../src/action';
import { Router } from '../src/router';
import { InputEvent } from '../src/events';

describe('Router', () => {
  class InEvent extends InputEvent {
    build() { }
  }

  context('without retries', () => {
    class FirstAction extends Action {
      perform(event: InEvent) {
        return Promise.resolve();
      }
    }

    class SecondAction extends Action {
      perform(event: InEvent) {
        return Promise.resolve();
      }
    }

    const router = new Router();
    router.add(InEvent, FirstAction);
    router.add(InEvent, SecondAction);

    it('builds the input event', async () => {
      const buildSpy = spy(InEvent.prototype, 'build');
      await router.handle({ code: 'InEvent' });
      expect(buildSpy).to.have.been.calledOnce;
      buildSpy.restore();
    });

    it('calls perform on multiple actions', async () => {
      const performSpy = spy(FirstAction.prototype, 'perform');
      const performSecondSpy = spy(SecondAction.prototype, 'perform');
      await router.handle({ code: 'InEvent' });
      expect(performSpy).to.have.been.calledOnce;
      expect(performSecondSpy).to.have.been.calledOnce;
      performSpy.restore();
      performSecondSpy.restore();
    });
  });

  context('with retries', () => {
    class RetryAction extends Action {
      static retries = 1;
      static retryDelay = 1;
      perform(event: InEvent) {
        return Promise.reject();
      }
    }

    const router = new Router();
    router.add(InEvent, RetryAction);

    it('retries a rejected action', async () => {
      const performStub = stub(RetryAction.prototype, 'perform')
        .onFirstCall().rejects()
        .onSecondCall().resolves();
      await router.handle({ code: 'InEvent' });
      expect(performStub).to.have.been.calledTwice;
      performStub.restore();
    });

    it('rejects after all failed retries', async () => {
      const performStub = stub(RetryAction.prototype, 'perform')
        .onFirstCall().rejects()
        .onSecondCall().rejects();
      await expect(router.handle({ code: 'InEvent' })).to.eventually.be.rejected;
      performStub.restore();
    });
  });
});
