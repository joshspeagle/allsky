/**
 * events - a minimal event emitter.
 */

export class Emitter {
    #handlers = new Map();  // event name -> array of callbacks

    /**
     * Registers a callback for an event, or a map of {name: callback}.
     * @returns {Function} a function that removes the registered callbacks.
     */
    on(name, callback) {
        if (typeof name === "object") {
            const removers = Object.entries(name).map(([n, c]) => this.on(n, c));
            return () => removers.forEach(remove => remove());
        }
        this.#handlers.set(name, (this.#handlers.get(name) || []).concat(callback));
        return () => this.#handlers.set(name, this.#handlers.get(name).filter(c => c !== callback));
    }

    /**
     * Calls the callbacks of an event with the given arguments, in the order they were registered.
     */
    trigger(name, ...args) {
        (this.#handlers.get(name) || []).forEach(callback => callback(...args));
        return this;
    }
}
