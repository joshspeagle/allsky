/**
 * events - a minimal event emitter, with the subset of the Backbone.Events API that allsky uses.
 */

export class Emitter {
    #handlers = new Map();      // event name -> array of callbacks
    #subscriptions = [];        // [emitter, name, callback] for each listenTo

    /**
     * Registers a callback for an event, or a map of {name: callback}. Returns this emitter.
     */
    on(name, callback) {
        if (typeof name === "object") {
            Object.entries(name).forEach(([n, c]) => this.on(n, c));
            return this;
        }
        if (!this.#handlers.has(name)) {
            this.#handlers.set(name, []);
        }
        this.#handlers.get(name).push(callback);
        return this;
    }

    off(name, callback) {
        const callbacks = this.#handlers.get(name);
        if (callbacks) {
            this.#handlers.set(name, callbacks.filter(c => c !== callback));
        }
        return this;
    }

    /**
     * Calls the callbacks of an event with the given arguments, in the order they were registered.
     */
    trigger(name, ...args) {
        (this.#handlers.get(name) || []).slice().forEach(callback => callback(...args));
        return this;
    }

    /**
     * Registers a callback (or a map of {name: callback}) on another emitter, so that stopListening can remove it.
     */
    listenTo(emitter, name, callback) {
        if (typeof name === "object") {
            Object.entries(name).forEach(([n, c]) => this.listenTo(emitter, n, c));
            return this;
        }
        emitter.on(name, callback);
        this.#subscriptions.push([emitter, name, callback]);
        return this;
    }

    /**
     * Removes every callback that this emitter registered with listenTo.
     */
    stopListening() {
        this.#subscriptions.forEach(([emitter, name, callback]) => emitter.off(name, callback));
        this.#subscriptions = [];
        return this;
    }
}
