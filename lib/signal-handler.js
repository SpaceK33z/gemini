'use strict';

const QEmitter = require('qemitter');
const SignalEvents = require('./constants/signal-events');
const logger = require('./utils').logger;

module.exports = class SignalHandler extends QEmitter {
    static create() {
        return new SignalHandler();
    }

    start() {
        process.on('SIGHUP', () => this._handleSignal(1));
        process.on('SIGINT', () => this._handleSignal(2));
        process.on('SIGTERM', () => this._handleSignal(15));
    }

    _handleSignal(signalNum) {
        if (this._exitCode) {
            logger.warn('Force exit.');
            process.exit(this._exitCode);
        }

        this._exitCode = 128 + signalNum;

        logger.warn('Exiting...');
        return this.emitAndWait(SignalEvents.EXIT);
    }

    end() {
        if (this._exitCode) {
            process.exit(this._exitCode);
        }
    }
};
