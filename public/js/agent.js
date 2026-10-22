/**
 * agent - runs tasks and holds the result of the most recently completed one.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import {Emitter} from "./events.js";

/**
 * An agent executes tasks and stores the result of the most recently completed task.
 *
 * A task is a function task(signal, ...args) that returns a value or a promise. After a task is submitted with
 * submit(), its result becomes the agent's value. Submitting a task, or calling cancel(), aborts the signal of
 * the earlier task; its result and errors are then ignored, and a long task should stop when signal.aborted
 * is true. Submissions made in the same event turn collapse into the last one.
 *
 * Agents emit "submit" when a task starts, "update" with the result when a task completes, and "reject" with
 * the error when a task fails. If an "update" handler throws, they emit "fail" with that error.
 */
export class Agent extends Emitter {
    #value;
    #controller = new AbortController();
    #timer;

    /**
     * @returns {Object} this agent's current value.
     */
    value() {
        return this.#value;
    }

    /**
     * Aborts the current task.
     */
    cancel() {
        this.#controller.abort();
    }

    /**
     * Submits a new task and the arguments to invoke it with, and aborts the previous task.
     * @returns this agent.
     */
    submit(task, ...args) {
        this.cancel();
        const signal = (this.#controller = new AbortController()).signal;
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.#run(signal, task, args), 0);
        return this;
    }

    #run(signal, task, args) {
        Promise.resolve()
            .then(() => signal.aborted ? null : task(signal, ...args))
            .then(result => {
                if (!signal.aborted) {
                    this.#value = result;
                    this.trigger("update", result);
                }
            }, err => {
                if (!signal.aborted) {  // a cancelled task's error is ignored
                    this.trigger("reject", err);
                }
            })
            .catch(err => this.trigger("fail", err));
        this.trigger("submit");
    }
}
