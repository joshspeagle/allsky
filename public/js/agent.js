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
 * @returns {Function} a cancel function for a task. Calling it sets its "requested" key to true.
 */
function newCancel() {
    const cancel = () => {
        cancel.requested = true;
    };
    cancel.requested = false;
    return cancel;
}

/**
 * An agent executes tasks and stores the result of the most recently completed task.
 *
 * A task is a value or promise, or a function that returns a value or promise. After submitting a task to
 * an agent using the submit() method, the task is evaluated and its result becomes the agent's value,
 * replacing the previous value. If a task is submitted to an agent while an earlier task is still in
 * progress, the earlier task is cancelled and its result ignored. Evaluation of a task may even be skipped
 * entirely if cancellation occurs early enough.
 *
 * Agents are event emitters. When a submitted task is accepted for invocation, a "submit" event is emitted
 * with the agent as its argument. When a task finishes and the agent's value changes, an "update" event is
 * emitted with (value, agent). If a task fails by throwing an exception or rejecting a promise, a "reject"
 * event with (err, agent) is emitted. If an event handler throws an error, a "fail" event with (err, agent)
 * is emitted.
 *
 * The current task can be cancelled by invoking agent.cancel(), and the cancel status is available as the
 * Boolean agent.cancel.requested. Within the task callback, "this" is the agent, so a task can know to abort
 * by checking this.cancel.requested.
 */
export class Agent extends Emitter {
    #value;
    #timer;

    constructor() {
        super();
        this.cancel = newCancel();
    }

    /**
     * @returns {Object} this agent's current value.
     */
    value() {
        return this.#value;
    }

    /**
     * Submits a new task and the arguments to invoke it with. The task may return a promise for asynchronous
     * work, and each argument may be a value or a promise. The previously submitted task, if any, is cancelled
     * at once. Submissions made in the same event turn collapse into the last one.
     * @returns this agent.
     */
    submit(task, ...args) {
        this.cancel();
        const cancel = this.cancel = newCancel();
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.#run(cancel, task, args), 0);
        return this;
    }

    #run(cancel, task, args) {
        const run = values => cancel.requested ? null : typeof task === "function" ? task.apply(this, values) : task;
        const accept = result => {
            if (!cancel.requested) {
                this.#value = result;
                this.trigger("update", result, this);
            }
        };
        const reject = err => {
            if (!cancel.requested) {  // a cancelled task's error is ignored
                this.trigger("reject", err, this);
            }
        };
        Promise.all(args).then(run).then(accept, reject).catch(err => this.trigger("fail", err, this));
        this.trigger("submit", this);
    }
}
