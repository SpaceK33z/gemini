'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const promiseUtils = require('q-promise-utils');

const pool = require('../browser-pool');
const BrowserRunner = require('./browser-runner');
const Events = require('../constants/events');
const SignalHandlerEvents = require('../constants/signal-handler-events');
const Coverage = require('../coverage');
const Runner = require('./runner');
const SignalHandler = require('../signal-handler');
const SuiteMonitor = require('../suite-monitor');

module.exports = class TestsRunner extends Runner {
    static create(config, stateProcessor) {
        return new TestsRunner(config, stateProcessor);
    }

    constructor(config, stateProcessor) {
        super();

        this.config = config;
        this.coverage = this.config.isCoverageEnabled() && Coverage.create(config);

        this._stateProcessor = stateProcessor;

        this._browserPool = pool.create(this.config);

        this._suiteMonitor = SuiteMonitor.create(this);
        this.passthroughEvent(this._suiteMonitor, Events.END_SUITE);

        this._browserRunners = [];
    }

    setTestBrowsers(browsers) {
        this._testBrowsers = browsers;
    }

    run(suiteCollection) {
        const signalHandler = SignalHandler.create();

        return Promise.resolve(this.emitAndWait(Events.START_RUNNER, this))
            .then(() => this.emit(Events.BEGIN, this._formatBeginEventData(suiteCollection)))
            .then(() => this._stateProcessor.prepare(this))
            .then(() => signalHandler.start().on(SignalHandlerEvents.EXIT, () => this.cancel()))
            .then(() => this._runTests(suiteCollection))
            .then(() => this.coverage && this.coverage.processStats())
            .finally(() => {
                this.emit(Events.END);
                return this.emitAndWait(Events.END_RUNNER, this).then(() => signalHandler.end());
            });
    }

    _formatBeginEventData(suiteCollection) {
        return {
            config: this.config,
            totalStates: _.sumBy(suiteCollection.allSuites(), (suite) => suite.states.length),
            browserIds: this.config.getBrowserIds()
        };
    }

    _runTests(suiteCollection) {
        this.emit(Events.BEGIN_SESSION);

        return _(this._getBrowsersToRun())
            .map((browserId) => this._runTestsInBrowser(suiteCollection, browserId))
            .thru(promiseUtils.waitForResults)
            .value()
            .finally(() => this.emit(Events.END_SESSION));
    }

    _getBrowsersToRun() {
        const allBrowsers = this.config.getBrowserIds();
        const testBrowsers = this._testBrowsers;

        return testBrowsers ? _.intersection(testBrowsers, allBrowsers) : allBrowsers;
    }

    _runTestsInBrowser(suiteCollection, browserId) {
        const runner = BrowserRunner.create(browserId, this.config, this._browserPool);

        this.passthroughEvent(runner, [
            Events.RETRY,
            Events.START_BROWSER,
            Events.STOP_BROWSER,
            Events.BEGIN_SUITE,
            Events.SKIP_STATE,
            Events.BEGIN_STATE,
            Events.END_STATE,
            Events.INFO,
            Events.WARNING,
            Events.ERROR
        ]);

        runner.on(Events.END_SUITE, (data) => this._suiteMonitor.suiteFinished(data.suite, data.browserId));

        runner.on(Events.CAPTURE, (result) => this._handleResult(result, Events.CAPTURE));
        runner.on(Events.TEST_RESULT, (result) => this._handleResult(result, [Events.END_TEST, Events.TEST_RESULT]));
        runner.on(Events.UPDATE_RESULT, (result) => this._handleResult(result, Events.UPDATE_RESULT));

        this._browserRunners.push(runner);
        return runner.run(suiteCollection, this._stateProcessor);
    }

    _handleResult(result, events) {
        this._saveCoverage(result);

        [].concat(events).forEach((event) => this.emit(event, result));
    }

    _saveCoverage(data) {
        if (this.coverage) {
            this.coverage.addStatsForBrowser(data.coverage, data.browserId);
        }
    }

    cancel() {
        this._browserRunners.forEach((runner) => runner.cancel());

        return this._browserPool.cancel();
    }
};
