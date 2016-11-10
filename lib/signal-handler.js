'use strict';

const QEmitter = require('qemitter');
const SignalEvents = require('./constants/signal-events');
const SignalHandlerEvents = require('./constants/signal-handler-events');
const logger = require('./utils').logger;

module.exports = class SignalHandler extends QEmitter {
    static create() {
        return new SignalHandler();
    }

    start() {
        process.on(SignalEvents.SIGHUP, () => this._handleSignal(1));
        process.on(SignalEvents.SIGINT, () => this._handleSignal(2));
        process.on(SignalEvents.SIGTERM, () => this._handleSignal(15));

        return this;
    }

    _handleSignal(signalNum) {
        if (this._exitCode) {
            logger.warn('Force exit.');
            process.exit(this._exitCode);
        }

        this._exitCode = 128 + signalNum;

        logger.warn('Exiting...');
        return this.emitAndWait(SignalHandlerEvents.EXIT);
    }

    end() {
        if (this._exitCode) {
            process.exit(this._exitCode);
        }
    }
};
