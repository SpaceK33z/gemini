'use strict';

const Promise = require('bluebird');
const Browser = require('lib/browser');
const BasicPool = require('lib/browser-pool/basic-pool');
const browserWithId = require('test/util').browserWithId;

describe('UnlimitedPool', function() {
    const sandbox = sinon.sandbox.create();
    const browserConfig = {id: 'id'};

    let config;
    let browser;
    let pool;
    let requestBrowser;

    beforeEach(() => {
        config = {
            forBrowser: sinon.stub().returns(browserConfig)
        };
        browser = sandbox.stub(browserWithId('id'));
        browser.launch.returns(Promise.resolve());
        browser.quit.returns(Promise.resolve());

        sandbox.stub(Browser, 'create').returns(browser);
        pool = new BasicPool(config);
        requestBrowser = () => pool.getBrowser('id');
    });

    afterEach(() => sandbox.restore());

    it('should create new browser when requested', () => {
        return requestBrowser()
            .then(() => assert.calledWith(Browser.create, browserConfig));
    });

    it('should launch a browser', () => {
        return requestBrowser()
            .then(() => assert.calledOnce(browser.launch));
    });

    it('should finalize browser if failed to create it', () => {
        const freeBrowser = sinon.spy(pool, 'freeBrowser');
        const assertCalled = () => assert.called(freeBrowser);

        browser.reset.returns(Promise.reject());

        return requestBrowser()
            .then(assertCalled, assertCalled);
    });

    it('should quit a browser when freed', () => {
        return requestBrowser()
            .then((browser) => pool.freeBrowser(browser))
            .then(() => assert.calledOnce(browser.quit));
    });

    describe('cancel', () => {
        it('should cancel active sessions', () => {
            return Promise.all([requestBrowser(), requestBrowser()])
                .spread((firstBrowser, secondBrowser) => {
                    return pool.cancel()
                        .then(() => {
                            assert.calledOnce(firstBrowser.quit);
                            assert.calledOnce(secondBrowser.quit);
                        });
                });
        });

        it('should handle cases when browser to cancel was not launched yet', () => {
            const spy = sinon.spy().named('launch');
            browser.launch.returns(Promise.delay(100).then(spy));

            const requestPromise = requestBrowser();

            return pool.cancel()
                .then(() => requestPromise)
                .then((browser) => assert.callOrder(spy, browser.quit));
        });

        it('should not fail if canceling of some browser fails', () => {
            browser.quit.returns(Promise.reject());

            return assert.isFulfilled(requestBrowser().then(() => pool.cancel()));
        });
    });
});
