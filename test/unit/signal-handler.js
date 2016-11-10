'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const SignalEvents = require('lib/constants/signal-events');
const SignalHandlerEvents = require('lib/constants/signal-handler-events');
const SignalHandler = require('lib/signal-handler');
const logger = require('lib/utils').logger;

describe('SignalHandler', () => {
    const sandbox = sinon.sandbox.create();

    const signalEvents = () => {
        return _.zipObject([SignalEvents.SIGHUP, SignalEvents.SIGINT, SignalEvents.SIGTERM], [1, 2, 15]);
    };

    beforeEach(() => {
        sandbox.stub(logger, 'warn');

        sandbox.stub(process, 'exit');
    });

    afterEach(() => {
        sandbox.restore();

        process.removeAllListeners();
    });

    describe('start', () => {
        it('should be chainable', () => {
            const signalHandler = SignalHandler.create();

            assert.instanceOf(signalHandler.start(), SignalHandler);
        });

        _.forEach(signalEvents(), (code, event) => {
            describe(`on ${event}`, () => {
                it('should emit "EXIT" event', () => {
                    const signalHandler = SignalHandler.create();
                    const onExit = sinon.spy().named('onExit');

                    signalHandler.start().on(SignalHandlerEvents.EXIT, onExit);
                    process.emit(`${event}`);

                    assert.calledOnce(onExit);
                });

                it('should wait until all "EXIT" handlers have finished', () => {
                    const signalHandler = SignalHandler.create();
                    const onExit = sinon.spy().named('onExit');
                    const onExitWithDelay = () => Promise.delay(50).then(onExit);

                    signalHandler.start().on(SignalHandlerEvents.EXIT, onExitWithDelay);

                    process.emitAndWait = SignalHandler.prototype.emitAndWait;

                    return process.emitAndWait(`${event}`).then(() => assert.called(onExit));
                });

                it(`should provide force exit on double "${event}"`, () => {
                    const signalHandler = SignalHandler.create();

                    signalHandler.start();

                    process.emit(`${event}`);
                    process.emit(`${event}`);

                    assert.calledWith(process.exit, 128 + code);
                });
            });
        });
    });

    describe('end', () => {
        it('should not exit if none of signal events were emitted', () => {
            SignalHandler.create().start();

            assert.notCalled(process.exit);
        });

        _.forEach(signalEvents(), (code, event) => {
            it(`should exit if "${event}" was emitted`, () => {
                const signalHandler = SignalHandler.create().start();

                process.emit(event);

                signalHandler.end();

                assert.calledWith(process.exit, 128 + code);
            });
        });
    });
});
